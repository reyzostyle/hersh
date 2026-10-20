import SwiftUI
import UIKit

// Everything you can change by hand in the edit, saved per shoot so an edit
// is still there when you come back. Positions are fractions of the frame
// (0...1, top-left origin), so they mean the same in the preview and the export.

nonisolated enum CapFont: String, CaseIterable, Codable, Sendable {
    case heavy, condensed, bold, geist, rounded, serif, mono

    var label: String {
        switch self {
        case .heavy: "Heavy"
        case .condensed: "Tall"
        case .bold: "Bold"
        case .geist: "Geist"
        case .rounded: "Round"
        case .serif: "Serif"
        case .mono: "Mono"
        }
    }

    func ui(_ size: CGFloat) -> UIFont {
        switch self {
        case .heavy: return .systemFont(ofSize: size, weight: .black)
        case .condensed: return .systemFont(ofSize: size, weight: .heavy, width: .compressed)
        case .bold: return .systemFont(ofSize: size, weight: .bold)
        case .geist: return UIFont(name: "Geist-SemiBold", size: size) ?? .systemFont(ofSize: size, weight: .semibold)
        case .rounded:
            let base = UIFont.systemFont(ofSize: size, weight: .heavy)
            return base.fontDescriptor.withDesign(.rounded).map { UIFont(descriptor: $0, size: size) } ?? base
        case .serif:
            let base = UIFont.systemFont(ofSize: size, weight: .bold)
            return base.fontDescriptor.withDesign(.serif).map { UIFont(descriptor: $0, size: size) } ?? base
        case .mono: return .monospacedSystemFont(ofSize: size, weight: .bold)
        }
    }
}

// A colour that survives JSON.
nonisolated struct RGBA: Codable, Hashable, Sendable {
    var r: Double, g: Double, b: Double, a: Double = 1
    var ui: UIColor { UIColor(red: r, green: g, blue: b, alpha: a) }
    var color: Color { Color(ui) }
    static let white = RGBA(r: 1, g: 1, b: 1)
    static let black = RGBA(r: 0, g: 0, b: 0)
    static let yellow = RGBA(r: 1, g: 0.91, b: 0.1)
    static let green = RGBA(r: 0.17, g: 0.85, b: 0.49)
    static let pink = RGBA(r: 1, g: 0.33, b: 0.62)
    static let blue = RGBA(r: 0.3, g: 0.62, b: 1)
    static let palette: [RGBA] = [.white, .yellow, .green, .pink, .blue, .black]
}

nonisolated struct CaptionSettings: Codable, Equatable, Sendable {
    var preset: CaptionStyle = .pop
    var font: CapFont = .heavy
    var size: Double = 92
    var fill: RGBA = .white
    var highlight: RGBA = .yellow
    var outline = true
    var upper = true
    var trackWord = true // light up the word being said
    var maxWords = 3
    var x: Double = 0.5
    var y: Double = 0.64

    // Picking a preset sets every field; changing a field afterwards keeps the
    // preset's name but overrides that one thing, like TikTok's caption styles.
    static func preset(_ p: CaptionStyle, keepingPosition old: CaptionSettings? = nil) -> CaptionSettings {
        var c = CaptionSettings()
        c.preset = p
        switch p {
        case .pop: c.font = .heavy; c.size = 92; c.fill = .white; c.highlight = .yellow; c.outline = true; c.upper = true; c.trackWord = true; c.maxWords = 3
        case .bold: c.font = .condensed; c.size = 130; c.fill = .yellow; c.highlight = .white; c.outline = true; c.upper = true; c.trackWord = false; c.maxWords = 2
        case .word: c.font = .bold; c.size = 120; c.fill = .white; c.highlight = .yellow; c.outline = false; c.upper = false; c.trackWord = false; c.maxWords = 1
        case .clean: c.font = .geist; c.size = 60; c.fill = .white; c.highlight = .yellow; c.outline = false; c.upper = false; c.trackWord = false; c.maxWords = 6; c.y = 0.74
        case .none: break
        }
        if let old { c.x = old.x; c.y = old.y }
        return c
    }

    var look: CaptionLayers.Look {
        CaptionLayers.Look(font: font.ui(size), fill: fill.ui, hot: highlight.ui, stroke: outline ? max(6, size * 0.1) : 0,
                           trackActive: trackWord, y: y, x: x)
    }
}

nonisolated struct TextOverlay: Codable, Identifiable, Equatable, Sendable {
    var id = UUID().uuidString
    var text: String
    var font: CapFont = .heavy
    var size: Double = 70
    var color: RGBA = .white
    var pill = false // a rounded box behind the text
    var x: Double = 0.5
    var y: Double = 0.3
    var start: Double
    var end: Double
}

nonisolated struct MediaOverlay: Codable, Identifiable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case image, video }
    var id = UUID().uuidString
    var kind: Kind
    var file: String // inside the shoot's folder
    var x: Double = 0.5
    var y: Double = 0.3
    var width: Double = 0.6 // share of the frame width
    var aspect: Double = 1 // height / width of the media
    var start: Double
    var end: Double
}

nonisolated struct AudioSettings: Codable, Equatable, Sendable {
    var voice: Double = 1
    var cleanVoice = false // Apple's voice isolation over every take
    var musicFile: String?
    var musicName: String?
    var music: Double = 0.25
}

nonisolated struct EditDoc: Codable, Sendable {
    var kept: [WKey]?
    var rank: [WKey: Double]?
    var fixes: [WKey: String]?
    var hot: [WKey]?
    var note: String?
    var pace: Pace = .tight
    var speed: Double = 1.1
    var zoom = true
    var captions = CaptionSettings()
    var texts: [TextOverlay] = []
    var media: [MediaOverlay] = []
    var audio = AudioSettings()
}
