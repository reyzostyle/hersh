import SwiftUI
import AVFoundation
import Combine

// The state of one shoot's edit, saved to edit.json in the shoot's folder.
@Observable
final class EditModel {
    enum Phase: Equatable { case listening(Double), ready, failed(String) }

    let shootId: String
    var phase: Phase = .listening(0)
    var heard: [Heard] = []
    var durations: [Double] = []
    var urls: [URL] = []
    var folder: URL?

    var plan = Plan()
    var settings = EditSettings()
    var captions = CaptionSettings()
    var texts: [TextOverlay] = []
    var media: [MediaOverlay] = []
    var audio = AudioSettings()
    var clean: [URL?] = []
    var cleaning: Double?

    var timeline = Timeline()
    var groups: [CapGroup] = []
    var planning = false
    var planStarted: Date?
    var message: String?
    let player = AVPlayer()
    var built: Renderer.Built?
    var exporting: Double?
    var exported: URL?
    var time: Double = 0
    var playing = false
    private var rebuildTask: Task<Void, Never>?
    private var observer: Any?
    private var images: [String: UIImage] = [:]

    init(shootId: String) {
        self.shootId = shootId
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { [weak self] t in
            MainActor.assumeIsolated {
                self?.time = t.seconds
                self?.playing = (self?.player.rate ?? 0) > 0
            }
        }
    }

    // MARK: load and save

    func load(_ films: FilmStore) async {
        guard let shoot = films.shoot(shootId), !shoot.takes.isEmpty else { phase = .failed("No takes yet. Film something first."); return }
        urls = shoot.takes.map { films.url($0, in: shoot) }
        folder = films.folder(shoot)
        trace("load: \(urls.count) takes")
        heard = []
        durations = []
        do {
            for (i, url) in urls.enumerated() {
                let n = Double(urls.count)
                let h = try await Listener.heard(url) { p in
                    Task { @MainActor in self.phase = .listening((Double(i) + p) / n) }
                }
                heard.append(h)
                durations.append(Double(h.env.count) * Listener.hop)
                trace("load: take \(i + 1) heard, \(h.words.count) words, \(Int(Double(h.env.count) * Listener.hop)) s")
            }
            restore()
            films.nameFromSpeech(shootId, words: heard.first?.words.map(\.text) ?? [])
            if audio.cleanVoice { await setCleanVoice(true) }
            phase = .ready
            rebuild()
        } catch {
            trace("load: failed \(error)")
            phase = .failed(error.localizedDescription)
        }
    }

    private var docURL: URL? { folder?.appendingPathComponent("edit.json") }

    private func restore() {
        let words = heard.map(\.words)
        guard let url = docURL, let data = try? Data(contentsOf: url), let doc = try? JSONDecoder().decode(EditDoc.self, from: data) else {
            plan = Plan.keepAll(words)
            return
        }
        // A saved cut only applies to the takes it was made for.
        let valid = (doc.kept ?? []).allSatisfy { words.indices.contains($0.c) && words[$0.c].indices.contains($0.i) }
        plan = valid && doc.kept != nil
            ? Plan(kept: Set(doc.kept ?? []), rank: doc.rank ?? [:], fixes: doc.fixes ?? [:], hot: Set(doc.hot ?? []), note: doc.note ?? "")
            : Plan.keepAll(words)
        settings = EditSettings(pace: doc.pace, speed: doc.speed, zoom: doc.zoom)
        captions = doc.captions
        texts = doc.texts
        media = doc.media
        audio = doc.audio
    }

    func save() {
        guard let url = docURL else { return }
        let doc = EditDoc(kept: Array(plan.kept), rank: plan.rank, fixes: plan.fixes, hot: Array(plan.hot), note: plan.note,
                          pace: settings.pace, speed: settings.speed, zoom: settings.zoom,
                          captions: captions, texts: texts, media: media, audio: audio)
        if let data = try? JSONEncoder().encode(doc) { try? data.write(to: url, options: .atomic) }
    }

    // MARK: the cut

    func cut(script: String, notes: String) async {
        planning = true
        planStarted = .now
        message = nil
        defer { planning = false; planStarted = nil }
        do {
            plan = try await Planner.plan(heard.map(\.words), script: script, notes: notes)
            rebuild()
        } catch {
            message = (error as? EditError)?.message ?? "Could not pick the takes. Try again."
        }
    }

    func toggle(_ key: WKey, hot: Bool) {
        if hot {
            if plan.hot.contains(key) { plan.hot.remove(key) } else { plan.hot.insert(key); plan.kept.insert(key) }
        } else {
            if plan.kept.contains(key) { plan.kept.remove(key) } else { plan.kept.insert(key) }
        }
        rebuild()
    }

    func keepEverything() {
        plan = Plan.keepAll(heard.map(\.words))
        rebuild()
    }

    // Captions only re-group; nothing in the picture changes.
    func regroup() {
        groups = Cutter.groups(timeline.caps, captions: captions)
        exported = nil
        save()
    }

