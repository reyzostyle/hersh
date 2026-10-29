import SwiftUI
import Supabase

// The brain as Settings on chumoku.co shows it: the model's read of the
// channel, the creator's corrections kept beside it (brain_overrides, so the
// weekly rebuild never wipes them), and what their real retention adds up to.
nonisolated struct Brain: Decodable, Hashable {
    var summary: String?
    var niche: String?
    var format: String?
    var audience: String?
    var voice: String?
    var strengths: [String]?
    var watchOuts: [String]?
    var adaptRules: [String]?
    var source: String?

    enum CodingKeys: String, CodingKey {
        case summary, niche, format, audience, voice, strengths, source
        case watchOuts = "watch_outs"
        case adaptRules = "adapt_rules"
    }
}

// Same keys as the brain; only what was changed by hand is set.
nonisolated struct BrainOverrides: Codable, Hashable {
    var summary: String?
    var niche: String?
    var format: String?
    var audience: String?
    var voice: String?
    var strengths: [String]?
    var watchOuts: [String]?
    var adaptRules: [String]?

    enum CodingKeys: String, CodingKey {
        case summary, niche, format, audience, voice, strengths
        case watchOuts = "watch_outs"
        case adaptRules = "adapt_rules"
    }

    var isEmpty: Bool { self == BrainOverrides() }
}

nonisolated struct HeardVoice: Decodable, Hashable {
    let howTheyTalk: String?
    enum CodingKeys: String, CodingKey { case howTheyTalk = "how_they_talk" }
}

nonisolated struct RetentionLessons: Decodable, Hashable {
    nonisolated struct Lesson: Decodable, Hashable { let rule: String; let evidence: String }
    let summary: String?
    let lessons: [Lesson]
    let stayedMedian: Double?
    let videos: Int?
    let madeAt: String?

    enum CodingKeys: String, CodingKey {
        case summary, lessons, videos
        case stayedMedian = "stayed_median"
        case madeAt = "made_at"
    }
}

private enum Field: String, CaseIterable {
    case summary, niche, format, audience, voice, strengths, watchOuts, adaptRules

    var label: String {
        switch self {
        case .summary: "Summary"
        case .niche: "Niche"
        case .format: "Format"
        case .audience: "Audience"
        case .voice: "Voice"
        case .strengths: "What already works"
        case .watchOuts: "What we will not suggest"
        case .adaptRules: "How ideas get remade for you"
        }
    }
    var isList: Bool { self == .strengths || self == .watchOuts || self == .adaptRules }
    static let details: [Field] = [.niche, .format, .audience, .voice, .strengths, .watchOuts, .adaptRules]
}

struct BrainSection: View {
    let brain: Brain?
    let builtAt: String?
    let heardVoice: String?
    let lessons: RetentionLessons?
    @Binding var overrides: BrainOverrides
    let building: Bool
    let error: String?
    let onBuild: () -> Void

    @Environment(AuthModel.self) private var auth
    @State private var open = false
    @State private var editing = false
    @State private var saveError: String?

