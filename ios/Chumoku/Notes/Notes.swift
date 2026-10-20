import SwiftUI
import AVFoundation
import AppIntents
import Supabase

// Ideas you have yourself, caught the moment they come: typed, or spoken
// (from the app, Siri, or a Shortcut on the Lock Screen). Each keeps the full
// text and a one-line gist the model writes. Stored on this iPhone.
nonisolated struct Note: Codable, Identifiable, Hashable, Sendable {
    var id = UUID().uuidString
    var text: String
    var gist: String?
    var createdAt = Date()
}

@Observable
final class NotesStore {
    static let shared = NotesStore()
    private(set) var notes: [Note] = []
    var recordNow = false // set by the "Record an idea" intent

    nonisolated static var file: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("notes.json")
    }

    init() { reload() }

    func reload() {
        if let data = try? Data(contentsOf: Self.file), let list = try? JSONDecoder().decode([Note].self, from: data) {
            notes = list.sorted { $0.createdAt > $1.createdAt }
        }
    }

    @discardableResult
    func add(_ text: String) -> Note {
        let note = Note(text: text.trimmingCharacters(in: .whitespacesAndNewlines))
        notes.insert(note, at: 0)
        save()
        Task { await summarize(note) }
        return note
    }

    func delete(_ note: Note) {
        notes.removeAll { $0.id == note.id }
        save()
    }

    func summarize(_ note: Note) async {
        guard note.gist == nil, note.text.count > 40 else { return }
        nonisolated struct Gist: Decodable { let gist: String }
        guard let g: Gist = try? await supabase.functions.invoke("note-gist", options: FunctionInvokeOptions(body: ["text": note.text])) else { return }
        if let i = notes.firstIndex(where: { $0.id == note.id }) {
            notes[i].gist = g.gist
            save()
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(notes) { try? data.write(to: Self.file, options: .atomic) }
    }
}

// MARK: - Siri and Shortcuts

// "Add an idea in Chumoku": typed or dictated into the Shortcut, saved without
// opening the app.
struct AddIdeaIntent: AppIntent {
    static let title: LocalizedStringResource = "Add an idea"
    static let description = IntentDescription("Save an idea to Chumoku without opening it.")
    @Parameter(title: "Idea", requestValueDialog: "What's the idea?") var text: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        NotesStore.shared.add(text)
        return .result(dialog: "Saved to Chumoku.")
    }
}

// "Record an idea": opens Chumoku straight into the voice recorder.
struct RecordIdeaIntent: AppIntent {
    static let title: LocalizedStringResource = "Record an idea"
    static let description = IntentDescription("Open Chumoku and start recording a voice note.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NotesStore.shared.recordNow = true
        return .result()
    }
}

struct ChumokuShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: RecordIdeaIntent(), phrases: ["Record an idea in \(.applicationName)", "\(.applicationName) idea"],
                    shortTitle: "Record an idea", systemImageName: "mic.fill")
        AppShortcut(intent: AddIdeaIntent(), phrases: ["Add an idea to \(.applicationName)", "Save an idea in \(.applicationName)"],
                    shortTitle: "Add an idea", systemImageName: "lightbulb")
    }
}

// MARK: - voice

@Observable
final class VoiceNote {
    enum State: Equatable { case idle, recording, transcribing, failed(String) }
    var state: State = .idle
    var level: Float = 0
    var started: Date?
    private var recorder: AVAudioRecorder?
    private var meter: Timer?

    func start() async {
        guard await AVAudioApplication.requestRecordPermission() else { state = .failed("Allow the microphone for Chumoku in Settings."); return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker])
        try? session.setActive(true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("note-\(UUID().uuidString.prefix(6)).m4a")
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1]
        guard let r = try? AVAudioRecorder(url: url, settings: settings) else { state = .failed("Could not start recording."); return }
        r.isMeteringEnabled = true
        r.record()
        recorder = r
        started = .now
        state = .recording
        meter = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let r = self.recorder else { return }
                r.updateMeters()
                self.level = max(0, min(1, (r.averagePower(forChannel: 0) + 50) / 50))
            }
        }
    }

    // Stops, transcribes on the phone, and returns the text.
    func stop() async -> String? {
        meter?.invalidate()
        guard let r = recorder else { return nil }
        r.stop()
        recorder = nil
        state = .transcribing
        defer { try? FileManager.default.removeItem(at: r.url) }
        do {
            let heard = try await Listener.heard(r.url) { _ in }
            try? FileManager.default.removeItem(at: Listener.cacheURL(for: r.url))
            state = .idle
            let text = heard.words.map(\.text).joined(separator: " ")
            return text.isEmpty ? nil : text
        } catch {
            state = .failed(error.localizedDescription)
            return nil
        }
    }
}

// MARK: - screens

