import AVFoundation
import UIKit
import CoreImage

// Turns a Timeline into something AVFoundation plays and exports: the kept
// pieces of every take laid end to end, sped up without changing pitch,
// framed 9:16 with a slow push and a jump-cut zoom, video overlays on their
// own track, music under the voice; captions, text and pictures are drawn on
// export in a second pass.
enum Renderer {
    nonisolated static let size = CGSize(width: 1080, height: 1920)
    static let fps: Int32 = 30

    struct Built {
        let composition: AVMutableComposition
        let video: AVMutableVideoComposition
        let audio: AVMutableAudioMix
    }

    struct Inputs {
        var takes: [URL]
        var cleanAudio: [URL?] // voice-isolated sound per take, when that is on
        var folder: URL // the shoot's folder, where overlays and music live
        var media: [MediaOverlay]
        var audio: AudioSettings
    }

    static func build(_ tl: Timeline, _ input: Inputs) async throws -> Built {
        let comp = AVMutableComposition()
        guard let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw EditError("Could not start the edit.")
        }
        // The asset is kept alive here on purpose: a track only holds its asset
        // weakly, and inserting from a track whose asset is gone fails (-12780).
        struct Source { let assets: [AVURLAsset]; let video: AVAssetTrack; let audio: AVAssetTrack?; let transform: CGAffineTransform; let natural: CGSize; let range: CMTimeRange }
        var sources: [Int: Source] = [:]
        for (i, url) in input.takes.enumerated() {
            let asset = AVURLAsset(url: url)
            guard let v = try await asset.loadTracks(withMediaType: .video).first else { continue }
            var assets = [asset]
            var a = try await asset.loadTracks(withMediaType: .audio).first
            if i < input.cleanAudio.count, let clean = input.cleanAudio[i] {
                let ca = AVURLAsset(url: clean)
                if let t = try? await ca.loadTracks(withMediaType: .audio).first { a = t; assets.append(ca) }
            }
            let (t, n, r) = try await v.load(.preferredTransform, .naturalSize, .timeRange)
            sources[i] = Source(assets: assets, video: v, audio: a, transform: t, natural: n, range: r)
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
        let total = comp.duration

        // Framing: each piece filled to 9:16, alternating zoom on every cut and
        // creeping in 2.5% over its length so a long take never sits still.
        // Ramps tile the timeline exactly: each one ends where the next starts
        // (rounded starts overlapped by a tick and made the composition invalid).
        let main = AVMutableVideoCompositionLayerInstruction(assetTrack: vTrack)
        let scaled = starts.map { CMTimeMultiplyByFloat64($0.0, multiplier: 1 / speed) }
        for (k, (_, seg)) in starts.enumerated() {
            guard let src = sources[seg.take] else { continue }
            let a = scaled[k]
            let b = k + 1 < scaled.count ? scaled[k + 1] : total
            guard b > a else { continue }
            layerRamp(main, src.transform, src.natural, seg.zoom, CMTimeRange(start: a, end: b))
        }

        // Video overlays, after the speed-up so they play at their own speed,
        // each on its own track above the picture.
        var layers: [AVMutableVideoCompositionLayerInstruction] = []
        var keep: [AVURLAsset] = []
        for m in input.media where m.kind == .video {
            let asset = AVURLAsset(url: input.folder.appendingPathComponent(m.file))
            guard let v = try? await asset.loadTracks(withMediaType: .video).first,
                  let (t, n, r) = try? await v.load(.preferredTransform, .naturalSize, .timeRange),
                  let track = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { continue }
            keep.append(asset)
            let start = CMTime(seconds: max(0, m.start), preferredTimescale: 600)
            let len = min(CMTime(seconds: max(0.1, m.end - m.start), preferredTimescale: 600), r.duration, total - start)
            guard len.seconds > 0.05 else { continue }
            try? track.insertTimeRange(CMTimeRange(start: r.start, duration: len), of: v, at: start)
            let li = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
            li.setTransform(overlayTransform(t, n, m), at: .zero)
            li.setOpacity(0, at: start + len)
            layers.append(li)
        }
        _ = keep

        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: total)
        instruction.layerInstructions = layers.reversed() + [main]
        let video = AVMutableVideoComposition()
        video.renderSize = size
        video.frameDuration = CMTime(value: 1, timescale: fps)
        video.instructions = [instruction]

