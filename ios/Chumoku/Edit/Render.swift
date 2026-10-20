import AVFoundation
import UIKit
import QuartzCore

// Turns a Timeline into something AVFoundation plays and exports: the kept
// pieces of every take laid end to end, sped up without changing pitch,
// framed 9:16 with a slow push and a jump-cut zoom, captions burned in on export.
enum Renderer {
    nonisolated static let size = CGSize(width: 1080, height: 1920)
    static let fps: Int32 = 30

    struct Built {
        let composition: AVMutableComposition
        let video: AVMutableVideoComposition
    }

    static func build(_ tl: Timeline, takes: [URL]) async throws -> Built {
        let comp = AVMutableComposition()
        guard let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw EditError("Could not start the edit.")
        }
        // The asset is kept alive here on purpose: a track only holds its asset
        // weakly, and inserting from a track whose asset is gone fails (-12780).
        struct Source { let asset: AVURLAsset; let video: AVAssetTrack; let audio: AVAssetTrack?; let transform: CGAffineTransform; let natural: CGSize; let range: CMTimeRange }
        var sources: [Int: Source] = [:]
        for (i, url) in takes.enumerated() {
            let asset = AVURLAsset(url: url)
            guard let v = try await asset.loadTracks(withMediaType: .video).first else { continue }
            let a = try await asset.loadTracks(withMediaType: .audio).first
            let (t, n, r) = try await v.load(.preferredTransform, .naturalSize, .timeRange)
            sources[i] = Source(asset: asset, video: v, audio: a, transform: t, natural: n, range: r)
        }

        // Laid down at real speed; the whole thing is scaled at the end.
        var cursor = CMTime.zero
        var starts: [(CMTime, Segment)] = []
        for seg in tl.segments {
            guard let src = sources[seg.take] else { continue }
            // A cut edge can land a few ms past the end of the take's track,
            // and inserting beyond it fails the whole edit.
            let range = CMTimeRange(start: CMTime(seconds: seg.src0, preferredTimescale: 600),
                                    end: CMTime(seconds: seg.src1, preferredTimescale: 600)).intersection(src.range)
            guard range.duration.seconds > 0.02 else { continue }
            try vTrack.insertTimeRange(range, of: src.video, at: cursor)
            if let a = src.audio { try? aTrack.insertTimeRange(range, of: a, at: cursor) }
            starts.append((cursor, seg))
            cursor = cursor + range.duration
        }
        let speed = tl.duration > 0 ? (cursor.seconds / tl.duration) : 1
        if abs(speed - 1) > 0.001 {
            comp.scaleTimeRange(CMTimeRange(start: .zero, duration: cursor),
                                toDuration: CMTime(seconds: cursor.seconds / speed, preferredTimescale: 600))
        }

