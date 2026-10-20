import SwiftUI

// The script, scrolling under the lens so your eyes stay near the camera.
// It runs while you record and stops when you do; drag it to find your place,
// tap it to pause. Speed and size stick between shoots.
@Observable
final class PrompterState {
    var offset: CGFloat = 0
    var running = false
    var speed: Double = UserDefaults.standard.object(forKey: "prompter.speed") as? Double ?? 40 {
        didSet { UserDefaults.standard.set(speed, forKey: "prompter.speed") }
    }
    var size: Double = UserDefaults.standard.object(forKey: "prompter.size") as? Double ?? 26 {
        didSet { UserDefaults.standard.set(size, forKey: "prompter.size") }
    }
    var contentHeight: CGFloat = 0
    var viewHeight: CGFloat = 0

    var atEnd: Bool { offset >= max(0, contentHeight - viewHeight * 0.35) }

    func reset() { offset = 0 }

    func step(_ dt: Double) {
        guard running else { return }
        offset = min(offset + CGFloat(speed * dt), max(0, contentHeight - viewHeight * 0.35))
    }
}

struct Teleprompter: View {
    let script: String
    @Bindable var state: PrompterState
    @State private var dragStart: CGFloat?

    var body: some View {
        GeometryReader { geo in
            Text(script)
                .font(.geist(state.size, .medium))
                .foregroundStyle(.white)
                .lineSpacing(state.size * 0.28)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 22)
                .padding(.top, geo.size.height * 0.18)
                .padding(.bottom, geo.size.height)
                .frame(width: geo.size.width, alignment: .topLeading)
                .fixedSize(horizontal: false, vertical: true)
                .background(GeometryReader { g in Color.clear.onAppear { state.contentHeight = g.size.height - geo.size.height } .onChange(of: g.size.height) { _, h in state.contentHeight = h - geo.size.height } })
                .offset(y: -state.offset)
                .onAppear { state.viewHeight = geo.size.height }
        }
        .clipped()
        // Text fades out toward the bottom edge, so the line to read is the
        // bright one at the top.
        .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.55), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in
                    if dragStart == nil { dragStart = state.offset }
                    state.offset = max(0, (dragStart ?? 0) - v.translation.height)
                }
                .onEnded { _ in dragStart = nil }
        )
        .onTapGesture { state.running.toggle() }
        .task {
            // ~60 steps a second; the offset moves by speed × elapsed time.
            var last = Date.now
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(16))
                let now = Date.now
                state.step(now.timeIntervalSince(last))
                last = now
            }
        }
    }
}
