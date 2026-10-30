import SwiftUI

// The Saved tab, as on chumoku.co: every idea they kept, newest first, the
// ones with a script marked. A tap opens the idea where they left it.
struct SavedView: View {
    @Environment(IdeasStore.self) private var store
    @State private var path: [Idea] = []
    @State private var loaded = false

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Saved").font(.tTitle).foregroundStyle(Color.text).padding(.top, 8).padding(.bottom, 14)
                    if !loaded && store.saved.isEmpty {
                        ForEach(0..<4, id: \.self) { _ in Skeleton(cornerRadius: Radius.md).frame(height: 76) }
                    } else if store.saved.isEmpty {
                        Empty(text: String(localized: "Nothing saved yet. Save an idea and it lands here."))
                            .padding(.top, 60)
                    } else {
                        ForEach(store.saved) { idea in
                            Button { path.append(idea) } label: { row(idea) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
            .contentMargins(.bottom, 96, for: .scrollContent)
            .scrollEdgeEffectStyle(.soft, for: .bottom)
            .background(Color.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Idea.self) { IdeaDetailView(idea: $0) }
            .refreshable { await store.loadSaved() }
        }
        .task { await store.loadSaved(); loaded = true }
    }

    private func row(_ idea: Idea) -> some View {
        HStack(spacing: 14) {
            Group {
                // An AI idea's cover is a quote, unreadable this small.
                if idea.isOwn {
                    Image(systemName: "sparkles").font(.system(size: 18)).foregroundStyle(Color.textMuted)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.white.opacity(0.05))
                } else {
                    IdeaCover(idea: idea, radius: 10)
                }
            }
            .frame(width: 48, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(idea.headline).font(.tBody).foregroundStyle(Color.text).lineLimit(2).multilineTextAlignment(.leading)
                HStack(spacing: 6) {
                    if idea.script != nil {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 12)).foregroundStyle(Color.process)
                        Text("Script ready").foregroundStyle(Color.textMuted)
                    } else {
                        Text(verbatim: idea.cardMeta).foregroundStyle(Color.textFaint)
                    }
                }
                .font(.tSmall).lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.textFaint)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .contentShape(Rectangle())
    }
}
