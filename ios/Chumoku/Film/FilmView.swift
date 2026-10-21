import SwiftUI
import AVFoundation

// Filming like TikTok's camera: the frame exactly as it records (9:16), the
// script scrolling under the lens, one big button. Tap it (or hold it) for a
// segment; the ring around it fills with every segment you keep. Backspace
// drops the last one, the tick opens the edit right here. A fluffed line is
// just another segment: the cut picks between them later.
struct FilmView: View {
    @Environment(FilmStore.self) private var films
    @Environment(\.dismiss) private var dismiss
    let shootId: String

    @State private var camera = Camera()
    @State private var prompter = PrompterState()
    @State private var countdown: Int?
    @State private var light = false
    @State private var savedBrightness: CGFloat = UIScreen.main.brightness
    @AppStorage("film.countdown") private var useCountdown = true
    @State private var tick = 0 // a light tap of haptics for every small control
    @State private var readout: String? // "Speed 1.2×", shown for a moment after a change
    @State private var readoutTask: Task<Void, Never>?
    @State private var editing = false
    @State private var armedDelete = false // first tap on backspace marks the last segment
    @State private var saving = 0 // segments stopped but not listed yet
    @State private var wantsEdit = false // the tick was pressed while a segment was still saving
    @State private var holding = false // recording only while the button is held

    // The ring light: the screen goes white around a rounded picture, and
    // the white bleeds softly into the picture's edges, like the front flash
    // in TikTok or Snapchat. The light is the screen itself at full brightness.
    private var ring: CGFloat { light ? 22 : 0 }
    private var radius: CGFloat { light ? 40 : 0 }

    private var shoot: Shoot? { films.shoot(shootId) }

    var body: some View {
        if editing {
            NavigationStack {
                EditorView(shootId: shootId, onCamera: { editing = false }, onClose: { dismiss() })
            }
        } else {
            camera_
        }
    }

    private var camera_: some View {
        GeometryReader { geo in
            let top = geo.safeAreaInsets.top
            // Full width at 9:16 is taller than what is left under the
            // island, so the picture runs up behind it (as in the Camera app)
            // and the prompter starts below it.
            let inset = ring
            let w = geo.size.width - inset * 2
            ZStack(alignment: .top) {
                (light ? Color.white : Color.black).ignoresSafeArea()

                frame(topInset: top)
                    .frame(width: w, height: w * 16 / 9)
                    .padding(.top, inset)
                    .ignoresSafeArea(edges: .top)

                VStack(spacing: 0) {
                    Spacer()
                    if let readout {
                        Text(readout)
                            .font(.geist(14, .semibold)).monospacedDigit()
                            .foregroundStyle(.black)
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(Capsule().fill(.white))
                            .padding(.bottom, 10)
                            .transition(.opacity)
                    }
                    toolRow.padding(.bottom, 14)
                    controls
                }
            }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .task { await camera.start() }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            camera.stop()
            UIApplication.shared.isIdleTimerDisabled = false
            if light { UIScreen.main.brightness = savedBrightness }
        }
        .onChange(of: light) { _, on in
            if on { savedBrightness = UIScreen.main.brightness; UIScreen.main.brightness = 1 } else { UIScreen.main.brightness = savedBrightness }
        }
        .animation(.easeInOut(duration: 0.3), value: light)
        .sensoryFeedback(.selection, trigger: tick)
        .sensoryFeedback(.impact(weight: .light), trigger: countdown)
    }

