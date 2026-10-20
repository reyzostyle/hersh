import SwiftUI
import AVKit
import Combine
import Supabase

// The edit of one shoot: listen to every take, cut (pauses always, takes when
// you press Cut), preview with captions, export to Photos.
@Observable
final class EditModel {
    enum Phase: Equatable { case listening(Double), ready, failed(String) }

    let shootId: String
    var phase: Phase = .listening(0)
    var heard: [Heard] = []
    var durations: [Double] = []
    var urls: [URL] = []
    var plan = Plan()
    var settings = EditSettings()
    var timeline = Timeline()
    var groups: [CapGroup] = []
    var planning = false
    var planError: String?
    var player = AVPlayer()
    var built: Renderer.Built?
    var exporting: Double?
    var exported: URL?
    var time: Double = 0
    private var rebuildTask: Task<Void, Never>?
    private var observer: Any?

    init(shootId: String) {
        self.shootId = shootId
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { [weak self] t in
            MainActor.assumeIsolated { self?.time = t.seconds }
        }
    }

    func load(_ films: FilmStore) async {
        guard let shoot = films.shoot(shootId), !shoot.takes.isEmpty else { phase = .failed("No takes yet. Film something first."); return }
        urls = shoot.takes.map { films.url($0, in: shoot) }
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
            }
            plan = Plan.keepAll(heard.map(\.words))
            phase = .ready
            rebuild()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func cut(script: String, notes: String) async {
        planning = true
        planError = nil
        defer { planning = false }
        do {
            plan = try await Planner.plan(heard.map(\.words), script: script, notes: notes)
            rebuild()
        } catch {
            planError = (error as? EditError)?.message ?? "Could not pick the takes. Try again."
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

    // Recomputes the cut and swaps the player's item, keeping the playhead.
    func rebuild() {
        timeline = Cutter.build(heard, durations: durations, plan: plan, settings: settings)
        groups = Cutter.groups(timeline.caps, style: settings.captions)
        exported = nil
        rebuildTask?.cancel()
        let tl = timeline, urls = urls, at = player.currentTime(), playing = player.rate > 0
        rebuildTask = Task {
            guard let built = try? await Renderer.build(tl, takes: urls), !Task.isCancelled else { return }
            self.built = built
            let item = AVPlayerItem(asset: built.composition)
            item.videoComposition = built.video
            item.audioTimePitchAlgorithm = .spectral
            player.replaceCurrentItem(with: item)
            await player.seek(to: min(at, built.composition.duration), toleranceBefore: .zero, toleranceAfter: .zero)
            if playing { player.play() }
            // Some players (the Simulator's, at least) refuse a custom video
            // composition outright. The preview then plays the plain cut, framed
            // by the take's own orientation; the export still renders it all.
            for await status in item.publisher(for: \.status).values where status != .unknown {
                if status == .failed, !Task.isCancelled {
                    let plain = AVPlayerItem(asset: built.composition)
                    plain.audioTimePitchAlgorithm = .spectral
                    player.replaceCurrentItem(with: plain)
                    await player.seek(to: min(at, built.composition.duration), toleranceBefore: .zero, toleranceAfter: .zero)
                    if playing { player.play() }
                }
                break
            }
        }
    }

    func export() async {
        guard let built else { return }
        player.pause()
        exporting = 0
        defer { exporting = nil }
        do {
            let url = try await Renderer.export(built, groups: groups, style: settings.captions) { p in
                Task { @MainActor in self.exporting = p }
            }
            exported = url
            _ = await FilmStore.saveToPhotos(url)
        } catch {
            planError = error.localizedDescription
        }
    }
}

struct EditorView: View {
    @Environment(FilmStore.self) private var films
    @Environment(IdeasStore.self) private var ideas
    @State private var model: EditModel
    @State private var tab: Tab = .cut
    @State private var notes = ""
    @State private var showShare = false
    enum Tab: Hashable { case cut, style, words }

    init(shootId: String) { _model = State(initialValue: EditModel(shootId: shootId)) }

    private var shoot: Shoot? { films.shoot(model.shootId) }

    var body: some View {
        VStack(spacing: 0) {
            preview
                .padding(.horizontal, 20)
                .padding(.top, 4)

            switch model.phase {
            case .listening(let p):
                VStack(spacing: 10) {
                    Working(label: "Listening to your takes")
                    ProgressView(value: p).tint(.white).frame(width: 180)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let msg):
                Text(msg).font(.tSmall).foregroundStyle(Color.textMuted).multilineTextAlignment(.center)
                    .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .ready:
                panel
            }
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Edit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .task { if case .listening = model.phase { await model.load(films) } }
        .onDisappear { model.player.pause() }
        .onChange(of: model.settings) { _, _ in model.rebuild() }
        .sheet(isPresented: $showShare) {
            if let url = model.exported { ShareSheet(items: [url]) }
        }
    }

    // MARK: preview

    private var preview: some View {
        ZStack {
            Color.black
            VideoSurface(player: model.player)
            CaptionOverlay(groups: model.groups, style: model.settings.captions, time: model.time)
                .allowsHitTesting(false)
        }
        .aspectRatio(9 / 16, contentMode: .fit)
        .frame(maxHeight: 400)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .overlay(alignment: .bottom) {
            if model.timeline.duration > 0 {
                Text("\(fmt(model.time)) / \(fmt(model.timeline.duration))")
                    .font(.geist(11, .medium)).monospacedDigit()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(.black.opacity(0.5)))
                    .padding(8)
            }
        }
        .onTapGesture {
            if model.player.rate > 0 { model.player.pause() } else {
                if model.time >= model.timeline.duration - 0.1 { model.player.seek(to: .zero) }
                model.player.play()
            }
        }
    }

    // MARK: panel

    private var panel: some View {
        VStack(spacing: 0) {
            Seg(options: [(Tab.cut, "Cut"), (Tab.style, "Style"), (Tab.words, "Words")], value: $tab)
                .padding(.top, 14)
            ScrollView {
                Group {
                    switch tab {
                    case .cut: cutTab
                    case .style: styleTab
                    case .words: wordsTab
                    }
                }
                .padding(20)
            }
            exportBar
        }
    }

    private var cutTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("", text: $notes, prompt: Text("Notes, e.g. cut the pricing bit").foregroundStyle(Color.textFaint))
                .field()
            Button {
                Task { await model.cut(script: shoot?.script ?? "", notes: notes) }
            } label: {
                if model.planning { Text("Picking takes…") } else { Text(model.plan.note.isEmpty ? "Cut" : "Cut again") }
            }
            .buttonStyle(.pillSecondary)
            .disabled(model.planning)
            if !model.plan.note.isEmpty {
                Text(model.plan.note).font(.tSmall).foregroundStyle(Color.textMuted)
                Button("Keep everything") { model.keepEverything() }
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }
            if let e = model.planError { Text(e).font(.tSmall).foregroundStyle(Color.danger) }
            Text("Pauses are already gone. Cut picks the best take of every line\(shoot?.script.isEmpty == false ? " against your script" : "") and drops the stumbles.")
                .font(.tSmall).foregroundStyle(Color.textFaint)
        }
    }

