import AVFoundation
import SwiftUI

// The camera: front by default (creators film themselves), portrait 1080x1920,
// HEVC when the device has it, sound from the built-in mic. Each recording is
// one take, written straight to the session's folder.
@Observable
final class Camera: NSObject {
    enum Status { case idle, unauthorized, unavailable, ready }

    var status: Status = .idle
    var isRecording = false
    var recordingStarted: Date?
    var position: AVCaptureDevice.Position = .front
    var lastError: String?

    // Touched only on `queue` (and handed to the preview layer, which is
    // thread-safe), hence unchecked.
    nonisolated(unsafe) let session = AVCaptureSession()
    nonisolated(unsafe) private let output = AVCaptureMovieFileOutput()
    nonisolated private let queue = DispatchQueue(label: "chumoku.camera")
    private var finished: ((URL?) -> Void)?

    func start() async {
        guard await Self.authorize(.video), await Self.authorize(.audio) else {
            status = .unauthorized
            return
        }
        let position = self.position
        let ok = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            queue.async { [self] in cont.resume(returning: configure(position: position)) }
        }
        status = ok ? .ready : .unavailable
        if ok { queue.async { [session] in if !session.isRunning { session.startRunning() } } }
    }

    func stop() {
        queue.async { [session] in if session.isRunning { session.stopRunning() } }
    }

    func flip() {
        guard !isRecording else { return }
        position = position == .front ? .back : .front
        let p = position
        queue.async { [self] in _ = configure(position: p) }
    }

    func record(to url: URL, finished: @escaping (URL?) -> Void) {
        guard status == .ready, !isRecording else { return }
        self.finished = finished
        isRecording = true
        recordingStarted = .now
        queue.async { [self] in
            if let conn = output.connection(with: .video) {
                if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 }
                // The preview is mirrored (it is a mirror while you film); the
                // take is not, so text behind you reads the right way round.
                if conn.isVideoMirroringSupported { conn.automaticallyAdjustsVideoMirroring = false; conn.isVideoMirrored = false }
            }
            output.startRecording(to: url, recordingDelegate: self)
        }
    }

    func stopRecording() {
        guard isRecording else { return }
        queue.async { [output] in output.stopRecording() }
    }

    // Runs on the camera queue.
    nonisolated private func configure(position: AVCaptureDevice.Position) -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.hd1920x1080) { session.sessionPreset = .hd1920x1080 }

        for input in session.inputs { session.removeInput(input) }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let video = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(video) else { return false }
        session.addInput(video)
        if let mic = AVCaptureDevice.default(for: .audio), let audio = try? AVCaptureDeviceInput(device: mic), session.canAddInput(audio) {
            session.addInput(audio)
        }
        if !session.outputs.contains(output), session.canAddOutput(output) { session.addOutput(output) }

        if let conn = output.connection(with: .video) {
            if output.availableVideoCodecTypes.contains(.hevc) {
                output.setOutputSettings([AVVideoCodecKey: AVVideoCodecType.hevc], for: conn)
            }
            if conn.isVideoStabilizationSupported { conn.preferredVideoStabilizationMode = .standard }
            if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 }
        }
        // Continuous focus and exposure on the face area.
        if (try? device.lockForConfiguration()) != nil {
            if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
            if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
            device.unlockForConfiguration()
        }
        return true
    }

    private static func authorize(_ type: AVMediaType) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: type) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: type)
        default: return false
        }
    }
}

extension Camera: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        // A take cut short by an error is still usable if the file was written.
        let ok = error == nil || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)
        Task { @MainActor in
            self.isRecording = false
            self.recordingStarted = nil
            if !ok { self.lastError = error?.localizedDescription }
            self.finished?(ok ? url : nil)
            self.finished = nil
        }
    }
}

// The live picture, mirrored for the front camera the way the Camera app is.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.layer.videoGravity = .resizeAspectFill
        v.layer.session = session
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        override var layer: AVCaptureVideoPreviewLayer { super.layer as! AVCaptureVideoPreviewLayer }
    }
}