    // Recomputes the cut and the composition, keeping the playhead.
    func rebuild() {
        timeline = Cutter.build(heard, durations: durations, plan: plan, settings: settings)
        groups = Cutter.groups(timeline.caps, captions: captions)
        exported = nil
        save()
        rebuildTask?.cancel()
        guard let folder else { return }
        let tl = timeline
        let input = Renderer.Inputs(takes: urls, cleanAudio: audio.cleanVoice ? clean : [], folder: folder, media: media, audio: audio)
        let at = player.currentTime(), wasPlaying = player.rate > 0
        rebuildTask = Task {
            let built: Renderer.Built
            do { built = try await Renderer.build(tl, input) } catch {
                trace("rebuild: failed \(error)")
                message = "Could not build the preview: \(error.localizedDescription)"
                return
            }
            guard !Task.isCancelled else { return }
            trace("rebuild: \(tl.segments.count) pieces, \(Int(tl.duration)) s")
            self.built = built
            let item = AVPlayerItem(asset: built.composition)
            item.videoComposition = built.video
            item.audioMix = built.audio
            item.audioTimePitchAlgorithm = .spectral
            player.replaceCurrentItem(with: item)
            await player.seek(to: min(at, built.composition.duration), toleranceBefore: .zero, toleranceAfter: .zero)
            if wasPlaying { player.play() }
            // Some players (the Simulator's, at least) refuse a custom video
            // composition outright. The preview then plays the plain cut; the
            // export still renders everything.
            for await status in item.publisher(for: \.status).values where status != .unknown {
                if status == .failed { trace("preview: player refused the composition, \(item.error.map { "\($0)" } ?? "")") }
                if status == .failed, !Task.isCancelled {
                    let plain = AVPlayerItem(asset: built.composition)
                    plain.audioMix = built.audio
                    plain.audioTimePitchAlgorithm = .spectral
                    player.replaceCurrentItem(with: plain)
                    await player.seek(to: min(at, built.composition.duration), toleranceBefore: .zero, toleranceAfter: .zero)
                    if wasPlaying { player.play() }
                }
                break
            }
        }
    }

    // MARK: playback

    func togglePlay() {
        if player.rate > 0 { player.pause() } else {
            if time >= timeline.duration - 0.1 { player.seek(to: .zero) }
            player.play()
        }
    }

    func seek(_ t: Double) {
        player.seek(to: CMTime(seconds: t, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        time = t
    }

    // MARK: text and overlays

    func addText(_ text: String) -> String {
        let start = min(time, max(0, timeline.duration - 0.5))
        let t = TextOverlay(text: text, start: start, end: min(timeline.duration, start + 3))
        texts.append(t)
        regroup()
        return t.id
    }

    func addMedia(kind: MediaOverlay.Kind, file: String, aspect: Double, duration: Double?) -> String {
        let start = min(time, max(0, timeline.duration - 0.5))
        let len = kind == .video ? min(duration ?? 3, timeline.duration - start) : 3
        let m = MediaOverlay(kind: kind, file: file, aspect: aspect, start: start, end: min(timeline.duration, start + len))
        media.append(m)
        if kind == .video { rebuild() } else { regroup() }
        return m.id
    }

    func image(for m: MediaOverlay) -> UIImage? {
        if let i = images[m.file] { return i }
        guard let folder, let img = UIImage(contentsOfFile: folder.appendingPathComponent(m.file).path) else { return nil }
        images[m.file] = img
        return img
    }

    // MARK: sound

    func setCleanVoice(_ on: Bool) async {
        audio.cleanVoice = on
        guard on else { rebuild(); return }
        if clean.count != urls.count || clean.contains(where: { $0 == nil }) {
            cleaning = 0
            var out: [URL?] = []
            for (i, url) in urls.enumerated() {
                out.append(try? await Cleaner.clean(url))
                cleaning = Double(i + 1) / Double(urls.count)
            }
            clean = out
            cleaning = nil
        }
        rebuild()
    }

    // MARK: export

    func export() async {
        guard let built else { return }
        player.pause()
        exporting = 0
        defer { exporting = nil }
        let painter = OverlayPainter(groups: groups, captions: captions, texts: texts,
                                     images: media.filter { $0.kind == .image }.compactMap { m in image(for: m).map { (m, $0) } })
        trace("export: start, \(Int(timeline.duration)) s, \(groups.count) caption groups, \(texts.count) texts, \(media.count) overlays")
        let started = Date()
        do {
            let url = try await Renderer.export(built, painter: painter) { p in
                Task { @MainActor in self.exporting = p }
            }
            exported = url
            let saved = await FilmStore.saveToPhotos(url)
            trace("export: done in \(Int(Date().timeIntervalSince(started))) s, saved to Photos: \(saved)")
            if !saved { message = "Exported, but Photos access is off. Use Share to save it." }
        } catch {
            trace("export: failed \(error)")
            message = "Export failed: \(error.localizedDescription)"
        }
    }
}
