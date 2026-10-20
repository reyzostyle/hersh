import SwiftUI

// The web app's tokens (src/index.css), one to one: near-black ground, panels
// a step up, hierarchy by white at falling opacity, one white pill per screen.
// Green only ever means something worked or is running.
extension Color {
    static let bg = Color(red: 10 / 255, green: 10 / 255, blue: 11 / 255)
    static let raised = Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255)
    static let raisedHover = Color(red: 28 / 255, green: 28 / 255, blue: 28 / 255)
    static let text = Color(red: 250 / 255, green: 250 / 255, blue: 250 / 255)
    static let textMuted = Color(red: 157 / 255, green: 157 / 255, blue: 158 / 255)
    static let textFaint = Color(red: 128 / 255, green: 128 / 255, blue: 129 / 255)
    static let line = Color.white.opacity(0.08)
    static let lineStrong = Color.white.opacity(0.14)
    static let process = Color(red: 43 / 255, green: 217 / 255, blue: 124 / 255)
    static let danger = Color(red: 248 / 255, green: 113 / 255, blue: 113 / 255)
}

// One family of shapes: pills for anything you press, continuous-corner
// cards for anything you read. Nothing square.
enum Radius {
    static let sm: CGFloat = 14
    static let md: CGFloat = 20
    static let lg: CGFloat = 28
}

extension Shape where Self == RoundedRectangle {
    static func card(_ r: CGFloat = Radius.md) -> RoundedRectangle { RoundedRectangle(cornerRadius: r, style: .continuous) }
}

// The product's motion: short, eased, no overshoot. Springs read as cheap here.
extension Animation {
    static let ui = Animation.easeOut(duration: 0.22)
}

extension Font {
    // Geist, bundled. Weight 500 is the product's default for anything that is
    // a heading or a control.
    static func geist(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .medium: name = "Geist-Medium"
        case .semibold: name = "Geist-SemiBold"
        case .bold, .heavy, .black: name = "Geist-Bold"
        default: name = "Geist-Regular"
        }
        return .custom(name, size: size)
    }

    static let tTitle = geist(30, .medium)
    static let tHeading = geist(20, .medium)
    static let tBody = geist(15)
    static let tSmall = geist(13)
    static let tLabel = geist(12, .medium)
}

// The white pill: the one primary action on a screen.
struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, ghost }
    var kind: Kind = .primary

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.geist(15, .medium))
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .foregroundStyle(kind == .primary ? Color.bg : Color.text)
            .background(
                Capsule().fill(kind == .primary ? Color.white : kind == .secondary ? Color.white.opacity(0.08) : Color.bg)
            )
            .overlay(Capsule().strokeBorder(kind == .ghost ? Color.lineStrong : .clear, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .sensoryFeedback(.impact(weight: .light, intensity: 0.6), trigger: configuration.isPressed) { _, pressed in pressed }
    }
}

extension ButtonStyle where Self == PillButtonStyle {
    static var pill: PillButtonStyle { PillButtonStyle() }
    static var pillSecondary: PillButtonStyle { PillButtonStyle(kind: .secondary) }
    static var pillGhost: PillButtonStyle { PillButtonStyle(kind: .ghost) }
}

// A recessed track with the chosen option lifted out of it, sliding between
// choices like the web Seg.
struct Seg<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var value: T
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 2) {
            ForEach(options, id: \.0) { opt in
                let on = opt.0 == value
                Button {
                    withAnimation(.ui) { value = opt.0 }
                } label: {
                    Text(opt.1)
                        .font(.geist(13, .medium))
                        .foregroundStyle(on ? Color.text : Color.textFaint)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background {
                            if on { Capsule().fill(Color.raisedHover).matchedGeometryEffect(id: "thumb", in: ns) }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Capsule().fill(Color.raised))
        .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1))
        .sensoryFeedback(.selection, trigger: value)
    }
}

// A text field on a raised panel, the web inputs' shape.
struct FieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.geist(15))
            .foregroundStyle(Color.text)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .background(Capsule().fill(Color.raised))
            .overlay(Capsule().strokeBorder(Color.line, lineWidth: 1))
    }
}

extension View {
    func field() -> some View { modifier(FieldStyle()) }
}

// The shimmer that stands in for content still loading.
struct Skeleton: View {
    var cornerRadius: CGFloat = Radius.md
    @State private var phase: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.white.opacity(0.04))
            .overlay {
                GeometryReader { geo in
                    LinearGradient(colors: [.clear, Color.white.opacity(0.06), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: geo.size.width * 0.6)
                        .offset(x: phase * geo.size.width)
                }
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) { phase = 1.4 }
            }
    }
}
