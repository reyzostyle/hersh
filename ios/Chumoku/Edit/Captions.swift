import SwiftUI
import UIKit
import CoreImage

// Captions: the styles you pick from, how spoken words become the phrases on
// screen, and how a phrase looks at any moment (which word is lit, which have
// appeared, how far its entrance has got). The preview and the export both
// draw through `CaptionLayers.paint`, so what you see while editing is what
// gets burned in.

nonisolated enum CaptionStyle: String, CaseIterable, Codable, Sendable {
    case pop, box, bold, word, reveal, clean, none

    var label: String {
        switch self {
        case .pop: "Pop"
        case .box: "Box"
        case .bold: "Tall"
        case .word: "One word"
        case .reveal: "Reveal"
        case .clean: "Clean"
        case .none: "Off"
        }
    }
}

// How a phrase comes on screen.
nonisolated enum CapAnim: String, CaseIterable, Codable, Sendable {
    case none, pop, rise
    var label: String { self == .none ? "None" : rawValue.capitalized }
}

nonisolated struct CaptionSettings: Codable, Equatable, Sendable {
    var preset: CaptionStyle = .pop
    var font: CapFont = .heavy
    var size: Double = 90
    var fill: RGBA = .white
    var highlight: RGBA = .yellow
    var outline = true
    var upper = true
    var trackWord = true // light up the word being said
    var box = false // the lit word sits in a box of the highlight colour
    var reveal = false // words appear as they are said
    var anim: CapAnim = .pop
    var maxWords = 3
    var x: Double = 0.5
    var y: Double = 0.64

    init() {}

    enum CodingKeys: String, CodingKey {
        case preset, font, size, fill, highlight, outline, upper, trackWord, box, reveal, anim, maxWords, x, y
    }

    // Every field optional on the way in, so an edit saved before a field
    // existed still opens with everything else it had.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = CaptionSettings()
        preset = (try? c.decodeIfPresent(CaptionStyle.self, forKey: .preset)) ?? d.preset
        font = (try? c.decodeIfPresent(CapFont.self, forKey: .font)) ?? d.font
        size = (try? c.decodeIfPresent(Double.self, forKey: .size)) ?? d.size
        fill = (try? c.decodeIfPresent(RGBA.self, forKey: .fill)) ?? d.fill
        highlight = (try? c.decodeIfPresent(RGBA.self, forKey: .highlight)) ?? d.highlight
        outline = (try? c.decodeIfPresent(Bool.self, forKey: .outline)) ?? d.outline
        upper = (try? c.decodeIfPresent(Bool.self, forKey: .upper)) ?? d.upper
        trackWord = (try? c.decodeIfPresent(Bool.self, forKey: .trackWord)) ?? d.trackWord
        box = (try? c.decodeIfPresent(Bool.self, forKey: .box)) ?? d.box
        reveal = (try? c.decodeIfPresent(Bool.self, forKey: .reveal)) ?? d.reveal
        anim = (try? c.decodeIfPresent(CapAnim.self, forKey: .anim)) ?? d.anim
        maxWords = (try? c.decodeIfPresent(Int.self, forKey: .maxWords)) ?? d.maxWords
        x = (try? c.decodeIfPresent(Double.self, forKey: .x)) ?? d.x
        y = (try? c.decodeIfPresent(Double.self, forKey: .y)) ?? d.y
    }

    // Picking a preset sets every field; changing a field afterwards keeps the
    // preset's name but overrides that one thing, like TikTok's caption styles.
    static func preset(_ p: CaptionStyle, keepingPosition old: CaptionSettings? = nil) -> CaptionSettings {
        var c = CaptionSettings()
        c.preset = p
        switch p {
        case .pop:
            c.font = .heavy; c.size = 90; c.fill = .white; c.highlight = .yellow; c.outline = true; c.upper = true
            c.trackWord = true; c.maxWords = 3; c.anim = .pop
        case .box:
            c.font = .heavy; c.size = 88; c.fill = .white; c.highlight = .green; c.outline = false; c.upper = true
            c.trackWord = true; c.box = true; c.maxWords = 3; c.anim = .pop
        case .bold:
            c.font = .condensed; c.size = 130; c.fill = .yellow; c.highlight = .white; c.outline = true; c.upper = true
            c.trackWord = false; c.maxWords = 2; c.anim = .pop
        case .word:
            c.font = .heavy; c.size = 124; c.fill = .white; c.highlight = .yellow; c.outline = true; c.upper = true
            c.trackWord = false; c.maxWords = 1; c.anim = .pop
        case .reveal:
            c.font = .bold; c.size = 76; c.fill = .white; c.highlight = .yellow; c.outline = false; c.upper = false
            c.trackWord = false; c.reveal = true; c.maxWords = 5; c.anim = .rise
        case .clean:
            c.font = .geist; c.size = 60; c.fill = .white; c.highlight = .yellow; c.outline = false; c.upper = false
            c.trackWord = false; c.maxWords = 6; c.anim = .rise; c.y = 0.72
        case .none: break
        }
        if let old { c.x = old.x; c.y = old.y }
        return c
    }

    var look: CaptionLayers.Look {
        CaptionLayers.Look(font: font.ui(size), fill: fill.ui, hot: highlight.ui, stroke: outline ? max(6, size * 0.1) : 0,
                           trackActive: trackWord, box: box, reveal: reveal, anim: anim, y: y, x: x)
    }
}

