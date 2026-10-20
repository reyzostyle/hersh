import SwiftUI

struct IdeaDetailView: View {
    @Environment(IdeasStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let idea: Idea

    // The store holds the live row; the one passed in may already be stale.
    private var current: Idea {
        store.today.first { $0.id == idea.id } ?? store.saved.first { $0.id == idea.id } ?? idea
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Button { if let u = current.shortsURL { openURL(u) } } label: {
                    Thumb(url: current.thumbnailURL, radius: Radius.lg)
                        .aspectRatio(4 / 5, contentMode: .fit)
                        .frame(maxWidth: 260)
                        .overlay {
                            Image(systemName: "play.fill")
                                .font(.system(size: 20))
                                .foregroundStyle(.white)
                                .frame(width: 52, height: 52)
                                .background(Circle().fill(.black.opacity(0.45)))
                        }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)

                // The pitch is the title here; the hook gets its own block
                // below, so it is never said twice on one screen.
                Text(current.pitch ?? current.videoTitle ?? current.headline)
                    .font(.tHeading)
                    .foregroundStyle(Color.text)
                    .padding(.top, 24)

                if let src = sourceLine {
                    Text(src).font(.tSmall).foregroundStyle(Color.textFaint).padding(.top, 8)
                }

                if let outline = current.outline {
                    VStack(alignment: .leading, spacing: 18) {
                        Block(label: "Hook", text: outline.hook)
                        ForEach(Array(outline.sections.enumerated()), id: \.offset) { _, s in
                            Block(label: s.title, text: s.content)
                        }
                        Block(label: "End", text: outline.cta)
                    }
                    .padding(.top, 28)
                } else if let concept = current.concept ?? current.adaptedIdea {
                    Text(concept).font(.tBody).foregroundStyle(Color.textMuted).padding(.top, 16)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
        .background(Color.bg.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 10) {
                Button(current.liked == false ? "Dismissed" : "Dismiss") {
                    Task { await store.rule(current, liked: current.liked == false ? nil : false); if current.liked == false { dismiss() } }
                }
                .buttonStyle(.pillGhost)
                Button(current.liked == true ? "Saved" : "Save") {
                    Task { await store.rule(current, liked: current.liked == true ? nil : true) }
                }
                .buttonStyle(.pill)
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
        .toolbar(.hidden, for: .tabBar)
        .toolbarBackground(Color.bg, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var sourceLine: String? {
        let parts = [current.channelName, current.meta.isEmpty ? nil : current.meta].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