    var body: some View {
        if let brain {
            VStack(alignment: .leading, spacing: 14) {
                Text(text(.summary, brain)).font(.tBody).foregroundStyle(Color.text)
                    .fixedSize(horizontal: false, vertical: true)

                Button { withAnimation(.ui) { open.toggle() } } label: {
                    HStack(spacing: 6) {
                        Text(open ? "Hide details" : "Details")
                        Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                            .rotationEffect(.degrees(open ? 180 : 0))
                    }
                    .font(.geist(13, .medium)).foregroundStyle(Color.textMuted)
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.selection, trigger: open)

                if open {
                    ForEach(Field.details, id: \.self) { f in
                        if f.isList {
                            let items = list(f, brain)
                            if !items.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(f.label).font(.tLabel).foregroundStyle(Color.textMuted)
                                    ForEach(items, id: \.self) { x in
                                        HStack(alignment: .top, spacing: 8) {
                                            Text("-").foregroundStyle(Color.textFaint)
                                            Text(x).foregroundStyle(Color.text).fixedSize(horizontal: false, vertical: true)
                                        }
                                        .font(.tSmall)
                                    }
                                }
                            }
                        } else {
                            let v = text(f, brain)
                            if !v.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(f.label).font(.tLabel).foregroundStyle(Color.textMuted)
                                    Text(v).font(.tSmall).foregroundStyle(Color.text).fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                    }
                }

                Text(note(brain)).font(.tSmall).foregroundStyle(Color.textFaint)
                    .fixedSize(horizontal: false, vertical: true)

                if let e = error ?? saveError {
                    Text(e).font(.tSmall).foregroundStyle(Color.danger)
                }

                HStack(spacing: 8) {
                    Button("Edit") { saveError = nil; editing = true }
                        .buttonStyle(.pillSecondary)
                    Button { onBuild() } label: {
                        HStack(spacing: 8) {
                            if building { ProgressView().controlSize(.small).tint(Color.text) }
                            Text(building ? "Reading" : "Rebuild")
                        }
                    }
                    .buttonStyle(.pillSecondary)
                    .disabled(building)
                }
                if !overrides.isEmpty {
                    Button("Undo my edits") { Task { await save(BrainOverrides()) } }
                        .font(.geist(14, .medium)).foregroundStyle(Color.textMuted)
                        .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .sheet(isPresented: $editing) {
                BrainEditor(start: Dictionary(uniqueKeysWithValues: Field.allCases.map { f in
                    (f.rawValue, f.isList ? list(f, brain).joined(separator: "\n") : text(f, brain))
                })) { draft in
                    await save(overrides(from: draft, brain))
                }
            }

            if let lessons, !lessons.lessons.isEmpty {
                Rectangle().fill(Color.line).frame(height: 1).padding(.leading, 16)
                LessonsView(lessons: lessons)
            }
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text("Nothing here yet. Build it and every idea, outline and rewrite after that is written for your channel instead of for a generic one.")
                    .font(.tSmall).foregroundStyle(Color.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if let error { Text(error).font(.tSmall).foregroundStyle(Color.danger) }
                Button { onBuild() } label: {
                    HStack(spacing: 8) {
                        if building { ProgressView().controlSize(.small).tint(Color.bg) }
                        Text(building ? "Reading your channel" : "Build it")
                    }
                }
                .buttonStyle(.pill)
                .disabled(building)
            }
            .padding(16)
        }
    }

    // MARK: what is shown: the hand edit if there is one, else the read

    private func base(_ f: Field, _ b: Brain) -> String {
        switch f {
        case .summary: b.summary ?? ""
        case .niche: b.niche ?? ""
        case .format: b.format ?? ""
        case .audience: b.audience ?? ""
        // The voice heard in their Shorts beats the one-liner written from titles.
        case .voice: heardVoice ?? b.voice ?? ""
        default: ""
        }
    }

    private func baseList(_ f: Field, _ b: Brain) -> [String] {
        switch f {
        case .strengths: b.strengths ?? []
        case .watchOuts: b.watchOuts ?? []
        case .adaptRules: b.adaptRules ?? []
        default: []
        }
    }

    private func text(_ f: Field, _ b: Brain) -> String {
        let o: String? = switch f {
        case .summary: overrides.summary
        case .niche: overrides.niche
        case .format: overrides.format
        case .audience: overrides.audience
        case .voice: overrides.voice
        default: nil
        }
        if let o, !o.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return o }
        return base(f, b)
    }

    private func list(_ f: Field, _ b: Brain) -> [String] {
        let o: [String]? = switch f {
        case .strengths: overrides.strengths
        case .watchOuts: overrides.watchOuts
        case .adaptRules: overrides.adaptRules
        default: nil
        }
        if let o, !o.isEmpty { return o }
        return baseList(f, b)
    }

    private func note(_ b: Brain) -> String {
        var s = b.source == "uploads"
            ? "Updates itself every week from your uploads."
            : "Written from what you wrote. Connect your channel and this gets read off your real uploads instead."
        if !overrides.isEmpty { s += " Your edits stay." }
        if let builtAt, let d = ISO8601DateFormatter.flexible(builtAt) {
            s += " Last read \(d.formatted(.dateTime.month(.abbreviated).day()))."
        }
        return s
    }

