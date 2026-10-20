import Foundation
import AVFoundation
import Speech

// Every word of a take with its time, heard on the phone (Apple's on-device
// SpeechTranscriber, built for long recordings), plus how loud each 10 ms
// is. Both are cached next to the take, so a take is only ever listened to once.
nonisolated struct Word: Codable, Hashable, Sendable {
    var text: String
    var s: Double
    var e: Double
}

nonisolated struct Heard: Codable, Sendable {
    var words: [Word]
    var env: [Float] // dB per 10 ms
}

// Off the main actor: listening and measuring a long take must not stall the
// interface, and the recogniser calls back on its own queues.
nonisolated enum Listener {
    static let hop = 0.01

    static func cacheURL(for take: URL) -> URL { take.deletingPathExtension().appendingPathExtension("heard.json") }

    static func heard(_ take: URL, locale: Locale = Locale(identifier: "en-US"), progress: @escaping @Sendable (Double) -> Void) async throws -> Heard {
        let cache = cacheURL(for: take)
        if let data = try? Data(contentsOf: cache), let h = try? JSONDecoder().decode(Heard.self, from: data) { return h }

        // The transcriber reads audio files, not movies: pull the sound out first.
        let audio = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
        defer { try? FileManager.default.removeItem(at: audio) }
        guard let export = AVAssetExportSession(asset: AVURLAsset(url: take), presetName: AVAssetExportPresetAppleM4A) else {
            throw EditError("Could not read the sound of this take.")
        }
        try await export.export(to: audio, as: .m4a)
        progress(0.1)

        let env = try envelope(audio)
        progress(0.2)
        let duration = Double(env.count) * hop
        // The new long-form transcriber first; the older recogniser (also on
        // the phone) when the new one is not available for this device or language.
        let words: [Word]
        do {
            words = try await transcribe(audio, locale: locale, duration: duration, progress: progress)
        } catch {
            words = try await recognize(audio, locale: locale)
        }
        let heard = Heard(words: refine(words, env: env), env: env)
        if let data = try? JSONEncoder().encode(heard) { try? data.write(to: cache) }
        progress(1)
        return heard
    }

    private static func transcribe(_ audio: URL, locale: Locale, duration: Double, progress: @escaping @Sendable (Double) -> Void) async throws -> [Word] {
        guard let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale) else { throw EditError("Language not supported") }
        let transcriber = SpeechTranscriber(locale: supported, preset: .timeIndexedTranscriptionWithAlternatives)
        // The model for the language downloads once, the first time.
        if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await install.downloadAndInstall()
        }
        let file = try AVAudioFile(forReading: audio)
        let analyzer = SpeechAnalyzer(modules: [transcriber])

        let collect = Task { () throws -> [Word] in
            var words: [Word] = []
            for try await result in transcriber.results {
                let text = result.text
                for run in text.runs {
                    guard let range = run.audioTimeRange else { continue }
                    let piece = String(text[run.range].characters)
                    // A run can hold a word with its leading space, or several.
                    let parts = piece.split(whereSeparator: \.isWhitespace).map(String.init)
                    guard !parts.isEmpty else { continue }
                    let s = range.start.seconds, e = range.end.seconds
                    let step = (e - s) / Double(parts.count)
                    for (k, p) in parts.enumerated() {
                        words.append(Word(text: p, s: s + step * Double(k), e: s + step * Double(k + 1)))
                    }
                    if duration > 0 { progress(0.2 + 0.8 * min(1, e / duration)) }
                }
            }
            return words
        }
        _ = try await analyzer.analyzeSequence(from: file)
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        return try await collect.value.sorted { $0.s < $1.s }
    }

    private static func recognize(_ audio: URL, locale: Locale) async throws -> [Word] {
        let status = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
        }
        guard status == .authorized else { throw EditError("Allow Speech Recognition for Chumoku in Settings to cut by words.") }
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else { throw EditError("Speech recognition is not available right now.") }
        let request = SFSpeechURLRecognitionRequest(url: audio)
        request.shouldReportPartialResults = false
        request.addsPunctuation = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        return try await withCheckedThrowingContinuation { cont in
            nonisolated(unsafe) var done = false // the callback runs on one serial queue
            recognizer.recognitionTask(with: request) { result, error in
                if done { return }
                if let error { done = true; cont.resume(throwing: error); return }
                guard let result, result.isFinal else { return }
                done = true
                cont.resume(returning: result.bestTranscription.segments.map {
                    Word(text: $0.substring, s: $0.timestamp, e: $0.timestamp + $0.duration)
                })
            }
        }
    }

    // Loudness per 10 ms, in dB, read in chunks so a ten-minute take never
    // sits in memory whole.
    private static func envelope(_ audio: URL) throws -> [Float] {
        let file = try AVAudioFile(forReading: audio)
        let format = file.processingFormat
        let hopFrames = AVAudioFrameCount(format.sampleRate * hop)
        let chunk = hopFrames * 400
        guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunk) else { return [] }
        var env: [Float] = []
        env.reserveCapacity(Int(Double(file.length) / Double(hopFrames)) + 1)
        while file.framePosition < file.length {
            try file.read(into: buf, frameCount: chunk)
            let n = Int(buf.frameLength)
            guard n > 0, let ch = buf.floatChannelData else { break }
            let channels = Int(format.channelCount)
            var f = 0
            while f + Int(hopFrames) <= n {
                var sum: Float = 0
                for i in f..<(f + Int(hopFrames)) {
                    var v: Float = 0
                    for c in 0..<channels { v += ch[c][i] }
                    v /= Float(channels)
                    sum += v * v
                }
                env.append(10 * log10(sum / Float(hopFrames) + 1e-10))
                f += Int(hopFrames)
            }
        }
        return env
    }

    static func threshold(_ env: [Float]) -> Float {
        guard !env.isEmpty else { return -60 }
        let sorted = env.sorted()
        let floor = sorted[Int(Double(sorted.count) * 0.1)]
        let speech = sorted[min(sorted.count - 1, Int(Double(sorted.count) * 0.9))]
        return floor + max(6, (speech - floor) * 0.3)
    }

    // Words pulled in to where the voice is; words sitting wholly in silence
    // (the recogniser's guesses in a pause) are dropped.
    private static func refine(_ words: [Word], env: [Float]) -> [Word] {
        let thr = threshold(env)
        func loud(_ t: Double) -> Bool {
            let i = Int((t / hop).rounded())
            return i >= 0 && i < env.count && env[i] >= thr
        }
        var out: [Word] = []
        for w in words {
            var s = w.s, e = max(w.e, w.s + 0.05)
            var any = false
            var t = s
            while t <= e { if loud(t) { any = true; break }; t += hop }
            guard any else { continue }
            while s < e - 0.08 && !loud(s) { s += hop }
            while e > s + 0.08 && !loud(e) { e -= hop }
            out.append(Word(text: w.text, s: max(0, s - 0.02), e: e + 0.03))
        }
        for i in 1..<max(1, out.count) where out[i].s < out[i - 1].e {
            let mid = (out[i].s + out[i - 1].e) / 2
            out[i - 1].e = max(out[i - 1].s + 0.04, mid)
            out[i].s = max(out[i - 1].e, out[i].s)
        }
        return out
    }
}

nonisolated struct EditError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