// MARK: - words into phrases

extension Cutter {
    // Short words that read wrong at the end of a phrase ("I went to the" /
    // "shop"): when a phrase is full on one of these, it moves to the next.
    private static let leaners: Set<String> = [
        "a", "an", "the", "to", "of", "and", "or", "but", "in", "on", "at", "for", "with", "my", "your", "his", "her",
        "our", "their", "is", "are", "was", "i", "you", "we", "it's", "i'm", "so", "if", "that", "this", "just",
    ]

    // Words into the phrases that share the screen. A phrase ends when it is
    // full (by words, or by width so it never wraps past the lines it should
    // take), at the end of a sentence, or where the speaker pauses.
    static func groups(_ caps: [CapWord], captions c: CaptionSettings) -> [CapGroup] {
        guard c.preset != .none else { return [] }
        let maxWords = max(1, c.maxWords)
        let look = c.look
        let space = CaptionLayers.space(look)
        // Big styles stay on one line; longer phrases may take two.
        let maxWidth = CaptionLayers.maxWidth * (maxWords <= 3 ? 1 : 1.85)
        func width(_ ws: [CapWord]) -> CGFloat {
            ws.reduce(0) { $0 + ($1.text as NSString).size(withAttributes: [.font: look.font]).width } + space * CGFloat(max(0, ws.count - 1))
        }
        func leans(_ w: CapWord) -> Bool { leaners.contains(w.text.lowercased().trimmingCharacters(in: .punctuationCharacters)) }
        // Short joining words do not count toward the words on screen, so a
        // three-word style reads "WITH THE DUMBEST", not "WITH" and then
        // "THE DUMBEST". One word means one word.
        let looseCount = maxWords == 2 || maxWords == 3
        func count(_ ws: [CapWord]) -> Int { looseCount ? ws.filter { !leans($0) }.count : ws.count }

        // First the hard breaks: sentence ends, pauses, and (for short
        // styles) commas. Then each run between them is split into phrases.
        var runs: [[CapWord]] = []
        var cur: [CapWord] = []
        for (i, raw) in caps.enumerated() {
            let w = CapWord(key: raw.key, text: clean(raw.text, c), t0: raw.t0, t1: raw.t1, hot: raw.hot)
            guard !w.text.isEmpty else { continue }
            let prev = i > 0 ? caps[i - 1] : nil
            let ends = prev.map { $0.text.hasSuffix(".") || $0.text.hasSuffix("?") || $0.text.hasSuffix("!") } ?? false
            let comma = prev.map { $0.text.hasSuffix(",") } ?? false
            let paused = prev.map { w.t0 - $0.t1 > 0.35 } ?? false
            if !cur.isEmpty, ends || paused || (comma && (maxWords <= 3 || cur.count >= 3)) { runs.append(cur); cur = [] }
            cur.append(w)
        }
        if !cur.isEmpty { runs.append(cur) }

        // The split of a run with the fewest, most even phrases: no phrase
        // over the word count or the width, and a cost for a word left on its
        // own or a phrase ending on "the". Searched exhaustively (runs are
        // short), so "APP" never ends up alone because the phrase before it
        // filled up first.
        func cost(_ g: ArraySlice<CapWord>, runLength: Int) -> Double {
            let ws = Array(g)
            let allLean = ws.allSatisfy(leans)
            if ws.count > 1, maxWords == 1 || !allLean && (count(ws) > maxWords || width(ws) > maxWidth) { return .infinity }
            if ws.count > maxWords + 2 { return .infinity }
            var c = 1.0
            if maxWords > 1, ws.count == 1, runLength > 1 { c += 2.5 }
            if maxWords > 1, ws.count > 1, let last = ws.last, leans(last) { c += 3 }
            if maxWords > 1, allLean, ws.count > 1 { c += 1.5 }
            return c
        }
        var groups: [CapGroup] = []
        for run in runs {
            let n = run.count
            var best = [Double](repeating: .infinity, count: n + 1)
            var from = [Int](repeating: 0, count: n + 1)
            best[0] = 0
            for j in 1...n {
                for i in max(0, j - maxWords - 3)..<j {
                    let c = best[i] + cost(run[i..<j], runLength: n)
                    if c < best[j] { best[j] = c; from[j] = i }
                }
                // Nothing fits (one word wider than the screen): it goes alone.
                if best[j] == .infinity { best[j] = best[j - 1] + 1; from[j] = j - 1 }
            }
            var cuts: [Range<Int>] = []
            var j = n
            while j > 0 { cuts.insert(from[j]..<j, at: 0); j = from[j] }
            for r in cuts {
                let ws = Array(run[r])
                groups.append(CapGroup(words: ws, t0: ws[0].t0, t1: ws[ws.count - 1].t1))
            }
        }
        // Each phrase stays up until the next one, across short gaps, so
        // captions do not blink off between breaths; and never shorter than a
        // glance.
        for i in groups.indices {
            let next = i + 1 < groups.count ? groups[i + 1].t0 : nil
            var end = groups[i].t1 + (next == nil ? 0.4 : 0.5)
            end = max(end, groups[i].t0 + 0.3)
            if let next { end = min(end, next) }
            groups[i].t1 = end
        }
        return groups
    }