    // Only fields that differ from the read become overrides, as on the web.
    private func overrides(from draft: [String: String], _ b: Brain) -> BrainOverrides {
        var next = BrainOverrides()
        func t(_ f: Field) -> String? {
            let v = (draft[f.rawValue] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return v.isEmpty || v == base(f, b).trimmingCharacters(in: .whitespacesAndNewlines) ? nil : v
        }
        func l(_ f: Field) -> [String]? {
            let v = (draft[f.rawValue] ?? "").split(separator: "\n")
                .map { $0.trimmingCharacters(in: .whitespaces).replacing(/^-\s*/, with: "") }
                .filter { !$0.isEmpty }
            return v.isEmpty || v == baseList(f, b) ? nil : v
        }
        next.summary = t(.summary)
        next.niche = t(.niche)
        next.format = t(.format)
        next.audience = t(.audience)
        next.voice = t(.voice)
        next.strengths = l(.strengths)
        next.watchOuts = l(.watchOuts)
        next.adaptRules = l(.adaptRules)
        return next
    }

    @discardableResult
    private func save(_ next: BrainOverrides) async -> Bool {
        guard let uid = auth.user?.id else { return false }
        nonisolated struct Patch: Encodable { let brain_overrides: BrainOverrides }
        do {
            try await supabase.from("user_tokens").update(Patch(brain_overrides: next)).eq("user_id", value: uid).execute()
            overrides = next
            saveError = nil
            return true
        } catch {
            saveError = "Could not save that. Try again."
            return false
        }
    }
}

private struct BrainEditor: View {
    @State var draft: [String: String]
    let onSave: ([String: String]) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var failed = false

    init(start: [String: String], onSave: @escaping ([String: String]) async -> Bool) {
        _draft = State(initialValue: start)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(Field.allCases, id: \.self) { f in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(f.label).font(.tLabel).foregroundStyle(Color.textMuted)
                            TextField("", text: Binding(get: { draft[f.rawValue] ?? "" }, set: { draft[f.rawValue] = $0 }), axis: .vertical)
                                .font(.tBody).foregroundStyle(Color.text)
                                .lineLimit(f == .niche ? 1...3 : 3...12)
                                .padding(14)
                                .background(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Color.raised))
                                .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
                            if f.isList {
                                Text("One per line.").font(.tSmall).foregroundStyle(Color.textFaint)
                            }
                        }
                    }
                    if failed {
                        Text("Could not save that. Try again.").font(.tSmall).foregroundStyle(Color.danger)
                    }
                }
                .padding(20)
            }
            .background(Color.bg.ignoresSafeArea())
            .navigationTitle("Chumoku brain")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            saving = true
                            let ok = await onSave(draft)
                            saving = false
                            if ok { dismiss() } else { failed = true }
                        }
                    } label: {
                        if saving { ProgressView() } else { Text("Save") }
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private struct LessonsView: View {
    let lessons: RetentionLessons
    @State private var open: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What your retention says").font(.tLabel).foregroundStyle(Color.textMuted)
            if let s = lessons.summary {
                Text(s).font(.tSmall).foregroundStyle(Color.text).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(lessons.lessons.enumerated()), id: \.offset) { i, l in
                Button { withAnimation(.ui) { open = open == i ? nil : i } } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .top, spacing: 8) {
                            Text("-").foregroundStyle(Color.textFaint)
                            Text(l.rule).foregroundStyle(Color.textMuted).multilineTextAlignment(.leading)
                        }
                        .font(.tSmall)
                        if open == i {
                            Text(l.evidence).font(.geist(12)).foregroundStyle(Color.textFaint)
                                .padding(.leading, 16).multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Text(footer).font(.geist(12)).foregroundStyle(Color.textFaint)
        }
        .padding(16)
    }

    private var footer: String {
        var s = "From \(lessons.videos ?? lessons.lessons.count) of your Shorts."
        if let m = lessons.stayedMedian { s += " Usually \(Int(m.rounded()))% stay past the first seconds." }
        if let at = lessons.madeAt, let d = ISO8601DateFormatter.flexible(at) {
            s += " Updated \(d.formatted(.dateTime.month(.abbreviated).day()))."
        }
        return s
    }
}

extension ISO8601DateFormatter {
    // Postgres timestamps come with or without fractional seconds.
    nonisolated static func flexible(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}