    // The picture, the prompter over its top half, and the recording clock.
    private func frame(topInset: CGFloat) -> some View {
        ZStack(alignment: .top) {
            Group {
                switch camera.status {
                case .ready, .idle: CameraPreview(session: camera.session)
                case .unauthorized: notice("Chumoku needs the camera and microphone. Allow them in Settings.", action: ("Open Settings", { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }))
                case .unavailable: notice("No camera here. Run Chumoku on your iPhone to film.", action: nil)
                }
            }

            if let script = shoot?.script, !script.isEmpty {
                Teleprompter(script: script, state: prompter)
                    .frame(maxWidth: .infinity)
                    .frame(height: 280)
                    .padding(.top, topInset)
                    .background(LinearGradient(colors: [.black.opacity(0.72), .black.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom))
            }

            // Close, top left as in TikTok; out of the way while recording.
            if !camera.isRecording && countdown == nil {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.black.opacity(0.35)))
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .padding(.top, topInset)
            }

            if let start = camera.recordingStarted {
                TimelineView(.periodic(from: start, by: 1)) { ctx in
                    let s = Int(ctx.date.timeIntervalSince(start))
                    HStack(spacing: 6) {
                        Circle().fill(Color.red).frame(width: 8, height: 8)
                        Text(String(format: "%d:%02d", s / 60, s % 60)).font(.geist(13, .medium)).monospacedDigit()
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(.black.opacity(0.5)))
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(12)
                .padding(.top, topInset)
            }

            if let c = countdown {
                Text("\(c)")
                    .font(.geist(120, .medium))
                    .foregroundStyle(.white)
                    .shadow(radius: 20)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(.opacity)
                    .id(c)
            }
        }
        // Darkens the bottom edge under the tool row.
        .overlay(alignment: .bottom) {
            LinearGradient(colors: [.clear, .black.opacity(0.45)], startPoint: .top, endPoint: .bottom)
                .frame(height: 90)
                .allowsHitTesting(false)
        }
        .overlay {
            if light {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Color.white, lineWidth: 34)
                    .blur(radius: 20)
                    .allowsHitTesting(false)
            }
        }
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    // Prompter speed and size, light, camera.
    private var toolRow: some View {
        HStack(spacing: 8) {
            small("tortoise") { prompter.speed = max(10, prompter.speed - 8); show(speedLabel) }
            small("hare") { prompter.speed = min(160, prompter.speed + 8); show(speedLabel) }
            small("textformat.size.smaller") { prompter.size = max(18, prompter.size - 2); show("Text \(Int(prompter.size))") }
            small("textformat.size.larger") { prompter.size = min(44, prompter.size + 2); show("Text \(Int(prompter.size))") }
            small("arrow.up.to.line") { prompter.reset() }
            small(light ? "lightbulb.fill" : "lightbulb", on: light) { light.toggle() }
            small("arrow.triangle.2.circlepath.camera") { camera.flip() }
                .disabled(camera.isRecording)
        }
    }

    // 40 points a second is the default and reads as 1×.
    private var speedLabel: String { String(format: "Speed %.1f×", prompter.speed / 40) }

    private func show(_ text: String) {
        withAnimation(.ui) { readout = text }
        readoutTask?.cancel()
        readoutTask = Task {
            try? await Task.sleep(for: .seconds(1.4))
            if !Task.isCancelled { withAnimation(.ui) { readout = nil } }
        }
    }

    private var segments: [Double] { shoot?.takes.map(\.duration) ?? [] }
    private var fg: Color { light ? .black : .white }