struct NotesView: View {
    @Environment(NotesStore.self) private var notes
    @Environment(FilmStore.self) private var films
    @State private var draft = ""
    @State private var recording = false
    @State private var filming: Shoot?
    @State private var showHelp = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                TextField("", text: $draft, prompt: Text("Write an idea").foregroundStyle(Color.textFaint), axis: .vertical)
                    .lineLimit(1...4)
                    .font(.geist(15))
                    .foregroundStyle(Color.text)
                    .padding(.horizontal, 18).padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.raised))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
                if draft.trimmingCharacters(in: .whitespaces).isEmpty {
                    circle("mic.fill") { recording = true }
                } else {
                    circle("arrow.up") { notes.add(draft); draft = "" }
                }
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: notes.notes.count)

            Button { showHelp = true } label: {
                Label("Put this on your Lock Screen", systemImage: "lock.iphone")
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }

            if notes.notes.isEmpty {
                Empty(text: "Ideas you have yourself land here. Speak one, it gets written down and boiled to one line.")
            }
            ForEach(notes.notes) { note in
                VStack(alignment: .leading, spacing: 8) {
                    if let gist = note.gist { Text(gist).font(.geist(15, .medium)).foregroundStyle(Color.text) }
                    Text(note.text).font(.tSmall).foregroundStyle(note.gist == nil ? Color.text : Color.textMuted).lineLimit(note.gist == nil ? nil : 4)
                    HStack {
                        Text(note.createdAt.formatted(date: .abbreviated, time: .shortened)).font(.geist(11)).foregroundStyle(Color.textFaint)
                        Spacer()
                        Button("Film this") { filming = films.create(title: note.gist ?? String(note.text.prefix(50)), script: note.text) }
                            .font(.geist(13, .medium)).foregroundStyle(Color.text)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
                .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
                .contextMenu {
                    Button("Copy", systemImage: "doc.on.doc") { UIPasteboard.general.string = note.text }
                    Button("Delete", systemImage: "trash", role: .destructive) { notes.delete(note) }
                }
            }
        }
        .sheet(isPresented: $recording) { RecorderSheet().presentationDetents([.height(320)]) }
        .sheet(isPresented: $showHelp) { LockScreenHelp().presentationDetents([.medium]) }
        .fullScreenCover(item: $filming) { shoot in FilmView(shootId: shoot.id) }
        .onChange(of: notes.recordNow) { _, now in if now { notes.recordNow = false; recording = true } }
        .onAppear { if notes.recordNow { notes.recordNow = false; recording = true } }
    }

    private func circle(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.bg)
                .frame(width: 52, height: 52).background(Circle().fill(Color.white))
        }
        .buttonStyle(.plain)
    }
}

// Starts listening the moment it opens: the whole point is not losing the thought.
struct RecorderSheet: View {
    @Environment(NotesStore.self) private var notes
    @Environment(\.dismiss) private var dismiss
    @State private var voice = VoiceNote()

    var body: some View {
        VStack(spacing: 22) {
            Text(title).font(.tHeading).foregroundStyle(Color.text).padding(.top, 28)
            if let s = voice.started, voice.state == .recording {
                TimelineView(.periodic(from: s, by: 1)) { ctx in
                    let t = Int(ctx.date.timeIntervalSince(s))
                    Text(String(format: "%d:%02d", t / 60, t % 60)).font(.geist(14, .medium)).monospacedDigit().foregroundStyle(Color.textMuted)
                }
            }
            Button {
                Task {
                    if let text = await voice.stop() { notes.add(text) }
                    if case .failed = voice.state { return }
                    dismiss()
                }
            } label: {
                ZStack {
                    Circle().fill(Color.red.opacity(0.18)).frame(width: 96 + CGFloat(voice.level) * 40, height: 96 + CGFloat(voice.level) * 40)
                    Circle().fill(Color.red).frame(width: 76, height: 76)
                    RoundedRectangle(cornerRadius: 6).fill(.white).frame(width: 24, height: 24)
                }
                .animation(.easeOut(duration: 0.08), value: voice.level)
            }
            .buttonStyle(.plain)
            .disabled(voice.state != .recording)
            .sensoryFeedback(.impact(weight: .heavy), trigger: voice.state)
            if case .failed(let m) = voice.state { Text(m).font(.tSmall).foregroundStyle(Color.danger).multilineTextAlignment(.center) }
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .background(Color.bg.ignoresSafeArea())
        .task { await voice.start() }
    }

    private var title: String {
        switch voice.state {
        case .recording: "Listening"
        case .transcribing: "Writing it down…"
        default: "Speak your idea"
        }
    }
}

struct LockScreenHelp: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("One tap from the Lock Screen").font(.tHeading).foregroundStyle(Color.text)
            step(1, "Long-press the Lock Screen, tap Customise, then Lock Screen.")
            step(2, "Tap one of the two buttons at the bottom (the torch or camera) and remove it.")
            step(3, "Tap +, search Shortcuts, choose Shortcut, then pick Chumoku → Record an idea.")
            step(4, "Or say \"Chumoku idea\" to Siri. Both open straight into recording.")
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bg.ignoresSafeArea())
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)").font(.geist(12, .semibold)).foregroundStyle(Color.textMuted)
                .frame(width: 24, height: 24).background(Circle().fill(Color.white.opacity(0.08)))
            Text(text).font(.tBody).foregroundStyle(Color.text)
        }
    }
}