    private var styleTab: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Captions").font(.tLabel).foregroundStyle(Color.textMuted)
            HStack(spacing: 8) {
                ForEach(CaptionStyle.allCases, id: \.self) { s in
                    CaptionChip(style: s, on: model.settings.captions == s) { model.settings.captions = s }
                }
            }
            HStack(alignment: .top, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Pauses").font(.tLabel).foregroundStyle(Color.textMuted)
                    Seg(options: [(Pace.tight, "Tight"), (Pace.natural, "Natural")], value: $model.settings.pace)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("Speed").font(.tLabel).foregroundStyle(Color.textMuted)
                    Seg(options: [(1.0, "1×"), (1.1, "1.1×"), (1.2, "1.2×")], value: $model.settings.speed)
                }
            }
            Toggle(isOn: $model.settings.zoom) { Text("Zoom on cuts").font(.tBody).foregroundStyle(Color.text) }
                .tint(Color.process)
        }
    }

    private var wordsTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Tap a word to cut it, double-tap to highlight it.").font(.tSmall).foregroundStyle(Color.textFaint)
            ForEach(Array(model.heard.enumerated()), id: \.offset) { c, h in
                VStack(alignment: .leading, spacing: 6) {
                    if model.heard.count > 1 { Text("Take \(c + 1)").font(.tLabel).foregroundStyle(Color.textMuted) }
                    WordFlow(words: h.words, take: c, plan: model.plan, speaking: speakingKey) { key, hot in
                        model.toggle(key, hot: hot)
                    }
                }
            }
        }
    }

    private var speakingKey: WKey? {
        model.timeline.caps.first { model.time >= $0.t0 && model.time < $0.t1 }?.key
    }

    private var exportBar: some View {
        VStack(spacing: 8) {
            if let p = model.exporting {
                ProgressView(value: p).tint(Color.process)
                Text("Exporting \(Int(p * 100))%").font(.tSmall).foregroundStyle(Color.textMuted)
            } else if model.exported != nil {
                HStack(spacing: 10) {
                    Text("Saved to Photos").font(.tSmall).foregroundStyle(Color.process)
                    Spacer()
                    Button("Share") { showShare = true }.buttonStyle(.pillSecondary).frame(width: 120)
                }
            } else {
                Button("Export") { Task { await model.export() } }
                    .buttonStyle(.pill)
                    .disabled(model.built == nil)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(Color.bg)
    }

    private func fmt(_ t: Double) -> String { String(format: "%d:%02d", Int(t) / 60, Int(t) % 60) }
}

// AVPlayerLayer, filling its frame.
struct VideoSurface: UIViewRepresentable {
    let player: AVPlayer
    func makeUIView(context: Context) -> PlayerView { let v = PlayerView(); v.layer.player = player; v.layer.videoGravity = .resizeAspect; return v }
    func updateUIView(_ uiView: PlayerView, context: Context) {}
    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        override var layer: AVPlayerLayer { super.layer as! AVPlayerLayer }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// The preview's captions, drawn by SwiftUI from the same groups the export
// burns in, scaled from the 1080 px frame to whatever size the preview is.
struct CaptionOverlay: View {
    let groups: [CapGroup]
    let style: CaptionStyle
    let time: Double

    var body: some View {
        GeometryReader { geo in
            let k = geo.size.width / Renderer.size.width
            if style != .none, let g = groups.first(where: { time >= $0.t0 && time < $0.t1 }) {
                let look = CaptionLayers.look(style)
                let active = g.words.last { time >= $0.t0 }
                FlowText(words: g.words, active: active, look: look, scale: k)
                    .frame(width: geo.size.width)
                    .position(x: geo.size.width / 2, y: geo.size.height * look.y)
            }
        }
    }
}

private struct FlowText: View {
    let words: [CapWord]
    let active: CapWord?
    let look: CaptionLayers.Look
    let scale: CGFloat

    var body: some View {
        let lit = words.map { w -> Text in
            let color = w.hot || (look.trackActive && w == active) ? look.hot : look.fill
            return Text(w.text).foregroundColor(Color(color))
        }
        let joined = lit.dropFirst().reduce(lit.first ?? Text("")) { $0 + Text(" ") + $1 }
        joined
            .font(Font(look.font.withSize(look.font.pointSize * scale)))
            .multilineTextAlignment(.center)
            .shadow(color: .black.opacity(look.stroke > 0 ? 1 : 0.75), radius: look.stroke > 0 ? 1 : 6)
            .shadow(color: .black.opacity(look.stroke > 0 ? 1 : 0), radius: look.stroke > 0 ? 2 : 0)
            .padding(.horizontal, 90 * scale)
    }
}

private struct CaptionChip: View {
    let style: CaptionStyle
    let on: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Group {
                    switch style {
                    case .pop: Text("SO ").foregroundColor(.white) + Text("THIS").foregroundColor(Color(CaptionLayers.yellow))
                    case .bold: Text("SO THIS").foregroundColor(Color(CaptionLayers.yellow))
                    case .word: Text("this").foregroundColor(.white)
                    case .clean: Text("so this").foregroundColor(.white)
                    case .none: Text("Aa").foregroundColor(Color.textFaint)
                    }
                }
                .font(Font(CaptionLayers.look(style).font.withSize(style == .bold ? 17 : 13)))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(height: 22)
                Text(style == .word ? "One word" : style.rawValue.capitalized).font(.geist(11)).foregroundStyle(on ? Color.text : Color.textFaint)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(on ? Color.raisedHover : Color.raised))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(on ? Color.textMuted : Color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: on)
    }
}

