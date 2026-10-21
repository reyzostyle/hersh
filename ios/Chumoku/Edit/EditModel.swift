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
    var clips: [ClipEdit]? // the edit by hand, once you touch a clip
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
    var exported: URL? // saved to Photos, for the edit as it is now
    var rendered: URL? // the finished video for the edit as it is now
    var reviewPhase: ReviewPhase = .idle

    enum ReviewPhase: Equatable {
        case idle, rendering, uploading, watching(Date), done(Review), failed(String)
        var isDone: Bool { if case .done = self { true } else { false } }
        var busy: Bool { switch self { case .rendering, .uploading, .watching: true; default: false } }
    }
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
        Self.playbackAudio()
        guard let shoot = films.shoot(shootId), !shoot.takes.isEmpty else { phase = .failed("No takes yet. Film something first."); return }
        urls = shoot.takes.map { films.url($0, in: shoot) }
        folder = films.folder(shoot)
        trace("load: \(urls.count) takes")
        heard = []
        durations = []
        do {
            for (i, url) in urls.enumerated() {
                let n = Double(urls.count)
                // Progress arrives on the recogniser's thread and is hopped to
                // the main actor; a late hop must not undo "ready" (it did:
                // the editor sat on a full bar forever after a 2 minute take).
                let h = try await Listener.heard(url) { p in
                    Task { @MainActor in
                        if case .listening(let old) = self.phase, (Double(i) + p) / n > old { self.phase = .listening((Double(i) + p) / n) }
                    }
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
        // Segments filmed after this edit was saved join it whole, at the end.
        let known = doc.takes ?? ((doc.kept ?? []).map(\.c).max().map { $0 + 1 } ?? words.count)
        let added = known < words.count ? Array(known..<words.count) : []
        for c in added { for i in words[c].indices { plan.kept.insert(WKey(c: c, i: i)) } }
        settings = EditSettings(pace: doc.pace, speed: doc.speed, zoom: doc.zoom)
        captions = doc.captions
        texts = doc.texts
        media = doc.media
        audio = doc.audio
        // Hand-placed clips only if they still point inside these takes.
        if let c = doc.clips, !c.isEmpty,
           c.allSatisfy({ durations.indices.contains($0.take) && $0.src0 >= 0 && $0.src1 <= durations[$0.take] + 0.5 && $0.length > 0.05 }) {
            clips = c + added.map { ClipEdit(take: $0, src0: 0, src1: durations[$0]) }
        }
    }

    func save() {
        guard let url = docURL else { return }
        let doc = EditDoc(kept: Array(plan.kept), rank: plan.rank, fixes: plan.fixes, hot: Array(plan.hot), note: plan.note,
                          pace: settings.pace, speed: settings.speed, zoom: settings.zoom,
                          captions: captions, texts: texts, media: media, audio: audio, clips: clips, takes: heard.count)
        if let data = try? JSONEncoder().encode(doc) { try? data.write(to: url, options: .atomic) }
    }

    // MARK: the cut

    func cut(script: String, notes: String) async {
        trace("cut: tapped, script \(script.count) chars, notes \(notes.count) chars")
        planning = true
        planStarted = .now
        message = nil
        defer { planning = false; planStarted = nil }
        do {
            plan = try await Planner.plan(heard.map(\.words), script: script, notes: notes)
            clips = nil
            trace("cut: applied, \(plan.kept.count) words kept")
            rebuild()
        } catch {
            trace("cut: shown error \((error as? EditError)?.message ?? "\(error)")")
            message = (error as? EditError)?.message ?? "Could not pick the takes. Try again."
        }
    }

    func toggle(_ key: WKey, hot: Bool) {
        if clips != nil {
            if hot {
                if plan.hot.contains(key) { plan.hot.remove(key) } else { plan.hot.insert(key); if !isKept(key) { keepWord(key) } }
            } else if isKept(key) { cutWord(key) } else { keepWord(key) }
            rebuild()
            return
        }
        if hot {
            if plan.hot.contains(key) { plan.hot.remove(key) } else { plan.hot.insert(key); plan.kept.insert(key) }
        } else {
            if plan.kept.contains(key) { plan.kept.remove(key) } else { plan.kept.insert(key) }
        }
        rebuild()
    }

    // A word the speech recognition got wrong, spelled the way it should read.
    func fix(_ key: WKey, text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let heardText = heard.indices.contains(key.c) && heard[key.c].words.indices.contains(key.i) ? heard[key.c].words[key.i].text : ""
        plan.fixes[key] = t.isEmpty || t == heardText ? nil : t
        // Only the captions change; the picture and sound stay as they are.
        timeline = clips.map { Cutter.build(heard, clips: $0, plan: plan, settings: settings) }
            ?? Cutter.build(heard, durations: durations, plan: plan, settings: settings)
        regroup()
    }

    func keepEverything() {
        plan = Plan.keepAll(heard.map(\.words))
        clips = nil
        rebuild()
    }

    // Whether a word plays in the edit as it stands.
    func isKept(_ key: WKey) -> Bool {
        guard let clips else { return plan.kept.contains(key) }
        guard let w = word(key) else { return false }
        let mid = (w.s + w.e) / 2
        return clips.contains { $0.take == key.c && mid >= $0.src0 && mid <= $0.src1 }
    }

    private func word(_ key: WKey) -> Word? {
        heard.indices.contains(key.c) && heard[key.c].words.indices.contains(key.i) ? heard[key.c].words[key.i] : nil
    }

    // MARK: clips by hand

    // The clips as they play now; the first hand edit starts from these.
    var editableClips: [ClipEdit] {
        // Ids are fixed by position, so a clip picked in the automatic cut is
        // still the same clip after the first edit.
        clips ?? timeline.segments.enumerated().map { ClipEdit(id: "a\($0.offset)", take: $0.element.take, src0: $0.element.src0, src1: $0.element.src1) }
    }

    private func setClips(_ c: [ClipEdit]) {
        clips = c.filter { $0.length > 0.05 }
        rebuild()
    }

    // Where the clip starts in the finished video.
    func outStart(of id: String) -> Double {
        var t = 0.0
        for c in editableClips {
            if c.id == id { return t }
            t += c.length / settings.speed
        }
        return t
    }

    // Moves one edge of a clip by `delta` source seconds, within its take.
    func trim(_ id: String, start: Bool, by delta: Double) {
        var c = editableClips
        guard let i = c.firstIndex(where: { $0.id == id }) else { return }
        let dur = durations.indices.contains(c[i].take) ? durations[c[i].take] : c[i].src1
        if start { c[i].src0 = min(max(0, c[i].src0 + delta), c[i].src1 - 0.15) }
        else { c[i].src1 = max(min(dur, c[i].src1 + delta), c[i].src0 + 0.15) }
        setClips(c)
    }

    // Splits the clip under the playhead in two; returns the new right half.
    @discardableResult
    func split(at t: Double) -> String? {
        var c = editableClips
        var start = 0.0
        for i in c.indices {
            let len = c[i].length / settings.speed
            if t > start + 0.08 && t < start + len - 0.08 {
                let cut = c[i].src0 + (t - start) * settings.speed
                let right = ClipEdit(take: c[i].take, src0: cut, src1: c[i].src1)
                c[i].src1 = cut
                c.insert(right, at: i + 1)
                setClips(c)
                return right.id
            }
            start += len
        }
        return nil
    }

    func delete(_ id: String) {
        var c = editableClips
        c.removeAll { $0.id == id }
        guard !c.isEmpty else { message = "That's the last clip. Keep at least one."; return }
        setClips(c)
    }

    func move(_ id: String, by step: Int) {
        var c = editableClips
        guard let i = c.firstIndex(where: { $0.id == id }), c.indices.contains(i + step) else { return }
        c.swapAt(i, i + step)
        setClips(c)
    }

    func duplicate(_ id: String) {
        var c = editableClips
        guard let i = c.firstIndex(where: { $0.id == id }) else { return }
        c.insert(ClipEdit(take: c[i].take, src0: c[i].src0, src1: c[i].src1), at: i + 1)
        setClips(c)
    }

    // Back to the cut the app made, dropping the hand edits.
    func resetClips() {
        clips = nil
        rebuild()
    }

    // Cuts everything that plays before `t` in the finished video.
    func cutBefore(_ t: Double) {
        var c = editableClips
        var start = 0.0
        var out: [ClipEdit] = []
        for var clip in c {
            let len = clip.length / settings.speed
            if start + len <= t { start += len; continue }
            if start < t { clip.src0 += (t - start) * settings.speed }
            out.append(clip)
            start += len
        }
        c = out
        if !c.isEmpty { setClips(c) }
    }

    private func cutWord(_ key: WKey) {
        guard let w = word(key) else { return }
        var c = editableClips
        guard let i = c.firstIndex(where: { $0.take == key.c && (w.s + w.e) / 2 >= $0.src0 && (w.s + w.e) / 2 <= $0.src1 }) else { return }
        let clip = c[i]
        let a = ClipEdit(take: clip.take, src0: clip.src0, src1: max(clip.src0, w.s - 0.02))
        let b = ClipEdit(take: clip.take, src0: min(clip.src1, w.e + 0.02), src1: clip.src1)
        c.remove(at: i)
        c.insert(contentsOf: [a, b].filter { $0.length > 0.1 }, at: i)
        clips = c
    }

    private func keepWord(_ key: WKey) {
        guard let w = word(key) else { return }
        var c = editableClips
        let piece = ClipEdit(take: key.c, src0: max(0, w.s - 0.04), src1: w.e + 0.06)
        // After the clip holding the nearest kept word before it in the same take.
        let before = c.lastIndex { $0.take == key.c && $0.src0 <= w.s }
        let at = before.map { $0 + 1 } ?? 0
        c.insert(piece, at: at)
        // Joins it to its neighbours when they run on in the same take.
        var merged: [ClipEdit] = []
        for x in c {
            if var last = merged.last, last.take == x.take, x.src0 <= last.src1 + 0.05, x.src0 >= last.src0 {
                last.src1 = max(last.src1, x.src1)
                merged[merged.count - 1] = last
            } else {
                merged.append(x)
            }
        }
        clips = merged
    }

    // The exact frame at a clip edge while you drag it, shown over the
    // preview so you see where the cut lands.
    var edgeFrame: UIImage?
    @ObservationIgnored private var edgeTask: Task<Void, Never>?
    @ObservationIgnored private var edgeGens: [Int: AVAssetImageGenerator] = [:]

    func previewEdge(take: Int, at t: Double) {
        edgeTask?.cancel()
        guard urls.indices.contains(take) else { return }
        let gen = edgeGens[take] ?? {
            let g = AVAssetImageGenerator(asset: AVURLAsset(url: urls[take]))
            g.appliesPreferredTrackTransform = true
            g.maximumSize = CGSize(width: 720, height: 720)
            g.requestedTimeToleranceBefore = .zero
            g.requestedTimeToleranceAfter = .zero
            edgeGens[take] = g
            return g
        }()
        edgeTask = Task {
            try? await Task.sleep(for: .milliseconds(30))
            guard !Task.isCancelled, let cg = await Self.frame(gen, at: max(0, t)) else { return }
            if !Task.isCancelled { edgeFrame = UIImage(cgImage: cg) }
        }
    }

    func endEdgePreview() {
        edgeTask?.cancel()
        edgeFrame = nil
    }

    // A frame of a take for the clip strip.
    @ObservationIgnored private var thumbs: [String: UIImage] = [:]
    @ObservationIgnored private var generators: [Int: AVAssetImageGenerator] = [:]

    func thumb(take: Int, at t: Double) async -> UIImage? {
        let key = "\(take):\(Int(t * 2))"
        if let i = thumbs[key] { return i }
        guard urls.indices.contains(take) else { return nil }
        let gen = generators[take] ?? {
            let g = AVAssetImageGenerator(asset: AVURLAsset(url: urls[take]))
            g.appliesPreferredTrackTransform = true
            g.maximumSize = CGSize(width: 160, height: 160)
            g.requestedTimeToleranceBefore = CMTime(seconds: 0.4, preferredTimescale: 600)
            g.requestedTimeToleranceAfter = CMTime(seconds: 0.4, preferredTimescale: 600)
            generators[take] = g
            return g
        }()
        guard let cg = await Self.frame(gen, at: t) else { return nil }
        let img = UIImage(cgImage: cg)
        thumbs[key] = img
        return img
    }

    // Off the main actor: the generator calls back on its own thread.
    nonisolated private static func frame(_ gen: AVAssetImageGenerator, at t: Double) async -> CGImage? {
        nonisolated(unsafe) let g = gen
        return await withCheckedContinuation { cont in
            g.generateCGImageAsynchronously(for: CMTime(seconds: t, preferredTimescale: 600)) { img, _, _ in
                nonisolated(unsafe) let i = img
                cont.resume(returning: i)
            }
        }
    }

    // Captions only re-group; nothing in the picture changes.
    func regroup() {
        groups = Cutter.groups(timeline.caps, captions: captions)
        changed()
        save()
    }

    // Anything rendered no longer matches the edit.
    private func changed() {
        if let r = rendered { try? FileManager.default.removeItem(at: r) }
        exported = nil
        rendered = nil
    }

    // Recomputes the cut and the composition, keeping the playhead.
    func rebuild() {
        timeline = clips.map { Cutter.build(heard, clips: $0, plan: plan, settings: settings) }
            ?? Cutter.build(heard, durations: durations, plan: plan, settings: settings)
        groups = Cutter.groups(timeline.caps, captions: captions)
        changed()
        save()
        rebuildTask?.cancel()
        guard let folder else { return }
        let tl = timeline
        let input = Renderer.Inputs(takes: urls, cleanAudio: audio.cleanVoice ? clean : [], folder: folder, media: media, audio: audio)
        let wasPlaying = player.rate > 0
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
            // Where the playhead is now, not when the rebuild began: a trim
            // or split seeks to the new edge straight after asking for it.
            let at = CMTime(seconds: min(self.time, built.composition.duration.seconds), preferredTimescale: 600)
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

    // Sound out of the speaker even with the ring switch on silent, the way
    // TikTok's and CapCut's editors play. Without this the player used the
    // default category, which the silent switch mutes, and straight after
    // filming it inherited the camera's record session, which routes to the
    // earpiece: either way the edit looked silent.
    static func playbackAudio() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {
            trace("audio: could not set playback session \(error)")
        }
    }

    func togglePlay() {
        Self.playbackAudio()
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

    // Renders the finished video once per version of the edit; Export and
    // Check both use it, so checking and then exporting renders once.
    func render() async -> URL? {
        if let rendered, FileManager.default.fileExists(atPath: rendered.path) { return rendered }
        guard let built else { trace("render: tapped before the preview was built"); return nil }
        player.pause()
        exporting = 0
        defer { exporting = nil }
        let painter = OverlayPainter(groups: groups, captions: captions, texts: texts,
                                     images: media.filter { $0.kind == .image }.compactMap { m in image(for: m).map { (m, $0) } })
        trace("render: start, \(Int(timeline.duration)) s, \(groups.count) caption groups, \(texts.count) texts, \(media.count) overlays")
        let started = Date()
        do {
            let url = try await Renderer.export(built, painter: painter) { p in
                // Same race as the listening bar: a late hop after the
                // export ended would leave "100%" up for good.
                Task { @MainActor in if self.exporting != nil { self.exporting = p } }
            }
            trace("render: done in \(Int(Date().timeIntervalSince(started))) s")
            rendered = url
            return url
        } catch {
            trace("render: failed \(error)")
            message = "Export failed: \(error.localizedDescription)"
            return nil
        }
    }

    func export() async {
        trace("export: tapped")
        guard let url = await render() else { return }
        exported = url
        let saved = await FilmStore.saveToPhotos(url)
        trace("export: saved to Photos: \(saved)")
        if !saved { message = "Exported, but Photos access is off. Use Share to save it." }
    }

    // MARK: the last look

    func runReview(script: String) async {
        trace("review: tapped")
        reviewPhase = .rendering
        guard let url = await render() else { reviewPhase = .failed(message ?? "Could not render the video."); return }
        do {
            reviewPhase = .uploading
            let small = try await Shrink.small(url)
            defer { try? FileManager.default.removeItem(at: small) }
            let size = (try? FileManager.default.attributesOfItem(atPath: small.path)[.size] as? Int) ?? 0
            trace("review: small copy \(size / 1000) KB")
            let name = try await Reviewer.upload(small)
            reviewPhase = .watching(.now)
            let r = try await Reviewer.review(Reviewer.Body(geminiFileName: name, transcript: reviewTranscript, script: script,
                                                             duration: timeline.duration, facts: reviewFacts))
            trace("review: \(r.verdict) \(r.score)/10, \(r.notes.count) notes")
            reviewPhase = .done(r)
        } catch {
            trace("review: failed \(error)")
            reviewPhase = .failed((error as? EditError)?.message ?? "Could not check the video: \(error.localizedDescription)")
        }
    }

    // What is said, a phrase a line, with the second it starts.
    private var reviewTranscript: String {
        var lines: [String] = []
        var cur: [CapWord] = []
        for w in timeline.caps {
            cur.append(w)
            if cur.count >= 8 || [".", "?", "!"].contains(where: { w.text.hasSuffix($0) }) {
                lines.append(String(format: "%.1f ", cur[0].t0) + cur.map(\.text).joined(separator: " "))
                cur = []
            }
        }
        if let f = cur.first { lines.append(String(format: "%.1f ", f.t0) + cur.map(\.text).joined(separator: " ")) }
        return lines.joined(separator: "\n")
    }

    // What the editor knows that the picture alone does not say.
    private var reviewFacts: [String] {
        var f: [String] = []
        if captions.preset == .none { f.append("Captions: off.") } else {
            f.append("Captions: \(captions.preset.label) style, up to \(captions.maxWords) words at a time, centred at \(Int(captions.y * 100))% of the height.")
        }
        f.append("Speed: \(settings.speed)x, pauses cut \(settings.pace == .tight ? "tight" : "naturally").")
        f.append("Background noise removal: \(audio.cleanVoice ? "on" : "off").")
        if audio.musicFile != nil { f.append("Music underneath at \(Int(audio.music * 100))% volume.") }
        if !texts.isEmpty { f.append("Text on screen: " + texts.map { "\"\($0.text)\" at \(String(format: "%.1f", $0.start))s" }.joined(separator: ", ")) }
        return f
    }

    // A fix the review asked for, done the way the editor's own controls do it.
    func apply(fix: String, at: Double?) async {
        trace("review: applying \(fix)")
        switch fix {
        case "clean_audio": await setCleanVoice(true)
        case "tighter": settings.pace = .tight; rebuild()
        case "faster": settings.speed = 1.2; rebuild()
        case "captions_up": captions.y = min(captions.y, 0.6); regroup()
        case "captions_bigger": captions.size = min(200, captions.size * 1.15); regroup()
        case "trim_start":
            // Everything said before the real start goes.
            guard let at, at > 0.2 else { return }
            if clips != nil { cutBefore(at); return }
            for w in timeline.caps where w.t1 <= at + 0.05 { plan.kept.remove(w.key) }
            rebuild()
        default: break
        }
    }
}
