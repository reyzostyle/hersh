import SwiftUI

// One idea, as the same three steps the web page has: the angle (what your
// version is), the outline (what to say), then the script. An idea Chumoku
// found itself has no video to read, so it is two: the idea, then the script.
struct IdeaDetailView: View {
    @Environment(IdeasStore.self) private var store
    @Environment(FilmStore.self) private var films
    @Environment(ChatStore.self) private var chat
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let idea: Idea
    @State private var filming: Shoot?
    @State private var error: String?
    @State private var showWhy = false

    private var current: Idea { store.live(idea) }
    private var step: IdeasStore.Step? { store.working[current.id] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if let error {
                    Text(error).font(.tSmall).foregroundStyle(Color.danger).padding(.top, 16)
                }

                if current.isOwn { ownSteps } else { videoSteps }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
        .background(Color.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { actionBar }
        .toolbar(.hidden, for: .tabBar)
        .toolbarBackground(Color.bg, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $filming) { shoot in FilmView(shootId: shoot.id) }
        .animation(.ui, value: current)
        .animation(.ui, value: step)
    }

    // An idea Chumoku found: what it is and why, then the words to say.
    @ViewBuilder private var ownSteps: some View {
        StepCard(n: 1, title: "The idea", done: true) {
            if let premise = current.adaptedIdea {
                Text(premise).font(.tBody).foregroundStyle(Color.text).lineSpacing(3)
            }
            if let why = whyLine {
                Text(why).font(.tSmall).foregroundStyle(Color.textMuted).padding(.top, 4)
            }
        }
        .padding(.top, 28)
        scriptStep(n: 2)
            .padding(.top, 12)
    }

    private var whyLine: String? {
        guard let b = current.basis else { return nil }
        var parts: [String] = []
        if b.isRemix, let t = b.title {
            parts.append("Built on your “\(t)”" + (b.multiple.map { $0 >= 1.2 ? ", \(String(format: "%.1f", $0).replacingOccurrences(of: ".0", with: ""))× your usual views" : "" } ?? "") + ".")
        } else if let s = b.source, !s.isEmpty {
            parts.append("Based on \(s).")
        }
        if let w = b.why, !w.isEmpty { parts.append(w.hasSuffix(".") ? w : w + ".") }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    // An idea from a Short: just the script. The reading and watching happen
    // inside the one call (write-script), not as steps to unlock.
    @ViewBuilder private var videoSteps: some View {
        scriptStep(n: 1)
            .padding(.top, 28)
    }

    // One press from the idea to the words to say (2026-10-28, was angle ->
    // outline -> script at 1 + 4 + 1). Then the chat, to argue with it.
    private func scriptStep(n: Int) -> some View {
        StepCard(n: n, title: "Script", done: current.script != nil) {
            if let script = current.script {
                let lines = script.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Hook").font(.tLabel).foregroundStyle(Color.textMuted)
                    Text(lines.first ?? "").font(.tHeading).foregroundStyle(Color.text)
                }
                Text(lines.dropFirst().joined(separator: "\n"))
                    .font(.tBody).foregroundStyle(Color.text).lineSpacing(5).textSelection(.enabled)
                    .padding(.top, 6)
                if let concept = current.concept, !current.isOwn {
                    Button { withAnimation(.ui) { showWhy.toggle() } } label: {
                        HStack(spacing: 4) {
                            Text("Why the original worked")
                            Image(systemName: "chevron.down").rotationEffect(.degrees(showWhy ? 180 : 0))
                        }
                        .font(.tSmall).foregroundStyle(Color.textFaint)
                    }
                    .padding(.top, 4)
                    if showWhy {
                        Text(concept).font(.tSmall).foregroundStyle(Color.textMuted).transition(.opacity)
                    }
                }
                Button("Continue in Chat") { continueInChat() }
                    .buttonStyle(.pill)
                    .padding(.top, 8)
                ShareLink(item: script) { Text("Share") }
                    .font(.tSmall).foregroundStyle(Color.textMuted)
                    .frame(maxWidth: .infinity)
            } else if step == .script {
                Working(label: current.isOwn ? "Writing it in your voice" : "Watching the video and writing it in your voice")
            } else {
                Button("Write my script · \(IdeasStore.scriptCost) credits") { act { await store.writeScript(current) } }
                    .buttonStyle(.pill)
            }
        }
    }

    // The chat, on this idea and its script, with a first line waiting in
    // the box: opening it costs nothing. Keeps the idea, as the web does.
    private func continueInChat() {
        if current.liked != true { Task { await store.rule(current, liked: true) } }
        chat.pending = ("Make the hook of this script hit harder.", current.id)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { if let u = current.shortsURL { openURL(u) } } label: {
                IdeaCover(idea: current, radius: Radius.lg)
                    .aspectRatio(4 / 5, contentMode: .fit)
                    .frame(maxWidth: 230)
                    .overlay {
                        if !current.isOwn {
                            Image(systemName: "play.fill")
                                .font(.system(size: 18))
                                .foregroundStyle(.white)
                                .frame(width: 50, height: 50)
                                .background(Circle().fill(.black.opacity(0.45)))
                        }
                    }
            }
            .buttonStyle(.plain)
            .allowsHitTesting(!current.isOwn)
            .frame(maxWidth: .infinity)

            Text(current.pitch ?? current.videoTitle ?? current.headline)
                .font(.tHeading)
                .foregroundStyle(Color.text)
                .padding(.top, 24)

            if let src = sourceLine {
                Text(src).font(.tSmall).foregroundStyle(Color.textFaint).padding(.top, 8)
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            // Dismiss and Save as icons, so filming is the one wide action.
            iconButton(current.liked == false ? "xmark.circle.fill" : "xmark", on: current.liked == false) {
                Task { await store.rule(current, liked: current.liked == false ? nil : false); if current.liked == false { dismiss() } }
            }
            if !Features.filming {
                // Ideas only: saving is the wide action.
                Button(current.liked == true ? "Saved" : "Save") {
                    Task { await store.rule(current, liked: current.liked == true ? nil : true) }
                }
                .buttonStyle(PillButtonStyle(kind: current.liked == true ? .primary : .secondary))
                .sensoryFeedback(.selection, trigger: current.liked == true)
            } else {
            iconButton(current.liked == true ? "heart.fill" : "heart", on: current.liked == true) {
                Task { await store.rule(current, liked: current.liked == true ? nil : true) }
            }
            Button("Film this") {
                // Filming an idea keeps it, the same as saving it.
                if current.liked != true { Task { await store.rule(current, liked: true) } }
                filming = films.create(title: current.outline?.hook ?? current.headline, script: current.filmScript, ideaId: current.id)
            }
            // One white pill per screen: filming takes it once there is a
            // script; before that the next step above has it.
            .buttonStyle(PillButtonStyle(kind: current.script != nil ? .primary : .secondary))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background {
            Color.bg
                .overlay(alignment: .top) {
                    LinearGradient(colors: [Color.bg.opacity(0), Color.bg], startPoint: .top, endPoint: .bottom)
                        .frame(height: 28)
                        .offset(y: -28)
                }
                .ignoresSafeArea()
        }
    }

    private func act(_ work: @escaping () async -> String?) {
        error = nil
        Task { error = await work() }
    }

    private func iconButton(_ icon: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Color.text)
                .frame(width: 48, height: 48)
                .background(Circle().fill(on ? Color.white.opacity(0.16) : Color.white.opacity(0.08)))
        }
        .sensoryFeedback(.selection, trigger: on)
    }

    private var sourceLine: String? {
        if current.isOwn { return current.ownLabel }
        let parts = [current.channelName, current.meta.isEmpty ? nil : current.meta].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

private struct StepCard<Content: View>: View {
    let n: Int
    let title: LocalizedStringKey
    var done = false
    var dim = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(done ? Color.white : Color.white.opacity(0.08))
                    if done {
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.black)
                    } else {
                        Text("\(n)").font(.geist(12, .semibold)).foregroundStyle(Color.textMuted)
                    }
                }
                .frame(width: 24, height: 24)
                Text(title).font(.geist(15, .medium)).foregroundStyle(Color.text)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .opacity(dim ? 0.55 : 1)
    }
}

private struct Block: View {
    let label: String
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.tLabel).foregroundStyle(Color.textMuted)
            Text(text).font(.tBody).foregroundStyle(Color.text).lineSpacing(3)
        }
    }
}

// What is running, said in words, with the text pulsing instead of a spinner.
struct Working: View {
    let label: LocalizedStringKey
    @State private var on = false
    var body: some View {
        (Text(label) + Text(verbatim: "…"))
            .font(.tSmall)
            .foregroundStyle(Color.textMuted)
            .opacity(on ? 1 : 0.45)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
    }
}
