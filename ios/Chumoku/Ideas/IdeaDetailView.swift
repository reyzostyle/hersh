import SwiftUI

// One idea, as the same three steps the web page has: the angle (what your
// version is), the outline (what to say), then film it.
struct IdeaDetailView: View {
    @Environment(IdeasStore.self) private var store
    @Environment(FilmStore.self) private var films
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

                StepCard(n: 1, title: "Your angle", done: current.adaptedIdea != nil) {
                    if let angle = current.adaptedIdea {
                        Text(angle).font(.tBody).foregroundStyle(Color.text).lineSpacing(3)
                        if let concept = current.concept {
                            Button { withAnimation(.ui) { showWhy.toggle() } } label: {
                                HStack(spacing: 4) {
                                    Text("Why the original worked")
                                    Image(systemName: "chevron.down").rotationEffect(.degrees(showWhy ? 180 : 0))
                                }
                                .font(.tSmall).foregroundStyle(Color.textFaint)
                            }
                            .padding(.top, 12)
                            if showWhy {
                                Text(concept).font(.tSmall).foregroundStyle(Color.textMuted).padding(.top, 6).transition(.opacity)
                            }
                        }
                    } else if step == .angle {
                        Working(label: "Reading the video")
                    } else {
                        Button("Reveal the angle · 1 credit") { act { await store.revealAngle(current) } }
                            .buttonStyle(.pill)
                    }
                }
                .padding(.top, 28)

                StepCard(n: 2, title: "Outline", done: current.outline != nil, dim: current.adaptedIdea == nil) {
                    if let outline = current.outline {
                        VStack(alignment: .leading, spacing: 16) {
                            Block(label: "Hook", text: outline.hook)
                            ForEach(Array(outline.sections.enumerated()), id: \.offset) { _, s in
                                Block(label: [s.title, s.duration].compactMap { $0 }.joined(separator: " · "), text: s.content)
                            }
                            Block(label: "End", text: outline.cta)
                        }
                    } else if step == .outline {
                        Working(label: "Watching it frame by frame")
                    } else if current.adaptedIdea != nil {
                        Button("Build the outline · 4 credits") { act { await store.buildOutline(current) } }
                            .buttonStyle(.pill)
                    } else {
                        Label("Reveal the angle first", systemImage: "lock").font(.tSmall).foregroundStyle(Color.textFaint)
                    }
                }
                .padding(.top, 12)

                StepCard(n: 3, title: "Script", done: current.script != nil, dim: current.outline == nil) {
                    if let script = current.script {
                        Text(script).font(.tBody).foregroundStyle(Color.text).lineSpacing(5)
                        Button("Rewrite · 1 credit") { act { await store.writeScript(current) } }
                            .font(.tSmall).foregroundStyle(Color.textFaint).padding(.top, 8)
                    } else if step == .script {
                        Working(label: "Writing what you'll say")
                    } else if current.outline != nil {
                        Text("The outline says what happens. This writes the words you say on camera, for the prompter.")
                            .font(.tSmall).foregroundStyle(Color.textMuted)
                        Button("Write the script · 1 credit") { act { await store.writeScript(current) } }
                            .buttonStyle(.pill)
                    } else {
                        Label("Build the outline first", systemImage: "lock").font(.tSmall).foregroundStyle(Color.textFaint)
                    }
                }
                .padding(.top, 12)
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { if let u = current.shortsURL { openURL(u) } } label: {
                Thumb(url: current.thumbnailURL, radius: Radius.lg)
                    .aspectRatio(4 / 5, contentMode: .fit)
                    .frame(maxWidth: 230)
                    .overlay {
                        Image(systemName: "play.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(.white)
                            .frame(width: 50, height: 50)
                            .background(Circle().fill(.black.opacity(0.45)))
                    }
                    .overlay(alignment: .topLeading) {
                        if let badge = current.outlierBadge {
                            Text(badge).font(.geist(13, .semibold)).foregroundStyle(.black)
                                .padding(.horizontal, 9).padding(.vertical, 4)
                                .background(Capsule().fill(.white)).padding(10)
                        }
                    }
            }
            .buttonStyle(.plain)
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
            iconButton(current.liked == true ? "bookmark.fill" : "bookmark", on: current.liked == true) {
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
        let parts = [current.channelName, current.meta.isEmpty ? nil : current.meta].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

private struct StepCard<Content: View>: View {
    let n: Int
    let title: String
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
    let label: String
    @State private var on = false
    var body: some View {
        Text(label + "…")
            .font(.tSmall)
            .foregroundStyle(Color.textMuted)
            .opacity(on ? 1 : 0.45)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
    }
}