    private static func clean(_ text: String, _ c: CaptionSettings) -> String {
        var t = text.trimmingCharacters(in: .whitespaces)
        let sentence = c.preset == .clean || c.preset == .reveal
        if !sentence { t = t.trimmingCharacters(in: CharacterSet(charactersIn: ".,;:")) }
        t = t.trimmingCharacters(in: CharacterSet(charactersIn: "\"“”()"))
        return c.upper ? t.uppercased() : t
    }
}

// MARK: - drawing

nonisolated enum CaptionLayers {
    struct Look: @unchecked Sendable {
        let font: UIFont
        let fill: UIColor
        let hot: UIColor
        let stroke: CGFloat // points of outline, 0 for shadow only
        let trackActive: Bool
        let box: Bool
        let reveal: Bool
        let anim: CapAnim
        let y: CGFloat // centre, share of height
        var x: CGFloat = 0.5 // centre, share of width
    }

    // Wide enough for a punchy line, narrow enough to stay clear of the like
    // buttons when centred.
    static let maxWidth: CGFloat = 840

    // Room between words: caps with an outline need more than the font's own
    // space or the words run together.
    static func space(_ look: Look) -> CGFloat {
        max((" " as NSString).size(withAttributes: [.font: look.font]).width, look.font.pointSize * 0.26) + look.stroke * 0.8
    }
    static let animDur = 0.18

    static func attributed(_ text: String, color: UIColor, font: UIFont) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color])
    }

    // The outline alone, twice as wide as it should look: it is drawn first and
    // the fill goes on top, so the outline sits outside the letters instead of
    // eating into them (a combined stroke-and-fill hollowed out heavy type).
    static func outline(_ text: String, font: UIFont, width: CGFloat) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: font, .strokeColor: UIColor.black, .strokeWidth: width * 2 / font.pointSize * 100,
        ])
    }

    // The box `draw` will fill, so the preview can size and hit-test it.
    static func measure(_ words: [String], font: UIFont, maxWidth: CGFloat, pill: Bool) -> CGSize {
        let space = (" " as NSString).size(withAttributes: [.font: font]).width
        let lineH = font.lineHeight * 1.05
        var lines: [CGFloat] = [0]
        for t in words {
            let w = (t as NSString).size(withAttributes: [.font: font]).width
            if lines[lines.count - 1] > 0 && lines[lines.count - 1] + space + w > maxWidth { lines.append(0) }
            lines[lines.count - 1] += (lines[lines.count - 1] > 0 ? space : 0) + w
        }
        let pad: CGFloat = pill ? 60 : 24
        return CGSize(width: (lines.max() ?? 0) + pad * 2, height: CGFloat(lines.count) * lineH + pad)
    }

    // Plain words in lines centred on `center`, wrapping past `maxWidth`, with
    // an optional rounded box behind. Text overlays draw through this.
    static func draw(_ words: [(String, UIColor)], font: UIFont, stroke: CGFloat, maxWidth: CGFloat, center: CGPoint, pill: UIColor? = nil, in cg: CGContext) {
        let space = (" " as NSString).size(withAttributes: [.font: font]).width
        let lineH = font.lineHeight * 1.05
        var lines: [[(String, UIColor, CGSize)]] = [[]]
        var lineW: CGFloat = 0
        for (t, c) in words {
            let sz = attributed(t, color: c, font: font).size()
            if !lines[lines.count - 1].isEmpty && lineW + space + sz.width > maxWidth { lines.append([]); lineW = 0 }
            lines[lines.count - 1].append((t, c, sz))
            lineW += (lineW > 0 ? space : 0) + sz.width
        }
        let top = center.y - CGFloat(lines.count) * lineH / 2
        if let pill {
            let widest = lines.map { $0.reduce(0) { $0 + $1.2.width } + space * CGFloat(max(0, $0.count - 1)) }.max() ?? 0
            let box = CGRect(x: center.x - widest / 2 - 28, y: top - 14, width: widest + 56, height: CGFloat(lines.count) * lineH + 28)
            cg.saveGState()
            cg.setShadow(offset: .zero, blur: 0, color: nil)
            pill.setFill()
            UIBezierPath(roundedRect: box, cornerRadius: min(box.height / 2, 36)).fill()
            cg.restoreGState()
        }
        for (li, line) in lines.enumerated() {
            let total = line.reduce(0) { $0 + $1.2.width } + space * CGFloat(line.count - 1)
            var x = center.x - total / 2
            for (t, c, sz) in line {
                word(t, color: c, font: font, stroke: stroke, at: CGPoint(x: x, y: top + CGFloat(li) * lineH), in: cg)
                x += sz.width + space
            }
        }
    }

    private static func word(_ t: String, color: UIColor, font: UIFont, stroke: CGFloat, at: CGPoint, in cg: CGContext) {
        if stroke > 0 {
            outline(t, font: font, width: stroke).draw(at: at)
            cg.saveGState(); cg.setShadow(offset: .zero, blur: 0, color: nil)
            attributed(t, color: color, font: font).draw(at: at)
            cg.restoreGState()
        } else {
            attributed(t, color: color, font: font).draw(at: at)
        }
    }

    // MARK: a phrase over time

    struct Placed { let word: CapWord; let rect: CGRect }

    // The phrase's words laid out in centred lines around (0, 0).
    static func layout(_ g: CapGroup, look: Look) -> [Placed] {
        let font = look.font
        let space = space(look)
        let lineH = font.lineHeight * 1.05
        var lines: [[(CapWord, CGSize)]] = [[]]
        var lineW: CGFloat = 0
        for w in g.words {
            let sz = (w.text as NSString).size(withAttributes: [.font: font])
            if !lines[lines.count - 1].isEmpty && lineW + space + sz.width > maxWidth { lines.append([]); lineW = 0 }
            lines[lines.count - 1].append((w, sz))
            lineW += (lineW > 0 ? space : 0) + sz.width
        }
        let top = -CGFloat(lines.count) * lineH / 2
        var out: [Placed] = []
        for (li, line) in lines.enumerated() {
            let total = line.reduce(0) { $0 + $1.1.width } + space * CGFloat(line.count - 1)
            var x = -total / 2
            for (w, sz) in line {
                out.append(Placed(word: w, rect: CGRect(x: x, y: top + CGFloat(li) * lineH, width: sz.width, height: sz.height)))
                x += sz.width + space
            }
        }
        return out
    }

    // Room the phrase can take, entrance and boxes included, around (0, 0).
    static func bounds(_ g: CapGroup, look: Look) -> CGRect {
        let r = layout(g, look: look).reduce(CGRect.null) { $0.union($1.rect) }
        guard !r.isNull else { return .zero }
        let pad = look.stroke + 30
        return r.insetBy(dx: -pad - r.width * 0.08, dy: -pad - r.height * 0.12)
    }

    // What changes the picture: the lit word, how many words have appeared,
    // and the frame of any entrance still running (-1 when nothing moves).
    struct State: Hashable { var lit: Int?; var shown: Int; var frame: Int }

    static func state(_ g: CapGroup, at t: Double, look: Look) -> State {
        let current = g.words.lastIndex { t >= $0.t0 } ?? 0
        let lit = look.trackActive || look.box ? current : nil
        let shown = look.reveal ? max(1, g.words.filter { t >= $0.t0 - 0.02 }.count) : g.words.count
        var moving = look.anim != .none && t - g.t0 < animDur
        if look.anim != .none, look.reveal, shown > 0, t - g.words[shown - 1].t0 < animDur { moving = true }
        if look.anim == .pop, lit != nil, !look.box, t - g.words[current].t0 < animDur { moving = true }
        return State(lit: lit, shown: shown, frame: moving ? Int(t * 30) : -1)
    }

    private static func progress(_ dt: Double) -> CGFloat { CGFloat(min(1, max(0, dt / animDur))) }
    private static func easeOut(_ p: CGFloat) -> CGFloat { 1 - pow(1 - p, 3) }
    // Overshoots a touch past full size and settles: the "pop".
    private static func popScale(_ p: CGFloat) -> CGFloat {
        let c1: CGFloat = 1.70158, c3 = c1 + 1
        let e = 1 + c3 * pow(p - 1, 3) + c1 * pow(p - 1, 2)
        return 0.6 + 0.4 * e
    }

    // Draws phrase `g` as it looks at time `t`, centred on `center`.
    static func paint(_ g: CapGroup, at t: Double, look: Look, center: CGPoint, in cg: CGContext) {
        let placed = layout(g, look: look)
        let st = state(g, at: t, look: look)
        cg.saveGState()
        cg.translateBy(x: center.x, y: center.y)
        let gp = progress(t - g.t0)
        switch look.anim {
        case .pop: let s = popScale(gp); cg.scaleBy(x: s, y: s)
        case .rise: cg.translateBy(x: 0, y: (1 - easeOut(gp)) * 40); cg.setAlpha(easeOut(gp))
        case .none: break
        }
        for (wi, p) in placed.enumerated() where wi < st.shown {
            cg.saveGState()
            let mid = CGPoint(x: p.rect.midX, y: p.rect.midY)
            func scale(_ s: CGFloat) {
                cg.translateBy(x: mid.x, y: mid.y); cg.scaleBy(x: s, y: s); cg.translateBy(x: -mid.x, y: -mid.y)
            }
            // Words that come in one at a time make their own entrance.
            if look.reveal, wi > 0, look.anim != .none {
                let wp = progress(t - p.word.t0)
                if look.anim == .pop { scale(popScale(wp)) } else { cg.translateBy(x: 0, y: (1 - easeOut(wp)) * 24); cg.setAlpha(easeOut(wp)) }
            }
            let lit = st.lit == wi
            var color = p.word.hot ? look.hot : look.fill
            var stroke = look.stroke
            if lit && look.box {
                let box = p.rect.insetBy(dx: -look.font.pointSize * 0.16, dy: -look.font.pointSize * 0.02)
                cg.saveGState()
                look.hot.setFill()
                UIBezierPath(roundedRect: box, cornerRadius: min(20, box.height * 0.24)).fill()
                cg.restoreGState()
                color = look.hot.isLight ? .black : .white
                stroke = 0
            } else {
                if lit { color = look.hot }
                // The lit word bumps up as it is said.
                if lit, look.anim == .pop { scale(1 + 0.1 * sin(.pi * progress(t - p.word.t0))) }
                cg.setShadow(offset: CGSize(width: 0, height: stroke > 0 ? 4 : 2), blur: stroke > 0 ? 10 : 18,
                             color: UIColor.black.withAlphaComponent(stroke > 0 ? 0.5 : 0.8).cgColor)
            }
            word(p.word.text, color: color, font: look.font, stroke: stroke, at: p.rect.origin, in: cg)
            cg.restoreGState()
        }
        cg.restoreGState()
    }
}

