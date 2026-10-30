import SwiftUI

// Today's ideas one at a time: right keeps it, left lets it go, a tap opens
// it. The card tilts with your thumb and a tick of haptics says when letting
// go will count. Same stamps and buttons as the web stack (✕, Open, ♥).
//
// It is given the rest of the screen and fits itself to it: the cover gives up
// height first (it crops, it never squashes), so the buttons are always on
// screen without scrolling (Ivan, 2026-10-27, on the web one).
struct SwipeStack: View {
    @Environment(IdeasStore.self) private var store
    let open: (Idea) -> Void
    // Gesture state, not @State: when the system cancels a drag (the edge
    // swipe, a second finger, an alert) onEnded never runs, and a @State
    // offset stayed where the finger left it, the card stuck half off screen
    // with "Skip" on it. This resets itself, with a spring.
    @GestureState(resetTransaction: Transaction(animation: .spring(response: 0.38, dampingFraction: 0.62)))
    private var drag: CGSize = .zero
    @State private var flying: (id: String, dx: CGFloat)?
    @State private var armed = 0 // -1 dismiss, 1 save
    @State private var decided = 0

    private var deck: [Idea] { store.today.filter { $0.liked == nil } }

    // Fixed parts around the cover: count line, card text and padding, buttons.
    private let countH: CGFloat = 26
    private let textH: CGFloat = 104
    private let buttonsH: CGFloat = 76

    var body: some View {
        GeometryReader { g in
            let width = min(g.size.width, 340)
            let natural = (width - 2) * 1.25
            let room = g.size.height - countH - textH - buttonsH
            let mediaH = max(150, min(natural, room))

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Text("\(store.today.count - deck.count + 1) of \(store.today.count)")
                        .font(.tSmall).foregroundStyle(Color.textFaint).monospacedDigit()
                }
                .frame(width: width, height: countH, alignment: .top)

                ZStack {
                    ForEach(Array(deck.prefix(2).enumerated().reversed()), id: \.element.id) { i, idea in
                        card(idea, depth: i, mediaH: mediaH)
                    }
                }
                .frame(width: width)

                HStack(spacing: 22) {
                    round("xmark", tint: Color.text) { commit(-1) }
                        .accessibilityLabel("Skip")
                    Button("Open") { if let top = deck.first { open(top) } }
                        .font(.geist(14, .medium)).foregroundStyle(Color.textMuted)
                        .buttonStyle(.plain)
                    round("heart.fill", tint: Color.bg, fill: .white) { commit(1) }
                        .accessibilityLabel("Save")
                }
                .frame(height: buttonsH)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .sensoryFeedback(.selection, trigger: armed)
        .sensoryFeedback(.impact(weight: .medium), trigger: decided)
    }

    private func card(_ idea: Idea, depth: Int, mediaH: CGFloat) -> some View {
        let top = depth == 0
        let dx = top ? (flying?.id == idea.id ? flying!.dx : drag.width) : 0
        let lean = max(-1, min(1, dx / 100))
        // The card underneath rises as the top one is dragged away.
        let rise = top ? 1 : min(1, abs(drag.width) / 140)
        return VStack(alignment: .leading, spacing: 0) {
            IdeaCover(idea: idea, radius: 0)
                .frame(height: mediaH)
                .clipped()
                .overlay(alignment: .topLeading) {
                    if top { stamp("Save", fill: .white, text: Color.bg).opacity(max(0, lean)).rotationEffect(.degrees(-8)).padding(14) }
                }
                .overlay(alignment: .topTrailing) {
                    if top { stamp("Skip", fill: .black.opacity(0.62), text: .white).opacity(max(0, -lean)).rotationEffect(.degrees(8)).padding(14) }
                }
            VStack(alignment: .leading, spacing: 6) {
                Text(idea.isOwn ? (idea.pitch ?? idea.headline) : idea.headline)
                    .font(.geist(18, .medium)).foregroundStyle(Color.text)
                    .lineLimit(2).multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                MetaLine(idea: idea)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 14)
        }
        // Every card the same size, so the one underneath only ever peeks by
        // its offset, never by a longer title.
        .frame(height: mediaH + textH, alignment: .top)
        .background(Color.raised)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .scaleEffect(top ? 1 : 0.94 + 0.06 * rise, anchor: .bottom)
        .offset(x: dx, y: top ? drag.height * 0.25 : 12 * (1 - rise))
        .rotationEffect(.degrees(Double(dx) / 18))
        .opacity(top ? (flying?.id == idea.id ? 0 : 1) : 0.45 + 0.55 * rise)
        .allowsHitTesting(top)
        .gesture(top ? DragGesture(minimumDistance: 8)
            .updating($drag) { v, state, _ in state = v.translation }
            .onChanged { v in
                let a = v.translation.width > 100 ? 1 : v.translation.width < -100 ? -1 : 0
                if a != armed { armed = a }
            }
            .onEnded { v in
                let fast = abs(v.predictedEndTranslation.width) > 260 && abs(v.translation.width) > 30
                if v.translation.width > 100 || (fast && v.predictedEndTranslation.width > 0) { commit(1) }
                else if v.translation.width < -100 || (fast && v.predictedEndTranslation.width < 0) { commit(-1) }
                else { armed = 0 } // springs back as the gesture state resets
            } : nil)
        .onTapGesture { if top { open(idea) } }
    }

    private func commit(_ dir: Int) {
        guard let top = deck.first, flying?.id != top.id else { return }
        decided += 1
        armed = 0
        withAnimation(.easeIn(duration: 0.24)) { flying = (top.id, CGFloat(dir) * 520) }
        Task {
            try? await Task.sleep(for: .milliseconds(240))
            // Clear the flight and rule in one main-actor turn: rule() takes
            // the card out of the deck before its first await, so no frame
            // shows it back in the middle.
            flying = nil
            await store.rule(top, liked: dir > 0)
        }
    }

    private func stamp(_ text: LocalizedStringKey, fill: Color, text color: Color) -> some View {
        Text(text)
            .font(.geist(14, .medium)).foregroundStyle(color)
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(Capsule().fill(fill))
    }

    private func round(_ icon: String, tint: Color, fill: Color = Color.white.opacity(0.08), action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 56, height: 56)
                .background(Circle().fill(fill))
        }
        .buttonStyle(.plain)
    }
}