        // Sound: the voice at its level, music looped underneath and faded out.
        let mix = AVMutableAudioMix()
        let voice = AVMutableAudioMixInputParameters(track: aTrack)
        voice.setVolume(Float(input.audio.voice), at: .zero)
        var params = [voice]
        if let file = input.audio.musicFile,
           let mTrackSrc = try? await AVURLAsset(url: input.folder.appendingPathComponent(file)).loadTracks(withMediaType: .audio).first,
           let mr = try? await mTrackSrc.load(.timeRange), mr.duration.seconds > 0.5,
           let mTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
            var at = CMTime.zero
            while at < total {
                let len = min(mr.duration, total - at)
                try? mTrack.insertTimeRange(CMTimeRange(start: mr.start, duration: len), of: mTrackSrc, at: at)
                at = at + len
            }
            let mp = AVMutableAudioMixInputParameters(track: mTrack)
            let fade = CMTime(seconds: min(1.5, total.seconds / 4), preferredTimescale: 600)
            mp.setVolume(Float(input.audio.music), at: .zero)
            mp.setVolumeRamp(fromStartVolume: Float(input.audio.music), toEndVolume: 0, timeRange: CMTimeRange(start: total - fade, duration: fade))
            params.append(mp)
        }
        mix.inputParameters = params
        return Built(composition: comp, video: video, audio: mix)
    }

    private static func layerRamp(_ li: AVMutableVideoCompositionLayerInstruction, _ t: CGAffineTransform, _ n: CGSize, _ zoom: Double, _ range: CMTimeRange) {
        li.setTransformRamp(fromStart: frame(t, n, zoom: zoom), toEnd: frame(t, n, zoom: zoom * 1.025), timeRange: range)
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

    // An overlay video oriented, scaled to its width and centred on its spot.
    private static func overlayTransform(_ t: CGAffineTransform, _ natural: CGSize, _ m: MediaOverlay) -> CGAffineTransform {
        let rect = CGRect(origin: .zero, size: natural).applying(t)
        let w = size.width * m.width
        let s = w / rect.width
        let h = rect.height * s
        return t
            .concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
            .concatenating(CGAffineTransform(scaleX: s, y: s))
            .concatenating(CGAffineTransform(translationX: size.width * m.x - w / 2, y: size.height * m.y - h / 2))
    }

    // MARK: export

    // Two passes. The first renders the cut (framing, zoom, overlays, sound);
    // the second draws captions, text and pictures over each frame with Core
    // Image. Burning them in with Core Animation in one pass crashed the renderer.
    static func export(_ built: Built, painter: OverlayPainter, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        let draws = !painter.isEmpty
        let cut = try await run(built.composition, video: built.video, audio: built.audio) { progress(draws ? $0 * 0.6 : $0) }
        guard draws else { return cut }
        defer { try? FileManager.default.removeItem(at: cut) }
        let overlay = try await overlayComposition(cut, painter: painter)
        return try await run(AVURLAsset(url: cut), video: overlay, audio: nil) { progress(0.6 + $0 * 0.4) }
    }

    // Nonisolated on purpose: the handler runs on the export's own threads, and
    // a closure formed on the main actor would assert there.
    nonisolated private static func overlayComposition(_ url: URL, painter: OverlayPainter) async throws -> AVVideoComposition {
        try await AVMutableVideoComposition.videoComposition(with: AVURLAsset(url: url)) { request in
            let image = painter.paint(over: request.sourceImage, at: request.compositionTime.seconds)
            request.finish(with: image, context: nil)
        }
    }

    private static func run(_ asset: AVAsset, video: AVVideoComposition, audio: AVAudioMix?, progress: @escaping @Sendable (Double) -> Void) async throws -> URL {
        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHEVCHighestQuality) else {
            throw EditError("This iPhone cannot export video right now.")
        }
        session.videoComposition = video
        if let audio { session.audioMix = audio; session.audioTimePitchAlgorithm = .spectral }
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
    struct Look: @unchecked Sendable {
        let font: UIFont
        let fill: UIColor
        let hot: UIColor
        let stroke: CGFloat // points of outline, 0 for shadow only
        let trackActive: Bool
        let y: CGFloat // centre, share of height
        var x: CGFloat = 0.5 // centre, share of width
    }

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

    // Draws words in lines centred on `center`, wrapping past `maxWidth`.
    // Used for captions (with a lit word) and for text overlays.
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
                let at = CGPoint(x: x, y: top + CGFloat(li) * lineH)
                if stroke > 0 {
                    outline(t, font: font, width: stroke).draw(at: at)
                    cg.saveGState(); cg.setShadow(offset: .zero, blur: 0, color: nil)
                    attributed(t, color: c, font: font).draw(at: at)
                    cg.restoreGState()
                } else {
                    attributed(t, color: c, font: font).draw(at: at)
                }
                x += sz.width + space
            }
        }
    }
}