nonisolated extension UIColor {
    var isLight: Bool {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return 0.299 * r + 0.587 * g + 0.114 * b > 0.6
    }
}

// MARK: - the export's overlay pass

// Paints captions, text overlays and pictures over a frame of the export.
// Each distinct state (which phrase, which word lit, which texts and pictures
// show, which frame of an entrance) is drawn once into a full-frame image and
// reused while it lasts. Called from the export's render threads.
nonisolated final class OverlayPainter: @unchecked Sendable {
    private let groups: [CapGroup]
    private let look: CaptionLayers.Look?
    private let texts: [TextOverlay]
    private let images: [(MediaOverlay, UIImage)]
    private let lock = NSLock()
    private var cached: (String, CIImage?)?

    var isEmpty: Bool { (look == nil || groups.isEmpty) && texts.isEmpty && images.isEmpty }

    init(groups: [CapGroup], captions: CaptionSettings, texts: [TextOverlay], images: [(MediaOverlay, UIImage)]) {
        self.groups = groups
        self.texts = texts
        self.images = images
        look = captions.preset == .none ? nil : captions.look
    }

    // The phrase on screen at `t`; phrases never overlap.
    func groupIndex(at t: Double) -> Int? {
        var lo = 0, hi = groups.count - 1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if t < groups[mid].t0 { hi = mid - 1 } else if t >= groups[mid].t1 { lo = mid + 1 } else { return mid }
        }
        return nil
    }

    func paint(over frame: CIImage, at t: Double) -> CIImage {
        let gi = look == nil ? nil : groupIndex(at: t)
        let st = gi.flatMap { i in look.map { CaptionLayers.state(groups[i], at: t, look: $0) } }
        let shownTexts = texts.indices.filter { t >= texts[$0].start && t < texts[$0].end }
        let shownImages = images.indices.filter { t >= images[$0].0.start && t < images[$0].0.end }
        let key = "\(gi ?? -1)|\(st.map { "\($0.lit ?? -1),\($0.shown),\($0.frame)" } ?? "")|\(shownTexts)|\(shownImages)"
        lock.lock()
        let layer: CIImage?
        if let c = cached, c.0 == key { layer = c.1 } else {
            layer = (gi == nil && shownTexts.isEmpty && shownImages.isEmpty) ? nil : draw(group: gi, at: t, texts: shownTexts, images: shownImages)
            cached = (key, layer)
        }
        lock.unlock()
        return layer.map { $0.composited(over: frame) } ?? frame
    }

    private func draw(group gi: Int?, at t: Double, texts shownTexts: [Int], images shownImages: [Int]) -> CIImage? {
        let size = Renderer.size
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let img = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let cg = ctx.cgContext
            for i in shownImages {
                let (m, image) = images[i]
                let w = size.width * m.width, h = w * m.aspect
                let rect = CGRect(x: size.width * m.x - w / 2, y: size.height * m.y - h / 2, width: w, height: h)
                cg.saveGState()
                UIBezierPath(roundedRect: rect, cornerRadius: 28).addClip()
                image.draw(in: rect)
                cg.restoreGState()
            }
            for i in shownTexts {
                let o = texts[i]
                cg.saveGState()
                if !o.pill { cg.setShadow(offset: CGSize(width: 0, height: 4), blur: 14, color: UIColor.black.withAlphaComponent(0.6).cgColor) }
                let color = o.pill && o.color == .white ? UIColor.black : o.color.ui
                CaptionLayers.draw(o.text.split(separator: " ").map { (String($0), color) }, font: o.font.ui(o.size), stroke: 0,
                                   maxWidth: 920, center: CGPoint(x: size.width * o.x, y: size.height * o.y),
                                   pill: o.pill ? (o.color == .white ? UIColor.white : UIColor.black.withAlphaComponent(0.75)) : nil, in: cg)
                cg.restoreGState()
            }
            if let gi, let look {
                CaptionLayers.paint(groups[gi], at: t, look: look,
                                    center: CGPoint(x: size.width * look.x, y: size.height * look.y), in: cg)
            }
        }
        return CIImage(image: img)
    }
}
