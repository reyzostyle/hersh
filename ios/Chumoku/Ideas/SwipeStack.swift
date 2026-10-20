import SwiftUI

// Today's ideas one at a time: right keeps it, left throws it away, a tap
// opens it. The card tilts with your thumb and a tick of haptics says when
// letting go will count.
struct SwipeStack: View {
    @Environment(IdeasStore.self) private var store
    let open: (Idea) -> Void
    @State private var drag: CGSize = .zero
    @State private var flying: (id: String, dx: CGFloat)?
    @State private var armed = 0 // -1 dismiss, 1 save
    @State private var decided = 0

    private var deck: [Idea] { store.today.filter { $0.liked == nil } }

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                if deck.isEmpty {
                    Empty(text: "That's today's lot. Saved ones are in Saved.")
                } else {
                    ForEach(Array(deck.prefix(3).enumerated().reversed()), id: \.element.id) { i, idea in
                        card(idea, depth: i)
                    }
                }
            }
            .frame(height: 470)

            if !deck.isEmpty {
                HStack(spacing: 28) {
                    round("xmark", tint: Color.textMuted) { commit(-1) }
                    round("arrow.up.right", tint: Color.textMuted, small: true) { if let top = deck.first { open(top) } }
                    round("bookmark.fill", tint: Color.bg, fill: .white) { commit(1) }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .sensoryFeedback(.selection, trigger: armed)
        .sensoryFeedback(.impact(weight: .medium), trigger: decided)
    }

    private func card(_ idea: Idea, depth: Int) -> some View {
        let top = depth == 0
        let dx = top ? (flying?.id == idea.id ? flying!.dx : drag.width) : 0
        return VStack(alignment: .leading, spacing: 10) {
            Thumb(url: idea.thumbnailURL, radius: Radius.lg)
                .aspectRatio(4 / 5, contentMode: .fit)
                .overlay(alignment: .topLeading) {
                    if let b = idea.outlierBadge {
                        Text(b).font(.geist(13, .semibold)).foregroundStyle(.black)
                            .padding(.horizontal, 9).padding(.vertical, 4).background(Capsule().fill(.white)).padding(10)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if top && abs(dx) > 30 {
                        Text(dx > 0 ? "SAVE" : "PASS")
                            .font(.geist(14, .bold))
                            .foregroundStyle(dx > 0 ? Color.bg : Color.text)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Capsule().fill(dx > 0 ? Color.white : Color.black.opacity(0.6)))
                            .padding(12)
                            .opacity(min(1, abs(dx) / 100))
                    }
                }
            Text(idea.headline).font(.geist(17, .medium)).foregroundStyle(Color.text).lineLimit(3)
            if !idea.meta.isEmpty { Text(idea.meta).font(.tSmall).foregroundStyle(Color.textFaint) }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Radius.lg + 6, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.lg + 6, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .frame(maxWidth: 320)
        .scaleEffect(top ? 1 : 1 - CGFloat(depth) * 0.05)
        .offset(x: dx, y: top ? drag.height * 0.2 : CGFloat(depth) * 14)
        .rotationEffect(.degrees(Double(dx) / 18))
        .opacity(depth > 1 ? 0.6 : 1)
        .allowsHitTesting(top)
        .gesture(top ? DragGesture()
            .onChanged { v in
                drag = v.translation
                let a = v.translation.width > 100 ? 1 : v.translation.width < -100 ? -1 : 0
                if a != armed { armed = a }
            }
            .onEnded { v in
                let fast = abs(v.predictedEndTranslation.width) > 260
                if v.translation.width > 100 || (fast && v.predictedEndTranslation.width > 0) { commit(1) }
                else if v.translation.width < -100 || (fast && v.predictedEndTranslation.width < 0) { commit(-1) }
                else { withAnimation(.ui) { drag = .zero }; armed = 0 }
            } : nil)
        .onTapGesture { if top { open(idea) } }
    }

    private func commit(_ dir: Int) {
        guard let top = deck.first else { return }
        decided += 1
        armed = 0
        withAnimation(.easeIn(duration: 0.22)) { flying = (top.id, CGFloat(dir) * 520) }
        Task {
            try? await Task.sleep(for: .milliseconds(220))
            drag = .zero
            flying = nil
            await store.rule(top, liked: dir > 0)
        }
    }

    private func round(_ icon: String, tint: Color, fill: Color = Color.white.opacity(0.08), small: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: small ? 15 : 20, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: small ? 46 : 60, height: small ? 46 : 60)
                .background(Circle().fill(fill))
        }
        .buttonStyle(.plain)
    }
}
