import SwiftUI
import AVFoundation

// Where TikTok, Reels and Shorts put their own buttons and text over a video,
// as shares of the 1080x1920 frame. Anything important outside the safe box
// ends up under a like button or the caption. The box is the tightest of the
// three apps, so one edit works on all of them.
nonisolated enum SafeZone {
    static let top = 0.08 // tabs and the search bar
    static let bottom = 0.23 // username, caption, sound, progress bar
    static let left = 0.056
    static let right = 0.13 // like, comment, share rail

    static var box: CGRect { CGRect(x: left, y: top, width: 1 - left - right, height: 1 - top - bottom) }

    // Whether a rect (shares of the frame) sits inside the safe box, allowing
    // a sliver of slack so a caption's soft shadow does not count.
    static func holds(_ r: CGRect) -> Bool { box.insetBy(dx: -0.01, dy: -0.01).contains(r) }
}

// The edge of the area the feed leaves alone: a thin line, nothing dimmed.
struct SafeZoneGuide: View {
    var warn = false
    var body: some View {
        GeometryReader { geo in
            let b = SafeZone.box
            Rectangle()
                .strokeBorder(warn ? Color.danger : Color.white.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                .frame(width: b.width * geo.size.width, height: b.height * geo.size.height)
                .offset(x: b.minX * geo.size.width, y: b.minY * geo.size.height)
        }
        .allowsHitTesting(false)
    }
}

// A phrase of captions as it looks at `t`, drawn by the export's own routine.
struct CaptionArt: View {
    let group: CapGroup
    let t: Double
    let look: CaptionLayers.Look
    let k: CGFloat

    var body: some View {
        let b = CaptionLayers.bounds(group, look: look)
        let image = UIGraphicsImageRenderer(size: CGSize(width: max(1, b.width * k), height: max(1, b.height * k))).image { r in
            r.cgContext.scaleBy(x: k, y: k)
            CaptionLayers.paint(group, at: t, look: look, center: CGPoint(x: -b.minX, y: -b.minY), in: r.cgContext)
        }
        Image(uiImage: image)
            .frame(width: b.width * k, height: b.height * k)
            .contentShape(Rectangle())
    }
}

// The edit as it will play in a feed: full screen, looping, with the feed's
// buttons drawn over it so you can see what they cover.
struct FullPreview: View {
    @Bindable var model: EditModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage("edit.feedUI") private var feedUI = true
    @State private var drag: CGFloat = 0

    var body: some View {
        GeometryReader { screen in
            let w = min(screen.size.width, screen.size.height * 9 / 16)
            let k = w / Renderer.size.width
            ZStack {
                Color.black.ignoresSafeArea()
                ZStack(alignment: .topLeading) {
                    VideoSurface(player: model.player)
                    StaticOverlays(model: model, k: k)
                    if feedUI { FeedChrome(caption: firstLine).allowsHitTesting(false) }
                }
                .frame(width: w, height: w * 16 / 9)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .contentShape(Rectangle())
                .onTapGesture { model.togglePlay() }
                .overlay {
                    if !model.playing {
                        Image(systemName: "play.fill").font(.system(size: 54)).foregroundStyle(.white.opacity(0.8))
                            .allowsHitTesting(false)
                    }
                }
                .offset(y: drag)
                .scaleEffect(1 - min(drag, 300) / 1500)
            }
            .frame(width: screen.size.width, height: screen.size.height)
        }
        .overlay(alignment: .top) {
            HStack {
                Button { dismiss() } label: { circle("xmark") }
                Spacer()
                Button { feedUI.toggle() } label: { circle(feedUI ? "eye.slash" : "eye") }
                    .sensoryFeedback(.selection, trigger: feedUI)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
        .overlay(alignment: .bottom) {
            // How far through, like the feed's own thin bar.
            GeometryReader { g in
                Capsule().fill(Color.white.opacity(0.25)).frame(height: 3)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Color.white).frame(width: g.size.width * min(1, model.time / max(0.1, model.timeline.duration)), height: 3)
                    }
            }
            .frame(height: 3)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .gesture(DragGesture()
            .onChanged { v in drag = max(0, v.translation.height) }
            .onEnded { v in if v.translation.height > 120 { dismiss() } else { withAnimation(.ui) { drag = 0 } } })
        .statusBarHidden()
        .onAppear {
            EditModel.playbackAudio()
            if model.time >= model.timeline.duration - 0.1 { model.seek(0) }
            model.player.play()
        }
        .onDisappear { model.player.pause() }
        .onReceive(NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification)) { _ in
            model.seek(0)
            model.player.play()
        }
        .sensoryFeedback(.impact(weight: .light), trigger: model.playing)
    }

