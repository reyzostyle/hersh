import SwiftUI
import AVFoundation
import Supabase

// The last look before posting: the finished video goes to a model that
// watches it with sound (edit-review) and says whether it is ready, what to
// fix first, and where. Fixes the editor can make itself come with a button.

nonisolated struct Review: Decodable, Equatable, Sendable {
    struct Note: Decodable, Equatable, Sendable, Identifiable {
        let area: String
        let good: Bool
        let at: Double?
        let text: String
        let fix: String?
        var id: String { "\(area)\(at ?? -1)\(text.prefix(24))" }
    }
    let verdict: String
    let score: Int
    let headline: String
    let notes: [Note]
}

enum Reviewer {
    nonisolated struct UploadURL: Decodable { let uploadUrl: String }
    nonisolated struct GeminiFile: Decodable { struct F: Decodable { let name: String }; let file: F }
    nonisolated struct Body: Encodable { let geminiFileName: String; let transcript: String; let script: String; let duration: Double; let facts: [String] }

    // Straight to Gemini through a one-time upload address from
    // get-upload-url, so the video never passes through our functions.
    static func upload(_ url: URL) async throws -> String {
        let data = try Data(contentsOf: url)
        nonisolated struct Ask: Encodable { let fileName: String; let fileSize: Int; let mimeType: String }
        let u: UploadURL = try await supabase.functions.invoke("get-upload-url",
            options: FunctionInvokeOptions(body: Ask(fileName: "review.mp4", fileSize: data.count, mimeType: "video/mp4")))
        guard let target = URL(string: u.uploadUrl) else { throw EditError("Could not start the upload.") }
        var req = URLRequest(url: target, timeoutInterval: 120)
        req.httpMethod = "POST"
        req.setValue("0", forHTTPHeaderField: "X-Goog-Upload-Offset")
        req.setValue("upload, finalize", forHTTPHeaderField: "X-Goog-Upload-Command")
        let (resp, http) = try await URLSession.shared.upload(for: req, from: data)
        guard (http as? HTTPURLResponse)?.statusCode == 200 else { throw EditError("The upload did not go through. Try again.") }
        return try JSONDecoder().decode(GeminiFile.self, from: resp).file.name
    }

    static func review(_ body: Body) async throws -> Review {
        try await supabase.functions.invoke("edit-review", options: FunctionInvokeOptions(body: body, timeoutInterval: 170))
    }
}

// A small copy of the finished video for the model to watch: 540x960 H.264
// at a bitrate that keeps a minute near 8 MB. It sees one frame a second and
// hears everything, so this loses nothing it would judge.
nonisolated enum Shrink {
    static func small(_ url: URL) async throws -> URL {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        guard let vTrack = try await asset.loadTracks(withMediaType: .video).first else { throw EditError("The video has no picture.") }
        let aTrack = try await asset.loadTracks(withMediaType: .audio).first
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("review-\(UUID().uuidString.prefix(8)).mp4")

        let reader = try AVAssetReader(asset: asset)
        let vOut = AVAssetReaderTrackOutput(track: vTrack, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        ])
        reader.add(vOut)
        var aOut: AVAssetReaderTrackOutput?
        if let aTrack {
            let o = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
            ])
            reader.add(o)
            aOut = o
        }

        let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
        let bits = Int(min(1_200_000, max(300_000, 60_000_000 / max(1, duration))))
        let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 540, AVVideoHeightKey: 960,
            AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bits],
        ])
        vIn.expectsMediaDataInRealTime = false
        writer.add(vIn)
        var aIn: AVAssetWriterInput?
        if aOut != nil {
            let i = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000,
            ])
            i.expectsMediaDataInRealTime = false
            writer.add(i)
            aIn = i
        }

        guard reader.startReading() else { throw reader.error ?? EditError("Could not read the video.") }
        guard writer.startWriting() else { throw writer.error ?? EditError("Could not write the small copy.") }
        writer.startSession(atSourceTime: .zero)
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let group = DispatchGroup()
            pump(vOut, into: vIn, group: group, label: "v")
            if let aOut, let aIn { pump(aOut, into: aIn, group: group, label: "a") }
            group.notify(queue: .global()) { done.resume() }
        }
        guard reader.status == .completed else {
            writer.cancelWriting()
            throw reader.error ?? EditError("Could not read the video.")
        }
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? EditError("Could not write the small copy.") }
        return out
    }

    private static func pump(_ output: AVAssetReaderTrackOutput, into input: AVAssetWriterInput, group: DispatchGroup, label: String) {
        group.enter()
        nonisolated(unsafe) let o = output
        nonisolated(unsafe) let i = input
        i.requestMediaDataWhenReady(on: DispatchQueue(label: "chumoku.shrink.\(label)")) {
            while i.isReadyForMoreMediaData {
                guard let buf = o.copyNextSampleBuffer(), i.append(buf) else {
                    i.markAsFinished()
                    group.leave()
                    return
                }
            }
        }
    }
}