    private var controls: some View {
        HStack {
            // Left: backspace, once there is a segment to take back.
            Group {
                if !segments.isEmpty && !camera.isRecording {
                    round("delete.left", tint: armedDelete ? .white : fg, fill: armedDelete ? Color.red : nil) { deleteLast() }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            ZStack {
                SegmentRing(segments: segments, live: camera.recordingStarted, armed: armedDelete, dark: light)
                    .frame(width: 96, height: 96)
                    .allowsHitTesting(false)
                RecordButton(recording: camera.isRecording || countdown != nil, holding: holding, dark: light,
                             tap: { armedDelete = false; toggleRecord() },
                             holdStart: { armedDelete = false; startHold() },
                             holdEnd: { endHold() })
            }

            // Right: the takes so far before the first segment of this
            // session, the tick that opens the edit after.
            Group {
                if !segments.isEmpty && !camera.isRecording {
                    Button { finish() } label: {
                        Image(systemName: "checkmark").font(.system(size: 19, weight: .bold))
                            .foregroundStyle(light ? Color.white : Color.black)
                            .frame(width: 52, height: 52)
                            .background(Circle().fill(light ? Color.black : Color.white))
                    }
                    .buttonStyle(.plain)
                    .sensoryFeedback(.success, trigger: editing) { _, now in now }
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 6)
        .animation(.ui, value: segments.count)
        .animation(.ui, value: camera.isRecording)
    }

    private func round(_ icon: String, tint: Color? = nil, fill: Color? = nil, action: @escaping () -> Void) -> some View {
        Button { tick += 1; action() } label: {
            Image(systemName: icon).font(.system(size: 17, weight: .semibold)).frame(width: 52, height: 52)
                .foregroundStyle(tint ?? fg)
                .background(Circle().fill(fill ?? (light ? Color.black.opacity(0.08) : Color.white.opacity(0.12))))
        }
        .buttonStyle(.plain)
    }

    // TikTok's two taps: the first marks the last segment red, the second
    // throws it away.
    private func deleteLast() {
        guard let s = shoot, let last = s.takes.last else { return }
        if !armedDelete { armedDelete = true; show("Tap again to delete"); return }
        armedDelete = false
        films.deleteTake(last, from: s.id)
        show("Segment deleted")
    }

    // Opens the edit once every segment is saved.
    private func finish() {
        armedDelete = false
        if saving > 0 { wantsEdit = true; show("Saving…"); return }
        prompter.running = false
        editing = true
    }

    // Hold to record: starts at once (no countdown), stops on release.
    private func startHold() {
        guard !camera.isRecording, countdown == nil else { return }
        holding = true
        startSegment()
    }

    private func endHold() {
        guard holding else { return }
        holding = false
        stopSegment()
    }

    private func small(_ icon: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button {
            tick += 1
            action()
        } label: {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .frame(width: 40, height: 40)
                .foregroundStyle(on ? Color.black : .white)
                .background(Circle().fill(on ? Color.white : Color.black.opacity(0.3)))
                .background(.ultraThinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
    }

    private func notice(_ text: String, action: (String, () -> Void)?) -> some View {
        VStack(spacing: 16) {
            Text(text).font(.tBody).foregroundStyle(Color.textMuted).multilineTextAlignment(.center)
            if let action { Button(action.0, action: action.1).buttonStyle(.pillSecondary).frame(width: 200) }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.raised)
    }

    private func toggleRecord() {
        if countdown != nil { countdown = nil; return }
        if camera.isRecording { stopSegment(); return }
        Task {
            // The countdown is for getting into place: only before the first
            // segment, not between lines.
            if useCountdown && segments.isEmpty {
                for n in [3, 2, 1] {
                    withAnimation(.easeOut(duration: 0.2)) { countdown = n }
                    try? await Task.sleep(for: .milliseconds(800))
                    if countdown == nil { return } // cancelled
                }
                withAnimation { countdown = nil }
            }
            startSegment()
        }
    }

    private func startSegment() {
        let url = films.nextTakeURL(for: shootId)
        saving += 1
        camera.record(to: url) { saved in
            Task {
                if let saved { _ = await films.addTake(saved, to: shootId) } else { show("Segment not saved") }
                saving -= 1
                if saving == 0, wantsEdit { wantsEdit = false; finish() }
            }
        }
        prompter.running = true
    }

    private func stopSegment() {
        // The prompter keeps its place, so the next segment carries on.
        prompter.running = false
        camera.stopRecording()
    }
}

// Tap to start and stop; hold to record only while pressed.
struct RecordButton: View {
    let recording: Bool
    var holding = false
    var dark = false
    let tap: () -> Void
    var holdStart: () -> Void = {}
    var holdEnd: () -> Void = {}
    @State private var pressed: Date?
    @State private var held = false

    var body: some View {
        ZStack {
            Circle().fill(Color.red)
                .frame(width: holding ? 84 : recording ? 34 : 70, height: holding ? 84 : recording ? 34 : 70)
                .clipShape(RoundedRectangle(cornerRadius: holding ? 42 : recording ? 9 : 35, style: .continuous))
        }
        .frame(width: 80, height: 80)
        .contentShape(Circle())
        .animation(.snappy(duration: 0.22), value: recording)
        .animation(.snappy(duration: 0.22), value: holding)
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in
                guard pressed == nil else { return }
                let now = Date()
                pressed = now
                Task {
                    try? await Task.sleep(for: .milliseconds(320))
                    if pressed == now, !recording { held = true; holdStart() }
                }
            }
            .onEnded { _ in
                pressed = nil
                if held { held = false; holdEnd() } else { tap() }
            })
        .sensoryFeedback(.impact(weight: .medium), trigger: recording)
    }
}

// The ring around the record button: one arc per segment, with a gap between
// them, filling toward three minutes. The segment being recorded grows live.
struct SegmentRing: View {
    let segments: [Double]
    let live: Date?
    var armed = false
    var dark = false
    private let limit = 180.0

    var body: some View {
        TimelineView(.animation(paused: live == nil)) { ctx in
            let liveLen = live.map { ctx.date.timeIntervalSince($0) } ?? 0
            Canvas { g, size in
                let r = min(size.width, size.height) / 2 - 4
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                func arc(_ a: Double, _ b: Double, _ color: Color) {
                    var p = Path()
                    p.addArc(center: c, radius: r, startAngle: .degrees(-90 + a * 360), endAngle: .degrees(-90 + b * 360), clockwise: false)
                    g.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: 6, lineCap: .butt))
                }
                arc(0, 1, (dark ? Color.black : Color.white).opacity(0.28))
                let gap = segments.count + (live == nil ? 0 : 1) > 1 ? 0.006 : 0
                var t = 0.0
                for (i, d) in segments.enumerated() {
                    let a = t / limit, b = min(1, (t + d) / limit)
                    let last = i == segments.count - 1
                    if b - a > gap { arc(a, b - gap, armed && last ? .red : (dark ? .black : .white)) }
                    t += d
                }
                if live != nil {
                    arc(min(1, t / limit), min(1, (t + liveLen) / limit), .red)
                }
            }
        }
    }
}
