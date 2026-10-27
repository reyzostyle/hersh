import SwiftUI

// The cover of an idea Chumoku found rather than took from a Short: the line
// they would open on, set like a script inside a dashed edge, and what it came
// from at the bottom. No picture and no multiple, so it never passes for a
// Short that already got the views. Same look as the web's AiIdeaCover.
struct AiCover: View {
    let idea: Idea
    var radius: CGFloat = Radius.md

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Color(red: 15 / 255, green: 15 / 255, blue: 16 / 255))
                    .overlay {
                        RadialGradient(colors: [Color.white.opacity(0.07), .clear], center: .topLeading, startRadius: 0, endRadius: w * 1.2)
                            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                    }
                RoundedRectangle(cornerRadius: max(4, radius - 6), style: .continuous)
                    .strokeBorder(Color.white.opacity(0.2), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .padding(8)

                Text(idea.openingLine)
                    .font(.geist(min(28, max(15, w * 0.1)), .medium))
                    .foregroundStyle(Color.text)
                    .lineSpacing(1)
                    .lineLimit(7)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding(.horizontal, w * 0.12)
                    .padding(.bottom, w * 0.08)

                if let from = idea.basisLine {
                    Text(from)
                        .font(.geist(12))
                        .foregroundStyle(Color.textFaint)
                        .lineLimit(1)
                        .padding(.horizontal, w * 0.12)
                        .padding(.bottom, max(14, w * 0.08))
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }
}

// The cover for any idea: a Short's frame, or the script cover for one
// Chumoku found.
struct IdeaCover: View {
    let idea: Idea
    var radius: CGFloat = Radius.md

    var body: some View {
        if idea.isOwn {
            AiCover(idea: idea, radius: radius)
        } else {
            Thumb(url: idea.thumbnailURL, radius: radius)
                .overlay(alignment: .bottomLeading) {
                    if let badge = idea.outlierBadge { MultBadge(text: badge) }
                }
        }
    }
}

// "31×" on a dark glass pill, bottom left, like the web cards.
struct MultBadge: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.geist(17, .medium))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, .dark))
            .background(Capsule().fill(.black.opacity(0.35)))
            .padding(9)
    }
}