// The transcript, word by word, wrapping like text.
private struct WordFlow: View {
    let words: [Word]
    let take: Int
    let plan: Plan
    let speaking: WKey?
    let toggle: (WKey, Bool) -> Void

    var body: some View {
        FlowLayout(spacing: 4, lineSpacing: 6) {
            ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                let key = WKey(c: take, i: i)
                let kept = plan.kept.contains(key)
                let hot = plan.hot.contains(key)
                Text(plan.fixes[key] ?? w.text)
                    .font(.geist(15, hot ? .semibold : .regular))
                    .foregroundStyle(kept ? Color.text : Color.textFaint)
                    .strikethrough(!kept, color: Color.textFaint)
                    .underline(hot, color: Color(CaptionLayers.yellow))
                    .opacity(kept ? 1 : 0.5)
                    .padding(.horizontal, 3).padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(speaking == key ? Color.raisedHover : .clear))
                    .onTapGesture(count: 2) { toggle(key, true) }
                    .onTapGesture { toggle(key, false) }
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineH: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { x = 0; y += lineH + lineSpacing; lineH = 0 }
            x += s.width + spacing
            maxX = max(maxX, x)
            lineH = max(lineH, s.height)
        }
        return CGSize(width: min(width, maxX), height: y + lineH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += lineH + lineSpacing; lineH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            lineH = max(lineH, s.height)
        }
    }
}