        // Framing: each piece filled to 9:16, alternating zoom on every cut and
        // creeping in 2.5% over its length so a long take never sits still.
        // Ramps tile the timeline exactly: each one ends where the next starts
        // (rounded starts overlapped by a tick and made the composition invalid).
        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: vTrack)
        let scaled = starts.map { CMTimeMultiplyByFloat64($0.0, multiplier: 1 / speed) }
        for (k, (_, seg)) in starts.enumerated() {
            guard let src = sources[seg.take] else { continue }
            let a = scaled[k]
            let b = k + 1 < scaled.count ? scaled[k + 1] : comp.duration
            guard b > a else { continue }
            let from = frame(src.transform, src.natural, zoom: seg.zoom)
            let to = frame(src.transform, src.natural, zoom: seg.zoom * 1.025)
            layer.setTransformRamp(fromStart: from, toEnd: to, timeRange: CMTimeRange(start: a, end: b))
        }
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: comp.duration)
        instruction.layerInstructions = [layer]
        let video = AVMutableVideoComposition()
        video.renderSize = size
        video.frameDuration = CMTime(value: 1, timescale: fps)
        video.instructions = [instruction]
        return Built(composition: comp, video: video)
    }

    // Orient the frame, scale it to cover 1080x1920, then zoom toward the
    // upper middle where a face sits.
    private static func frame(_ t: CGAffineTransform, _ natural: CGSize, zoom: Double) -> CGAffineTransform {
        let rect = CGRect(origin: .zero, size: natural).applying(t)
        let base = max(size.width / rect.width, size.height / rect.height)
        let anchor = CGPoint(x: size.width / 2, y: size.height * 0.4)
        let dx = (size.width - rect.width * base) / 2, dy = (size.height - rect.height * base) / 2
        return t
            .concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
            .concatenating(CGAffineTransform(scaleX: base, y: base))
            .concatenating(CGAffineTransform(translationX: dx, y: dy))
            .concatenating(CGAffineTransform(translationX: -anchor.x, y: -anchor.y))
            .concatenating(CGAffineTransform(scaleX: zoom, y: zoom))
            .concatenating(CGAffineTransform(translationX: anchor.x, y: anchor.y))
    }

    // MARK: export

    // Two passes. The first renders the cut (framing, zoom, sound); the second
    // draws the captions over each frame with Core Image. Burning captions in
    // with Core Animation in one pass crashed the renderer, and a second pass
    // over an upright 1080x1920 file is simple and dependable.
    static func export(_ built: Built, groups: [CapGroup], style: CaptionStyle, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        let captions = style != .none && !groups.isEmpty
        let cut = try await run(built.composition, video: built.video, spectral: true) { progress(captions ? $0 * 0.6 : $0) }
        guard captions else { return cut }
        defer { try? FileManager.default.removeItem(at: cut) }

        let painter = CaptionPainter(groups: groups, style: style)
        let overlay = try await overlayComposition(cut, painter: painter)
        return try await run(AVURLAsset(url: cut), video: overlay, spectral: false) { progress(0.6 + $0 * 0.4) }
    }

    // Nonisolated on purpose: the handler runs on the export's own threads, and
    // a closure formed on the main actor would assert there.
    nonisolated private static func overlayComposition(_ url: URL, painter: CaptionPainter) async throws -> AVVideoComposition {
        try await AVMutableVideoComposition.videoComposition(with: AVURLAsset(url: url)) { request in
            var image = request.sourceImage
            if let (strip, y) = painter.strip(at: request.compositionTime.seconds) {
                image = strip.transformed(by: CGAffineTransform(translationX: 0, y: y)).composited(over: image)
            }
            request.finish(with: image, context: nil)
        }
    }

    private static func run(_ asset: AVAsset, video: AVVideoComposition, spectral: Bool, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHEVCHighestQuality) else {
            throw EditError("This iPhone cannot export video right now.")
        }
        session.videoComposition = video
        if spectral { session.audioTimePitchAlgorithm = .spectral }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("chumoku-\(UUID().uuidString.prefix(8)).mp4")
        let watch = Task {
            for await state in session.states(updateInterval: 0.2) {
                if case .exporting(let p) = state { progress(p.fractionCompleted) }
            }
        }
        defer { watch.cancel() }
        try await session.export(to: url, as: .mp4)
        progress(1)
        return url
    }
}

// How captions look, shared by the preview overlay and the export.
nonisolated enum CaptionLayers {
    static let yellow = UIColor(red: 1, green: 0.91, blue: 0.1, alpha: 1)

    struct Look: @unchecked Sendable {
        let font: UIFont
        let fill: UIColor
        let hot: UIColor
        let stroke: CGFloat // points of outline, 0 for shadow only
        let trackActive: Bool
        let y: CGFloat // vertical centre, share of height
    }

    static func look(_ style: CaptionStyle) -> Look {
        switch style {
        case .pop: Look(font: .systemFont(ofSize: 92, weight: .black), fill: .white, hot: yellow, stroke: 9, trackActive: true, y: 0.64)
        case .bold: Look(font: .systemFont(ofSize: 130, weight: .heavy, width: .compressed), fill: yellow, hot: .white, stroke: 12, trackActive: false, y: 0.64)
        case .word: Look(font: .systemFont(ofSize: 120, weight: .bold), fill: .white, hot: yellow, stroke: 0, trackActive: false, y: 0.6)
        case .clean, .none: Look(font: UIFont(name: "Geist-SemiBold", size: 60) ?? .systemFont(ofSize: 60, weight: .semibold), fill: .white, hot: yellow, stroke: 0, trackActive: false, y: 0.72)
        }
    }

    static func attributed(_ text: String, color: UIColor, look: Look) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [.font: look.font, .foregroundColor: color])
    }

    // The outline alone, twice as wide as it should look: it is drawn first and
    // the fill goes on top, so the outline sits outside the letters instead of
    // eating into them (a combined stroke-and-fill hollowed out heavy type).
    static func outline(_ text: String, look: Look) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: look.font,
            .strokeColor: UIColor.black,
            .strokeWidth: look.stroke * 2 / look.font.pointSize * 100, // positive: stroke only
        ])
    }
}

