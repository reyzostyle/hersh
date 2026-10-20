import AVFoundation
import AudioToolbox

// Noise reduction: every take's sound run once through Apple's voice
// isolation (the AUSoundIsolation unit behind Voice Isolation on calls),
// offline, and cached next to the take. The edit then uses the clean sound in
// place of the original; turning it off just goes back to the original.
nonisolated enum Cleaner {
    static func cleanURL(for take: URL) -> URL { take.deletingPathExtension().appendingPathExtension("clean.m4a") }

    static func clean(_ take: URL) async throws -> URL {
        let out = cleanURL(for: take)
        if FileManager.default.fileExists(atPath: out.path) { return out }

        let raw = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
        defer { try? FileManager.default.removeItem(at: raw) }
        guard let export = AVAssetExportSession(asset: AVURLAsset(url: take), presetName: AVAssetExportPresetAppleM4A) else {
            throw EditError("Could not read the sound of this take.")
        }
        try await export.export(to: raw, as: .m4a)

        let input = try AVAudioFile(forReading: raw)
        let format = input.processingFormat
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let isolation = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
            componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_AUSoundIsolation,
            componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0))
        engine.attach(player)
        engine.attach(isolation)
        engine.connect(player, to: isolation, format: format)
        engine.connect(isolation, to: engine.mainMixerNode, format: format)
        // Fully wet, isolating voice.
        AudioUnitSetParameter(isolation.audioUnit, AudioUnitParameterID(kAUSoundIsolationParam_WetDryMixPercent), kAudioUnitScope_Global, 0, 100, 0)

        let chunk: AVAudioFrameCount = 4096
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: chunk)
        try engine.start()
        player.scheduleFile(input, at: nil, completionHandler: nil)
        player.play()

        let tmp = out.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + ".m4a")
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: format.sampleRate,
                                       AVNumberOfChannelsKey: format.channelCount, AVEncoderBitRateKey: 192_000]
        do {
            let output = try AVAudioFile(forWriting: tmp, settings: settings, commonFormat: format.commonFormat, interleaved: format.isInterleaved)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: chunk) else { throw EditError("Out of memory.") }
            while engine.manualRenderingSampleTime < input.length {
                let left = AVAudioFrameCount(input.length - engine.manualRenderingSampleTime)
                switch try engine.renderOffline(min(chunk, left), to: buffer) {
                case .success: try output.write(from: buffer)
                case .error: throw EditError("Noise reduction failed.")
                default: break
                }
            }
        }
        player.stop()
        engine.stop()
        try? FileManager.default.removeItem(at: out)
        try FileManager.default.moveItem(at: tmp, to: out)
        return out
    }
}
