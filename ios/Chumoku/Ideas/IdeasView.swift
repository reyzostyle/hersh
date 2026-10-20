import SwiftUI

struct IdeasView: View {
    @Environment(IdeasStore.self) private var store
    @Environment(NotesStore.self) private var notes
    enum Tab: Hashable { case today, saved, notes }
    @State private var tab: Tab = .today
    @State private var path = NavigationPath()
    @AppStorage("ideas.swipe") private var swipe = false

    private let columns = [GridItem(.flexible(), spacing: 12, alignment: .top), GridItem(.flexible(), spacing: 12, alignment: .top)]

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Ideas").font(.tTitle).foregroundStyle(Color.text)
                        Spacer()
                        Seg(options: [(Tab.today, "Today"), (Tab.saved, "Saved"), (Tab.notes, "Notes")], value: $tab)
                    }
                    .padding(.top, 8)

                    if tab == .today, !store.today.isEmpty {
                        HStack {
                            if let next = store.nextAt { Countdown(until: next) }
                            Spacer()
                            // Grid or one at a time.
                            Button { withAnimation(.ui) { swipe.toggle() } } label: {
                                Image(systemName: swipe ? "square.grid.2x2" : "rectangle.stack")
                                    .font(.system(size: 15, weight: .medium)).foregroundStyle(Color.text)
                                    .frame(width: 36, height: 36).background(Circle().fill(Color.white.opacity(0.08)))
                            }
                            .sensoryFeedback(.selection, trigger: swipe)
                        }
                        .padding(.top, 10)
                    }

                    Group {
                        if tab == .notes { NotesView() }
                        else if tab == .today && swipe && !store.today.isEmpty { SwipeStack { path.append($0) } }
                        else { content }
                    }
                    .padding(.top, 20)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .refreshable { await reload() }
            .background(Color.bg.ignoresSafeArea())
            .navigationDestination(for: Idea.self) { idea in
                IdeaDetailView(idea: idea)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await store.loadToday() }
        .onChange(of: notes.recordNow) { _, now in if now { path = NavigationPath(); tab = .notes } }
        .onAppear { if notes.recordNow { tab = .notes } }
        .task(id: tab) { if tab == .saved { await store.loadSaved() } }
    }

    @ViewBuilder private var content: some View {
        let list = tab == .today ? store.today : store.saved
        let loading = tab == .today ? store.loadingToday : store.loadingSaved
        if loading && list.isEmpty {
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(0..<4, id: \.self) { _ in Skeleton().aspectRatio(0.62, contentMode: .fit) }
            }
        } else if list.isEmpty {
            Empty(text: emptyText)
        } else {
            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(list) { idea in
                    NavigationLink(value: idea) { IdeaCard(idea: idea).contentShape(Rectangle()) }
                        .buttonStyle(.plain)
                }
            }
        }
        if let error = store.error {
            Text(error).font(.tSmall).foregroundStyle(Color.danger).padding(.top, 16)
        }
    }

    private var emptyText: String {
        if tab == .saved { return "Nothing saved yet. Save an idea and it lands here." }
        if store.needsProfile { return "Connect your YouTube channel on chumoku.co so Chumoku knows what to look for." }
        return "No ideas yet today. Pull to check again."
    }

    private func reload() async {
        if tab == .today { await store.loadToday() } else { await store.loadSaved() }
    }
}

struct IdeaCard: View {
    let idea: Idea

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Thumb(url: idea.thumbnailURL)
                .aspectRatio(4 / 5, contentMode: .fit)
                .overlay(alignment: .topLeading) {
                    if let badge = idea.outlierBadge {
                        Text(badge)
                            .font(.geist(12, .semibold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Capsule().fill(.white))
                            .padding(8)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if idea.liked == true {
                        Image(systemName: "bookmark.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color.text)
                            .padding(7)
                            .background(Circle().fill(.black.opacity(0.55)))
                            .padding(8)
                    }
                }
                .opacity(idea.liked == false ? 0.4 : 1)
            Text(idea.headline)
                .font(.geist(14, .medium))
                .foregroundStyle(Color.text)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
            if !idea.meta.isEmpty {
                Text(idea.meta).font(.geist(12)).foregroundStyle(Color.textFaint).lineLimit(1)
            }
        }
    }
}

// A Short's thumbnail arrives letterboxed in 16:9; scaling it up crops the
// bars away, the same trick the web cards use.
struct Thumb: View {
    let url: URL?
    var radius: CGFloat = Radius.md

    var body: some View {
        Color.raised
            .overlay {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill().scaleEffect(1.35)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }
}

struct Empty: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.tSmall)
            .foregroundStyle(Color.textMuted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.vertical, 48)
            .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
            .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }
}

// "New ideas in 5h · unsaved ones disappear", ticking down.
struct Countdown: View {
    let until: Date
    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { ctx in
            let s = max(0, Int(until.timeIntervalSince(ctx.date)))
            let left = s >= 3600 ? "\(s / 3600)h" : "\(max(1, s / 60))m"
            Text("New ideas in \(left) · unsaved ones disappear")
                .font(.tSmall)
                .foregroundStyle(Color.textFaint)
        }
    }
}
