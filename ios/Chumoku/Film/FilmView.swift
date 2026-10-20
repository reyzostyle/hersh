import SwiftUI
import AVFoundation

// Filming: the frame exactly as it records (9:16), the script scrolling under
// the lens, one big button. Each press is a take; the edit picks between them
// later, so a fluffed line is just "press again".
struct FilmView: View {
    @Environment(FilmStore.self) private var films
    @Environment(\.dismiss) private var dismiss
    let shootId: String

    @State private var camera = Camera()
    @State private var prompter = PrompterState()
    @State private var countdown: Int?
    @State private var light = false
    @State private var showTakes = false
    @State private var savedBrightness: CGFloat = UIScreen.main.brightness
    @State private var lastThumb: UIImage?
    @AppStorage("film.countdown") private var useCountdown = true

    private var shoot: Shoot? { films.shoot(shootId) }

    var body: some View {
        GeometryReader { geo in
            let top = geo.safeAreaInsets.top
            // Full width at 9:16 is taller than what is left under the
            // island, so the picture runs up behind it (as in the Camera app)
            // and the prompter starts below it.
            let inset: CGFloat = light ? 14 : 0
            let w = geo.size.width - inset * 2
            ZStack(alignment: .top) {
                (light ? Color.white : Color.black).ignoresSafeArea()

                frame(topInset: top)
                    .frame(width: w, height: w * 16 / 9)
                    .padding(.top, inset)
                    .ignoresSafeArea(edges: .top)

                VStack(spacing: 0) {
                    Spacer()
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
        .sheet(isPresented: $showTakes) {
            NavigationStack { TakesList(shootId: shootId) }
                .presentationDetents([.medium, .large])
        }
        .task(id: shoot?.takes.last?.id) {
            if let s = shoot, let t = s.takes.last { lastThumb = await FilmStore.thumbnail(for: films.url(t, in: s)) }
        }
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
                    .transition(.scale.combined(with: .opacity))
                    .id(c)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: light ? 28 : 0))
        .background(Color.black)
        // Darkens the bottom edge under the tool row.
        .overlay(alignment: .bottom) {
            LinearGradient(colors: [.clear, .black.opacity(0.45)], startPoint: .top, endPoint: .bottom)
                .frame(height: 90)
                .clipShape(RoundedRectangle(cornerRadius: light ? 28 : 0))
                .allowsHitTesting(false)
        }
    }

    // Prompter speed and size, light, camera.
    private var toolRow: some View {
        HStack(spacing: 8) {
            small("tortoise") { prompter.speed = max(10, prompter.speed - 8) }
            small("hare") { prompter.speed = min(160, prompter.speed + 8) }
            small("textformat.size.smaller") { prompter.size = max(18, prompter.size - 2) }
            small("textformat.size.larger") { prompter.size = min(44, prompter.size + 2) }
            small("arrow.up.to.line") { prompter.reset() }
            small(light ? "lightbulb.fill" : "lightbulb", on: light) { light.toggle() }
            small("arrow.triangle.2.circlepath.camera") { camera.flip() }
                .disabled(camera.isRecording)
        }
    }

    private var controls: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).frame(width: 52, height: 52)
                }
                .foregroundStyle(light ? Color.black : .white)
                .disabled(camera.isRecording)
                .frame(maxWidth: .infinity, alignment: .leading)

                RecordButton(recording: camera.isRecording || countdown != nil, dark: light) { toggleRecord() }

                Button { showTakes = true } label: {
                    ZStack {
                        if let img = lastThumb {
                            Image(uiImage: img).resizable().scaledToFill()
                        } else {
                            Color.white.opacity(0.08)
                        }
                    }
                    .frame(width: 46, height: 46)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(alignment: .topTrailing) {
                        let n = shoot?.takes.count ?? 0
                        if n > 0 {
                            Text("\(n)").font(.geist(11, .semibold)).foregroundStyle(.black)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Capsule().fill(.white)).offset(x: 8, y: -8)
                        }
                    }
                }
                .disabled((shoot?.takes.isEmpty ?? true) || camera.isRecording)
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 24)
        }
        .padding(.bottom, 6)
    }

    private func small(_ icon: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .frame(width: 40, height: 36)
                .foregroundStyle(on ? Color.black : .white)
                .background(RoundedRectangle(cornerRadius: 10).fill(on ? Color.white : Color.black.opacity(0.35)))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
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
        if camera.isRecording {
            prompter.running = false
            camera.stopRecording()
            return
        }
        Task {
            if useCountdown {
                for n in [3, 2, 1] {
                    withAnimation(.spring(response: 0.3)) { countdown = n }
                    try? await Task.sleep(for: .milliseconds(800))
                    if countdown == nil { return } // cancelled
                }
                withAnimation { countdown = nil }
            }
            let url = films.nextTakeURL(for: shootId)
            camera.record(to: url) { saved in
                guard let saved else { return }
                Task { await films.addTake(saved, to: shootId) }
            }
            prompter.running = true
        }
    }
}

struct RecordButton: View {
    let recording: Bool
    var dark = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().strokeBorder(dark ? Color.black.opacity(0.85) : .white, lineWidth: 4).frame(width: 76, height: 76)
                RoundedRectangle(cornerRadius: recording ? 8 : 31)
                    .fill(Color.red)
                    .frame(width: recording ? 30 : 62, height: recording ? 30 : 62)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: recording)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .medium), trigger: recording)
    }
}