// Paints captions, text overlays and pictures over a frame of the export.
// Each distinct state (which phrase, which word lit, which texts and pictures
// show) is drawn once into a full-frame image and reused frame after frame.
// Called from the export's render threads.
nonisolated final class OverlayPainter: @unchecked Sendable {
    private struct Cap { let t0: Double; let t1: Double; let group: Int; let lit: Int? }
    private let groups: [CapGroup]
    private let look: CaptionLayers.Look?
    private let caps: [Cap]
    private let texts: [TextOverlay]
    private let images: [(MediaOverlay, UIImage)]
    private let lock = NSLock()
    private var cached: (String, CIImage?)?

    var isEmpty: Bool { caps.isEmpty && texts.isEmpty && images.isEmpty }

    init(groups: [CapGroup], captions: CaptionSettings, texts: [TextOverlay], images: [(MediaOverlay, UIImage)]) {
        self.groups = groups
        self.texts = texts
        self.images = images
        guard captions.preset != .none else { look = nil; caps = []; return }
        let look = captions.look
        self.look = look
        var caps: [Cap] = []
        for (gi, g) in groups.enumerated() {
            if look.trackActive {
                for (wi, w) in g.words.enumerated() {
                    let end = wi + 1 < g.words.count ? g.words[wi + 1].t0 : g.t1
                    let start = wi == 0 ? g.t0 : w.t0
                    if end > start { caps.append(Cap(t0: start, t1: end, group: gi, lit: wi)) }
                }
            } else {
                caps.append(Cap(t0: g.t0, t1: g.t1, group: gi, lit: nil))
            }
        }
        self.caps = caps
    }

    func paint(over frame: CIImage, at t: Double) -> CIImage {
        let cap = capIndex(at: t)
        let shownTexts = texts.indices.filter { t >= texts[$0].start && t < texts[$0].end }
        let shownImages = images.indices.filter { t >= images[$0].0.start && t < images[$0].0.end }
        let key = "\(cap ?? -1)|\(shownTexts)|\(shownImages)"
        lock.lock()
        let layer: CIImage?
        if let c = cached, c.0 == key { layer = c.1 } else {
            layer = (cap == nil && shownTexts.isEmpty && shownImages.isEmpty) ? nil : draw(cap: cap, texts: shownTexts, images: shownImages)
            cached = (key, layer)
        }
        lock.unlock()
        return layer.map { $0.composited(over: frame) } ?? frame
    }

    private func capIndex(at t: Double) -> Int? {
        var lo = 0, hi = caps.count - 1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if t < caps[mid].t0 { hi = mid - 1 } else if t >= caps[mid].t1 { lo = mid + 1 } else { return mid }
        }
        return nil
    }

    private func draw(cap: Int?, texts shownTexts: [Int], images shownImages: [Int]) -> CIImage? {
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
            if let ci = cap, let look {
                let c = caps[ci], g = groups[c.group]
                cg.saveGState()
                cg.setShadow(offset: CGSize(width: 0, height: look.stroke > 0 ? 4 : 2), blur: look.stroke > 0 ? 10 : 18,
                             color: UIColor.black.withAlphaComponent(look.stroke > 0 ? 0.5 : 0.8).cgColor)
                let words = g.words.enumerated().map { (wi, w) in
                    (w.text, w.hot || (look.trackActive && wi == c.lit) ? look.hot : look.fill)
                }
                CaptionLayers.draw(words, font: look.font, stroke: look.stroke, maxWidth: 900,
                                   center: CGPoint(x: size.width * look.x, y: size.height * look.y), in: cg)
                cg.restoreGState()
            }
        }
        return CIImage(image: img)
    }
}