    private var firstLine: String {
        let words = model.timeline.caps.prefix(14).map(\.text)
        return words.joined(separator: " ")
    }

    private func circle(_ icon: String) -> some View {
        Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
            .frame(width: 40, height: 40).background(Circle().fill(Color.black.opacity(0.45)))
    }
}

// Captions, texts and pictures over the video, not touchable.
struct StaticOverlays: View {
    let model: EditModel
    let k: CGFloat

    var body: some View {
        let size = CGSize(width: Renderer.size.width * k, height: Renderer.size.height * k)
        ZStack(alignment: .topLeading) {
            ForEach(model.media.filter { $0.kind == .image && model.time >= $0.start && model.time < $0.end }) { m in
                MediaHandle(m: m, image: model.image(for: m), k: k, selected: false)
            }
            ForEach(model.texts.filter { model.time >= $0.start && model.time < $0.end }) { t in
                PaintedText(text: t, k: k)
                    .position(x: size.width * t.x, y: size.height * t.y)
            }
            if model.captions.preset != .none, let g = model.groups.first(where: { model.time >= $0.t0 && model.time < $0.t1 }) {
                CaptionArt(group: g, t: model.time, look: model.captions.look, k: k)
                    .position(x: size.width * model.captions.x, y: size.height * model.captions.y)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

// The buttons and text a feed lays over a video, close to where TikTok, Reels
// and Shorts put theirs, so you can see what your captions would sit under.
private struct FeedChrome: View {
    let caption: String

    var body: some View {
        GeometryReader { g in
            let s = g.size.width / 390
            ZStack {
                VStack {
                    HStack(spacing: 18 * s) {
                        Text("Following").opacity(0.6)
                        Text("For You").overlay(alignment: .bottom) { Capsule().fill(.white).frame(width: 24 * s, height: 2.5 * s).offset(y: 7 * s) }
                    }
                    .font(.system(size: 16 * s, weight: .semibold))
                    .padding(.top, 14 * s)
                    Spacer()
                }
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6 * s) {
                        Text("@you").font(.system(size: 15 * s, weight: .bold))
                        Text(caption).font(.system(size: 14 * s)).lineLimit(2)
                        Label("original sound", systemImage: "music.note").font(.system(size: 13 * s)).opacity(0.9)
                    }
                    .frame(maxWidth: g.size.width * 0.7, alignment: .leading)
                    Spacer()
                    VStack(spacing: 18 * s) {
                        Circle().fill(Color.white.opacity(0.9)).frame(width: 44 * s, height: 44 * s)
                        rail("heart.fill", "12.4K", s)
                        rail("ellipsis.bubble.fill", "318", s)
                        rail("bookmark.fill", "1,024", s)
                        rail("arrowshape.turn.up.right.fill", "Share", s)
                    }
                }
                .padding(.horizontal, 12 * s)
                .padding(.bottom, 22 * s)
                .frame(maxHeight: .infinity, alignment: .bottom)
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.45), radius: 3, y: 1)
        }
    }

    private func rail(_ icon: String, _ n: String, _ s: CGFloat) -> some View {
        VStack(spacing: 3 * s) {
            Image(systemName: icon).font(.system(size: 28 * s))
            Text(n).font(.system(size: 12 * s, weight: .semibold))
        }
    }
}