// MARK: - the sheet

struct ReviewSheet: View {
    @Bindable var model: EditModel
    let script: String
    let export: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var applied: Set<String> = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    switch model.reviewPhase {
                    case .idle, .rendering, .uploading, .watching:
                        working.padding(.top, 60)
                    case .failed(let msg):
                        Text(msg).font(.tBody).foregroundStyle(Color.textMuted).padding(.top, 40)
                        Button("Try again") { Task { await model.runReview(script: script) } }
                            .buttonStyle(.pill).padding(.top, 20)
                    case .done(let r):
                        result(r)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .background(Color.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Close") { dismiss() } }
            }
        }
        .sensoryFeedback(.success, trigger: model.reviewPhase.isDone) { _, now in now }
        .sensoryFeedback(.impact(weight: .medium), trigger: applied)
    }

    private var working: some View {
        VStack(spacing: 14) {
            ProgressView().tint(.white).controlSize(.large)
            Group {
                switch model.reviewPhase {
                case .rendering: Text("Rendering the video · \(Int((model.exporting ?? 0) * 100))%")
                case .uploading: Text("Sending it over")
                case .watching(let started):
                    TimelineView(.periodic(from: started, by: 1)) { ctx in
                        Text("Watching it with sound · \(Int(ctx.date.timeIntervalSince(started)))s")
                    }
                default: Text("Getting ready")
                }
            }
            .font(.tBody).foregroundStyle(Color.textMuted).monospacedDigit()
        }
        .frame(maxWidth: .infinity)
    }

    private func result(_ r: Review) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(verdictTitle(r.verdict)).font(.geist(30, .semibold)).foregroundStyle(Color.text)
                Spacer()
                Text("\(r.score)/10").font(.geist(17, .medium)).monospacedDigit().foregroundStyle(Color.textMuted)
            }
            .padding(.top, 8)
            if !r.headline.isEmpty {
                Text(r.headline).font(.tBody).foregroundStyle(Color.textMuted).padding(.top, 8)
            }
            VStack(spacing: 10) {
                ForEach(r.notes) { n in note(n) }
            }
            .padding(.top, 24)
            HStack(spacing: 10) {
                Button("Check again") { applied = []; Task { await model.runReview(script: script) } }
                    .buttonStyle(.pillSecondary)
                Button("Export") { dismiss(); export() }
                    .buttonStyle(.pill)
            }
            .padding(.top, 24)
        }
    }

    private func note(_ n: Review.Note) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: n.good ? "checkmark.circle.fill" : icon(n.area))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(n.good ? Color.process : Color.text)
                Text(n.area.capitalized).font(.tLabel).foregroundStyle(Color.textMuted)
                Spacer()
                if let at = n.at {
                    Button { model.seek(min(at, max(0, model.timeline.duration - 0.05))); dismiss() } label: {
                        Text(String(format: "%d:%02d", Int(at) / 60, Int(at) % 60))
                            .font(.geist(12, .medium)).monospacedDigit().foregroundStyle(Color.text)
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(Capsule().fill(Color.white.opacity(0.1)))
                    }
                    .buttonStyle(.plain)
                }
            }
            Text(n.text).font(.tBody).foregroundStyle(Color.text).fixedSize(horizontal: false, vertical: true)
            // Cutting a slow start needs to know where the real start is.
            if let fix = n.fix, !n.good, fix != "trim_start" || (n.at ?? 0) > 0.2 {
                let done = applied.contains(n.id)
                Button {
                    applied.insert(n.id)
                    Task { await model.apply(fix: fix, at: n.at) }
                } label: {
                    Label(done ? "Done" : fixLabel(fix), systemImage: done ? "checkmark" : "wand.and.stars")
                }
                .buttonStyle(.pillSecondary)
                .disabled(done)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }

    private func verdictTitle(_ v: String) -> String {
        switch v {
        case "post": "Ready to post"
        case "reshoot": "Reshoot it"
        default: "Fix this first"
        }
    }

    private func icon(_ area: String) -> String {
        switch area {
        case "hook": "bolt.fill"
        case "pacing": "timer"
        case "sound": "waveform"
        case "captions": "captions.bubble.fill"
        case "picture": "camera.fill"
        case "ending": "flag.checkered"
        default: "exclamationmark.circle"
        }
    }

    private func fixLabel(_ fix: String) -> String {
        switch fix {
        case "clean_audio": "Remove background noise"
        case "tighter": "Cut pauses shorter"
        case "faster": "Speed up to 1.2×"
        case "captions_up": "Move captions up"
        case "captions_bigger": "Make captions bigger"
        case "trim_start": "Cut the slow start"
        default: "Fix it"
        }
    }
}