// Draws one caption state (a phrase, with which word is lit) into a strip the
// width of the frame, on demand, and keeps the last one: the export asks for
// the same state frame after frame. Called from the export's render threads.
nonisolated final class CaptionPainter: @unchecked Sendable {
    private struct State { let t0: Double; let t1: Double; let group: Int; let lit: Int? }
    private let groups: [CapGroup]
    private let look: CaptionLayers.Look
    private let states: [State]
    private let lock = NSLock()
    private var cached: (Int, CIImage, CGFloat)?

    init(groups: [CapGroup], style: CaptionStyle) {
        self.groups = groups
        self.look = CaptionLayers.look(style)
        var states: [State] = []
        for (gi, g) in groups.enumerated() {
            if look.trackActive {
                for (wi, w) in g.words.enumerated() {
                    let end = wi + 1 < g.words.count ? g.words[wi + 1].t0 : g.t1
                    let start = wi == 0 ? g.t0 : w.t0
                    if end > start { states.append(State(t0: start, t1: end, group: gi, lit: wi)) }
                }
            } else {
                states.append(State(t0: g.t0, t1: g.t1, group: gi, lit: nil))
            }
        }
        self.states = states
    }

    // The strip to draw at time t, and the y (Core Image, bottom-up) to put it at.
    func strip(at t: Double) -> (CIImage, CGFloat)? {
        var lo = 0, hi = states.count - 1, found: Int?
        while lo <= hi {
            let mid = (lo + hi) / 2
            if t < states[mid].t0 { hi = mid - 1 } else if t >= states[mid].t1 { lo = mid + 1 } else { found = mid; break }
        }
        guard let i = found else { return nil }
        lock.lock(); defer { lock.unlock() }
        if let c = cached, c.0 == i { return (c.1, c.2) }
        let (image, y) = draw(states[i])
        cached = (i, image, y)
        return (image, y)
    }

    private func draw(_ state: State) -> (CIImage, CGFloat) {
        let g = groups[state.group]
        let size = Renderer.size
        let space = (" " as NSString).size(withAttributes: [.font: look.font]).width
        let lineH = look.font.lineHeight * 1.05
        var lines: [[(Int, CGSize)]] = [[]]
        var lineW: CGFloat = 0
        for (i, w) in g.words.enumerated() {
            let sz = CaptionLayers.attributed(w.text, color: .white, look: look).size()
            if !lines[lines.count - 1].isEmpty && lineW + space + sz.width > 900 { lines.append([]); lineW = 0 }
            lines[lines.count - 1].append((i, sz))
            lineW += (lineW > 0 ? space : 0) + sz.width
        }
        let pad: CGFloat = 40
        let stripH = CGFloat(lines.count) * lineH + pad * 2
        let top = size.height * look.y - stripH / 2

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let img = UIGraphicsImageRenderer(size: CGSize(width: size.width, height: stripH), format: format).image { ctx in
            let cg = ctx.cgContext
            cg.setShadow(offset: CGSize(width: 0, height: look.stroke > 0 ? 4 : 2), blur: look.stroke > 0 ? 10 : 18,
                         color: UIColor.black.withAlphaComponent(look.stroke > 0 ? 0.5 : 0.8).cgColor)
            for (li, line) in lines.enumerated() {
                let total = line.reduce(0) { $0 + $1.1.width } + space * CGFloat(line.count - 1)
                var x = (size.width - total) / 2
                for (wi, sz) in line {
                    let w = g.words[wi]
                    let color = w.hot || (look.trackActive && wi == state.lit) ? look.hot : look.fill
                    let at = CGPoint(x: x, y: pad + CGFloat(li) * lineH)
                    if look.stroke > 0 {
                        CaptionLayers.outline(w.text, look: look).draw(at: at)
                        cg.setShadow(offset: .zero, blur: 0, color: nil) // the shadow belongs to the outline only
                    }
                    CaptionLayers.attributed(w.text, color: color, look: look).draw(at: at)
                    if look.stroke > 0 {
                        cg.setShadow(offset: CGSize(width: 0, height: 4), blur: 10, color: UIColor.black.withAlphaComponent(0.5).cgColor)
                    }
                    x += sz.width + space
                }
            }
        }
        let ci = CIImage(image: img) ?? CIImage.empty()
        return (ci, size.height - top - stripH)
    }
}
