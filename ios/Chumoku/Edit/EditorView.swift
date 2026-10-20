import SwiftUI
import AVKit
import PhotosUI
import UniformTypeIdentifiers

// The edit of one shoot. The picture on top is live: drag captions, text and
// pictures where you want them and pinch to size them, like TikTok's editor.
// Tools sit in a bar along the bottom.
struct EditorView: View {
    @Environment(FilmStore.self) private var films
    @State private var model: EditModel
    @State private var tool: Tool = .cut
    @State private var selected: String? // "captions", or a text or overlay id
    @State private var notes = ""
    @State private var showShare = false
    @State private var tick = 0
    @State private var full = false
    @State private var checking = false

    enum Tool: String, CaseIterable, Identifiable {
        case cut, clips, captions, text, overlay, audio, words
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
        var icon: String {
            switch self {
            case .cut: "scissors"
            case .clips: "film.stack"
            case .captions: "captions.bubble"
            case .text: "textformat"
            case .overlay: "photo.on.rectangle"
            case .audio: "waveform"
            case .words: "text.word.spacing"
            }
        }
    }

    init(shootId: String) { _model = State(initialValue: EditModel(shootId: shootId)) }
    private var shoot: Shoot? { films.shoot(model.shootId) }

    var body: some View {
        VStack(spacing: 0) {
            switch model.phase {
            case .listening(let p):
                VStack(spacing: 12) {
                    Working(label: "Listening to your takes")
                    ProgressView(value: p).tint(.white).frame(width: 180)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let msg):
                Text(msg).font(.tSmall).foregroundStyle(Color.textMuted).multilineTextAlignment(.center)
                    .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
            case .ready:
                Stage(model: model, selected: $selected, tool: $tool, full: $full)
                    .padding(.horizontal, 20)
                    .padding(.top, 4)
                transport
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                ScrollView { panel.padding(20) }
                    .scrollDismissesKeyboard(.interactively)
                toolbar
            }
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Edit")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    tick += 1
                    checking = true
                    if !model.reviewPhase.busy, !(model.reviewPhase.isDone && model.rendered != nil) {
                        Task { await model.runReview(script: shoot?.script ?? "") }
                    }
                } label: { Text("Check") }
                    .disabled(model.built == nil || model.exporting != nil)
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let p = model.exporting, !checking {
                    Text("\(Int(p * 100))%").font(.geist(13, .medium)).monospacedDigit().foregroundStyle(Color.text)
                } else if model.exported != nil {
                    Button { showShare = true } label: { Label("Saved", systemImage: "checkmark") }
                        .tint(Color.process)
                } else {
                    Button("Export") { tick += 1; Task { await model.export() } }
                        .disabled(model.built == nil)
                }
            }
        }
        .task { if case .listening = model.phase { await model.load(films) } }
        .onDisappear { model.player.pause() }
        .sheet(isPresented: $showShare) { if let url = model.exported { ShareSheet(items: [url]) } }
        .fullScreenCover(isPresented: $full) { FullPreview(model: model) }
        .sheet(isPresented: $checking) {
            ReviewSheet(model: model, script: shoot?.script ?? "") { tick += 1; Task { await model.export() } }
                .presentationDetents([.large])
        }
        .sensoryFeedback(.selection, trigger: tool)
        .sensoryFeedback(.impact(weight: .medium), trigger: tick)
        .sensoryFeedback(.success, trigger: model.exported != nil) { _, done in done }
        .onChange(of: selected) { _, id in
            guard let id else { return }
            if model.texts.contains(where: { $0.id == id }) { tool = .text }
            if model.media.contains(where: { $0.id == id }) { tool = .overlay }
        }
    }

    // Play, scrub, time.
    private var transport: some View {
        HStack(spacing: 12) {
            Button { model.togglePlay() } label: {
                Image(systemName: model.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
            .foregroundStyle(Color.text)
            .sensoryFeedback(.impact(weight: .light), trigger: model.playing)
            Slider(value: Binding(get: { model.time }, set: { model.seek($0) }), in: 0...max(0.1, model.timeline.duration))
                .tint(.white)
            Text("\(fmt(model.time)) / \(fmt(model.timeline.duration))")
                .font(.geist(12, .medium)).monospacedDigit().foregroundStyle(Color.textMuted)
        }
    }

    private var toolbar: some View {
        HStack(spacing: 0) {
            ForEach(Tool.allCases) { t in
                Button { withAnimation(.ui) { tool = t } } label: {
                    VStack(spacing: 4) {
                        Image(systemName: t.icon).font(.system(size: 18, weight: .medium))
                        Text(t.label).font(.geist(10, .medium))
                    }
                    .foregroundStyle(tool == t ? Color.text : Color.textFaint)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .background(Color.raised.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Color.line).frame(height: 1) }
    }

    @ViewBuilder private var panel: some View {
        switch tool {
        case .cut: CutPanel(model: model, notes: $notes, script: shoot?.script ?? "")
        case .clips: ClipsPanel(model: model)
        case .captions: CaptionsPanel(model: model)
        case .text: TextPanel(model: model, selected: $selected)
        case .overlay: OverlayPanel(model: model, selected: $selected)
        case .audio: AudioPanel(model: model)
        case .words: WordsPanel(model: model)
        }
        if let m = model.message { Text(m).font(.tSmall).foregroundStyle(Color.danger).padding(.top, 12) }
    }

    private func fmt(_ t: Double) -> String { String(format: "%d:%02d", Int(t) / 60, Int(t) % 60) }
}

// MARK: - the live picture

private struct Stage: View {
    @Bindable var model: EditModel
    @Binding var selected: String?
    @Binding var tool: EditorView.Tool
    @Binding var full: Bool
    @State private var snapTick = 0
    @State private var dragStart: CGPoint?
    @State private var snapping = false
    @State private var pinchStart: Double?

    var body: some View {
        GeometryReader { geo in
            let k = geo.size.width / Renderer.size.width
            ZStack(alignment: .topLeading) {
                Color.black
                VideoSurface(player: model.player)
                    .onTapGesture { selected = nil; model.togglePlay() }
                if let f = model.edgeFrame {
                    Image(uiImage: f).resizable().scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height).clipped()
                        .allowsHitTesting(false)
                }

                ForEach(model.media.filter { model.time >= $0.start && model.time < $0.end }) { m in
                    MediaHandle(m: m, image: m.kind == .image ? model.image(for: m) : nil, k: k, selected: selected == m.id)
                        .gesture(move(id: m.id, size: geo.size))
                        .simultaneousGesture(pinch(id: m.id))
                        .onTapGesture { selected = m.id }
                }

                ForEach(model.texts.filter { model.time >= $0.start && model.time < $0.end }) { t in
                    PaintedText(text: t, k: k)
                        .overlay { if selected == t.id { dashed } }
                        .position(x: geo.size.width * t.x, y: geo.size.height * t.y)
                        .gesture(move(id: t.id, size: geo.size))
                        .simultaneousGesture(pinch(id: t.id))
                        .onTapGesture { selected = t.id }
                }

                if model.captions.preset != .none, let g = currentGroup {
                    CaptionArt(group: g, t: model.time, look: model.captions.look, k: k)
                        .overlay { if selected == "captions" { dashed } }
                        .position(x: geo.size.width * model.captions.x, y: geo.size.height * model.captions.y)
                        .gesture(move(id: "captions", size: geo.size))
                        .simultaneousGesture(pinch(id: "captions"))
                        .onTapGesture { selected = "captions"; tool = .captions }
                }

                // Where the feed's buttons will sit, only while you move something.
                if moving {
                    SafeZoneGuide(warn: covered != nil)
                }

                // The centre line shows while something snaps to it.
                if snapping {
                    Rectangle().fill(Color.process.opacity(0.8)).frame(width: 1, height: geo.size.height)
                        .position(x: geo.size.width / 2, y: geo.size.height / 2)
                        .allowsHitTesting(false)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(9 / 16, contentMode: .fit)
        .frame(maxHeight: 440)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .overlay(alignment: .top) {
            if moving, let c = covered {
                Text(c).font(.geist(11, .semibold)).foregroundStyle(.white).lineLimit(1).fixedSize()
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(Color.danger))
                    .padding(.top, 8)
                    .transition(.opacity)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            corner("arrow.up.left.and.arrow.down.right") { full = true }
        }
        .animation(.ui, value: covered)
        .sensoryFeedback(.impact(weight: .light), trigger: snapTick)
        .sensoryFeedback(.selection, trigger: selected)
        .sensoryFeedback(.warning, trigger: moving && covered != nil) { _, now in now }
    }

    private var moving: Bool { dragStart != nil || pinchStart != nil }

    private var currentGroup: CapGroup? { model.groups.first { model.time >= $0.t0 && model.time < $0.t1 } }

    private func corner(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 32, height: 32).background(Circle().fill(Color.black.opacity(0.5)))
        }
        .buttonStyle(.plain)
        .padding(8)
    }

    // Says so when the thing you are moving (or the captions) would end up
    // under the feed's buttons.
    private var covered: String? {
        let id = selected ?? "captions"
        let s = Renderer.size
        var r: CGRect?
        if id == "captions", model.captions.preset != .none, let g = currentGroup ?? model.groups.first {
            let b = CaptionLayers.layout(g, look: model.captions.look).reduce(CGRect.null) { $0.union($1.rect) }
            if !b.isNull { r = CGRect(x: model.captions.x - b.width / 2 / s.width, y: model.captions.y - b.height / 2 / s.height,
                                      width: b.width / s.width, height: b.height / s.height) }
        } else if let t = model.texts.first(where: { $0.id == id }) {
            let m = CaptionLayers.measure(t.text.split(separator: " ").map(String.init), font: t.font.ui(t.size), maxWidth: 920, pill: t.pill)
            let w = m.width - (t.pill ? 64 : 48), h = m.height - (t.pill ? 32 : 24)
            r = CGRect(x: t.x - w / 2 / s.width, y: t.y - h / 2 / s.height, width: w / s.width, height: h / s.height)
        }
        guard let r, !SafeZone.holds(r) else { return nil }
        let what = id == "captions" ? "Captions" : "Text"
        if r.maxY > 1 - SafeZone.bottom { return "\(what) covered by the feed's text" }
        if r.maxX > 1 - SafeZone.right { return "\(what) covered by the like buttons" }
        if r.minY < SafeZone.top { return "\(what) covered by the top tabs" }
        return "\(what) too close to the edge"
    }

    private var dashed: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.white.opacity(0.85), style: StrokeStyle(lineWidth: 1, dash: [4]))
    }

    private func position(of id: String) -> CGPoint {
        if id == "captions" { return CGPoint(x: model.captions.x, y: model.captions.y) }
        if let t = model.texts.first(where: { $0.id == id }) { return CGPoint(x: t.x, y: t.y) }
        if let m = model.media.first(where: { $0.id == id }) { return CGPoint(x: m.x, y: m.y) }
        return .zero
    }

    private func setPosition(_ p: CGPoint, of id: String) {
        if id == "captions" { model.captions.x = p.x; model.captions.y = p.y; return }
        if let i = model.texts.firstIndex(where: { $0.id == id }) { model.texts[i].x = p.x; model.texts[i].y = p.y }
        if let i = model.media.firstIndex(where: { $0.id == id }) { model.media[i].x = p.x; model.media[i].y = p.y }
    }

    private func committed(_ id: String) {
        if model.media.contains(where: { $0.id == id && $0.kind == .video }) { model.rebuild() } else { model.regroup() }
    }

    private func move(id: String, size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { v in
                if dragStart == nil { dragStart = position(of: id); selected = id }
                guard let s = dragStart else { return }
                var x = s.x + v.translation.width / size.width
                let y = min(0.95, max(0.05, s.y + v.translation.height / size.height))
                // Snap to the centre line, with a tap of haptics on the way in.
                let near = abs(x - 0.5) < 0.025
                if near { x = 0.5 }
                if near != snapping { snapping = near; if near { snapTick += 1 } }
                setPosition(CGPoint(x: min(0.95, max(0.05, x)), y: y), of: id)
            }
            .onEnded { _ in
                dragStart = nil
                snapping = false
                committed(id)
            }
    }

    private func pinch(id: String) -> some Gesture {
        MagnifyGesture()
            .onChanged { v in
                if pinchStart == nil {
                    pinchStart = id == "captions" ? model.captions.size
                        : model.texts.first(where: { $0.id == id })?.size ?? model.media.first(where: { $0.id == id })?.width
                }
                guard let s = pinchStart else { return }
                let m = v.magnification
                if id == "captions" { model.captions.size = min(200, max(30, s * m)) }
                else if let i = model.texts.firstIndex(where: { $0.id == id }) { model.texts[i].size = min(220, max(24, s * m)) }
                else if let i = model.media.firstIndex(where: { $0.id == id }) { model.media[i].width = min(1, max(0.15, s * m)) }
            }
            .onEnded { _ in
                pinchStart = nil
                committed(id)
            }
    }
}

// A text overlay drawn by the same routine the export uses, scaled to the
// preview. Drawn into a real bitmap: a Canvas's recording context turned
// outlined text into a solid black box on device.
struct PaintedText: View {
    let text: TextOverlay
    let k: CGFloat

    var body: some View {
        let font = text.font.ui(text.size)
        let color = text.pill && text.color == .white ? UIColor.black : text.color.ui
        let words = text.text.split(separator: " ").map { (String($0), color) }
        let pill: UIColor? = text.pill ? (text.color == .white ? .white : UIColor.black.withAlphaComponent(0.75)) : nil
        let size = CaptionLayers.measure(words.map(\.0), font: font, maxWidth: 920, pill: pill != nil)
        let image = UIGraphicsImageRenderer(size: CGSize(width: max(1, size.width * k), height: max(1, size.height * k))).image { r in
            let cg = r.cgContext
            cg.scaleBy(x: k, y: k)
            if pill == nil { cg.setShadow(offset: CGSize(width: 0, height: 4), blur: 14, color: UIColor.black.withAlphaComponent(0.6).cgColor) }
            CaptionLayers.draw(words, font: font, stroke: 0, maxWidth: 920,
                               center: CGPoint(x: size.width / 2, y: size.height / 2), pill: pill, in: cg)
        }
        Image(uiImage: image)
            .frame(width: size.width * k, height: size.height * k)
            .contentShape(Rectangle())
    }
}

struct MediaHandle: View {
    let m: MediaOverlay
    let image: UIImage?
    let k: CGFloat
    let selected: Bool

    var body: some View {
        let w = Renderer.size.width * m.width * k
        RoundedRectangle(cornerRadius: 28 * k, style: .continuous)
            .fill(Color.clear)
            .frame(width: w, height: w * m.aspect)
            .background {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                        .frame(width: w, height: w * m.aspect)
                        .clipShape(RoundedRectangle(cornerRadius: 28 * k, style: .continuous))
                }
            }
            .overlay {
                if selected || m.kind == .video {
                    RoundedRectangle(cornerRadius: 28 * k, style: .continuous)
                        .strokeBorder(Color.white.opacity(selected ? 0.9 : 0.35), style: StrokeStyle(lineWidth: 1, dash: [4]))
                }
            }
            .contentShape(Rectangle())
            .position(x: Renderer.size.width * m.x * k, y: Renderer.size.height * m.y * k)
    }
}

// MARK: - panels

private struct CutPanel: View {
    @Bindable var model: EditModel
    @Binding var notes: String
    let script: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("", text: $notes, prompt: Text("Notes, e.g. cut the pricing bit").foregroundStyle(Color.textFaint))
                .field()
            Button {
                Task { await model.cut(script: script, notes: notes) }
            } label: {
                if let started = model.planStarted {
                    // It thinks for a minute or more; the seconds say it is still going.
                    TimelineView(.periodic(from: started, by: 1)) { ctx in
                        Text("Picking takes · \(Int(ctx.date.timeIntervalSince(started)))s").monospacedDigit()
                    }
                } else {
                    Text(model.plan.note.isEmpty ? "Cut" : "Cut again")
                }
            }
            .buttonStyle(.pill)
            .disabled(model.planning)
            .sensoryFeedback(.success, trigger: model.plan.note) { _, n in !n.isEmpty }
            if !model.plan.note.isEmpty {
                Text(model.plan.note).font(.tSmall).foregroundStyle(Color.textMuted)
                Button("Keep everything") { model.keepEverything() }.font(.tSmall).foregroundStyle(Color.textFaint)
            }
            HStack(alignment: .top, spacing: 20) {
                // Hand-placed clips keep exactly the edges you gave them.
                if model.clips == nil {
                    Labeled("Pauses") {
                        Seg(options: [(Pace.tight, "Tight"), (Pace.natural, "Natural")],
                            value: Binding(get: { model.settings.pace }, set: { model.settings.pace = $0; model.rebuild() }))
                    }
                }
                Labeled("Speed") {
                    Seg(options: [(1.0, "1×"), (1.1, "1.1×"), (1.2, "1.2×")],
                        value: Binding(get: { model.settings.speed }, set: { model.settings.speed = $0; model.rebuild() }))
                }
            }
            Toggle(isOn: Binding(get: { model.settings.zoom }, set: { model.settings.zoom = $0; model.rebuild() })) {
                Text("Zoom on cuts").font(.tBody).foregroundStyle(Color.text)
            }
            .tint(Color.process)
        }
    }
}

private struct CaptionsPanel: View {
    @Bindable var model: EditModel

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Labeled("Style") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(CaptionStyle.allCases, id: \.self) { s in
                            Chip(label: s.label, on: model.captions.preset == s) {
                                model.captions = CaptionSettings.preset(s, keepingPosition: model.captions)
                                model.regroup()
                            }
                        }
                    }
                }
            }
            if model.captions.preset != .none {
                Labeled("Font") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(CapFont.allCases, id: \.self) { f in
                                Chip(label: f.label, font: Font(f.ui(15)), on: model.captions.font == f) { model.captions.font = f; model.regroup() }
                            }
                        }
                    }
                }
                Labeled("Size") {
                    Slider(value: Binding(get: { model.captions.size }, set: { model.captions.size = $0 }), in: 30...200,
                           onEditingChanged: { if !$0 { model.regroup() } }).tint(.white)
                }
                Labeled("Colour") { Swatches(value: Binding(get: { model.captions.fill }, set: { model.captions.fill = $0; model.regroup() })) }
                Labeled("Highlight") { Swatches(value: Binding(get: { model.captions.highlight }, set: { model.captions.highlight = $0; model.regroup() })) }
                Labeled("Words on screen") {
                    Seg(options: [(1, "1"), (2, "2"), (3, "3"), (4, "4"), (6, "6")],
                        value: Binding(get: { model.captions.maxWords }, set: { model.captions.maxWords = $0; model.regroup() }))
                }
                Labeled("Entrance") {
                    Seg(options: CapAnim.allCases.map { ($0, $0.label) },
                        value: Binding(get: { model.captions.anim }, set: { model.captions.anim = $0; model.regroup() }))
                }
                VStack(spacing: 4) {
                    toggle("Outline", \.outline)
                    toggle("Capitals", \.upper)
                    toggle("Light up the spoken word", \.trackWord)
                    toggle("Box behind the spoken word", \.box)
                    toggle("Words appear as they're said", \.reveal)
                }
                Button("Reset position") { model.captions.x = 0.5; model.captions.y = 0.64; model.regroup() }
                    .font(.tSmall).foregroundStyle(Color.textFaint)
                Text("Drag the captions on the video to move them, pinch to resize.").font(.tSmall).foregroundStyle(Color.textFaint)
            }
        }
    }

    private func toggle(_ label: String, _ key: WritableKeyPath<CaptionSettings, Bool>) -> some View {
        Toggle(isOn: Binding(get: { model.captions[keyPath: key] }, set: { model.captions[keyPath: key] = $0; model.regroup() })) {
            Text(label).font(.tBody).foregroundStyle(Color.text)
        }
        .tint(Color.process)
        .sensoryFeedback(.selection, trigger: model.captions[keyPath: key])
    }
}

private struct TextPanel: View {
    @Bindable var model: EditModel
    @Binding var selected: String?
    @State private var draft = ""
    @FocusState private var typing: Bool

    private var index: Int? { model.texts.firstIndex { $0.id == selected } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                TextField("", text: $draft, prompt: Text("Type text to add").foregroundStyle(Color.textFaint))
                    .focused($typing)
                    .submitLabel(.done)
                    .onSubmit(add)
                    .field()
                Button(action: add) {
                    Image(systemName: "plus").font(.system(size: 16, weight: .semibold)).frame(width: 52, height: 52)
                        .background(Circle().fill(Color.white)).foregroundStyle(Color.bg)
                }
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                .sensoryFeedback(.impact(weight: .medium), trigger: model.texts.count)
            }
            if let i = index {
                TextField("", text: Binding(get: { model.texts[i].text }, set: { model.texts[i].text = $0 }))
                    .onSubmit { model.regroup() }
                    .field()
                Labeled("Font") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(CapFont.allCases, id: \.self) { f in
                                Chip(label: f.label, font: Font(f.ui(15)), on: model.texts[i].font == f) { model.texts[i].font = f; model.regroup() }
                            }
                        }
                    }
                }
                Labeled("Size") {
                    Slider(value: Binding(get: { model.texts[i].size }, set: { model.texts[i].size = $0 }), in: 24...220,
                           onEditingChanged: { if !$0 { model.regroup() } }).tint(.white)
                }
                Labeled("Colour") { Swatches(value: Binding(get: { model.texts[i].color }, set: { model.texts[i].color = $0; model.regroup() })) }
                Toggle(isOn: Binding(get: { model.texts[i].pill }, set: { model.texts[i].pill = $0; model.regroup() })) {
                    Text("Background").font(.tBody).foregroundStyle(Color.text)
                }
                .tint(Color.process)
                Timing(start: Binding(get: { model.texts[i].start }, set: { model.texts[i].start = $0 }),
                       end: Binding(get: { model.texts[i].end }, set: { model.texts[i].end = $0 }),
                       duration: max(0.1, model.timeline.duration), now: model.time) { model.regroup() }
                Button("Delete text", role: .destructive) { model.texts.remove(at: i); selected = nil; model.regroup() }
                    .font(.tSmall)
            } else if !model.texts.isEmpty {
                Text("Tap a text on the video to edit it. Drag to move, pinch to resize.").font(.tSmall).foregroundStyle(Color.textFaint)
            }
        }
    }

    private func add() {
        let t = draft.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        selected = model.addText(t)
        draft = ""
        typing = false
    }
}

private struct OverlayPanel: View {
    @Bindable var model: EditModel
    @Binding var selected: String?
    @State private var pick: PhotosPickerItem?
    @State private var loading = false

    private var index: Int? { model.media.firstIndex { $0.id == selected } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PhotosPicker(selection: $pick, matching: .any(of: [.images, .videos])) {
                Label(loading ? "Adding…" : "Add a photo or video", systemImage: "plus")
            }
            .buttonStyle(.pill)
            .onChange(of: pick) { _, item in if let item { Task { await add(item) } } }
            if let i = index {
                Labeled("Size") {
                    Slider(value: Binding(get: { model.media[i].width }, set: { model.media[i].width = $0 }), in: 0.15...1,
                           onEditingChanged: { if !$0 { commit(i) } }).tint(.white)
                }
                Timing(start: Binding(get: { model.media[i].start }, set: { model.media[i].start = $0 }),
                       end: Binding(get: { model.media[i].end }, set: { model.media[i].end = $0 }),
                       duration: max(0.1, model.timeline.duration), now: model.time) { commit(i) }
                Button("Remove", role: .destructive) {
                    let video = model.media[i].kind == .video
                    model.media.remove(at: i); selected = nil
                    if video { model.rebuild() } else { model.regroup() }
                }
                .font(.tSmall)
            } else {
                Text("Pictures and clips go on top of you, from where the playhead is. Drag to place, pinch to size.")
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }
        }
    }

    private func commit(_ i: Int) {
        if model.media[i].kind == .video { model.rebuild() } else { model.regroup() }
    }

    private func add(_ item: PhotosPickerItem) async {
        guard let folder = model.folder else { return }
        loading = true
        defer { loading = false; pick = nil }
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }),
           let movie = try? await item.loadTransferable(type: PickedMovie.self) {
            let ext = movie.url.pathExtension.isEmpty ? "mov" : movie.url.pathExtension
            let name = "overlay-\(UUID().uuidString.prefix(6)).\(ext)"
            let dest = folder.appendingPathComponent(name)
            try? FileManager.default.moveItem(at: movie.url, to: dest)
            let asset = AVURLAsset(url: dest)
            var aspect = 16.0 / 9, dur = 3.0
            if let v = try? await asset.loadTracks(withMediaType: .video).first,
               let (n, t) = try? await v.load(.naturalSize, .preferredTransform) {
                let r = CGRect(origin: .zero, size: n).applying(t)
                aspect = abs(r.height / max(1, r.width))
            }
            if let d = try? await asset.load(.duration) { dur = d.seconds }
            selected = model.addMedia(kind: .video, file: name, aspect: aspect, duration: dur)
        } else if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
            let name = "overlay-\(UUID().uuidString.prefix(6)).jpg"
            try? img.jpegData(compressionQuality: 0.9)?.write(to: folder.appendingPathComponent(name))
            selected = model.addMedia(kind: .image, file: name, aspect: img.size.height / max(1, img.size.width), duration: nil)
        }
    }
}

// A video from Photos, copied somewhere we may keep it.
struct PickedMovie: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { m in SentTransferredFile(m.url) } importing: { received in
            let dest = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: dest)
            return PickedMovie(url: dest)
        }
    }
}

private struct AudioPanel: View {
    @Bindable var model: EditModel
    @State private var importing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Labeled("Voice") {
                Slider(value: Binding(get: { model.audio.voice }, set: { model.audio.voice = $0 }), in: 0...2,
                       onEditingChanged: { if !$0 { model.rebuild() } }).tint(.white)
            }
            Toggle(isOn: Binding(get: { model.audio.cleanVoice }, set: { on in Task { await model.setCleanVoice(on) } })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Remove background noise").font(.tBody).foregroundStyle(Color.text)
                    if let p = model.cleaning { Text("Cleaning \(Int(p * 100))%").font(.tSmall).foregroundStyle(Color.textMuted) }
                }
            }
            .tint(Color.process)
            .sensoryFeedback(.selection, trigger: model.audio.cleanVoice)

            Labeled("Music") {
                if let name = model.audio.musicName {
                    HStack {
                        Image(systemName: "music.note").foregroundStyle(Color.textMuted)
                        Text(name).font(.tBody).foregroundStyle(Color.text).lineLimit(1)
                        Spacer()
                        Button("Remove") { model.audio.musicFile = nil; model.audio.musicName = nil; model.rebuild() }
                            .font(.tSmall).foregroundStyle(Color.textFaint)
                    }
                    Slider(value: Binding(get: { model.audio.music }, set: { model.audio.music = $0 }), in: 0...1,
                           onEditingChanged: { if !$0 { model.rebuild() } }).tint(.white)
                } else {
                    Button("Add music from Files") { importing = true }.buttonStyle(.pillSecondary)
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.audio]) { result in
            guard case .success(let url) = result, let folder = model.folder else { return }
            let ok = url.startAccessingSecurityScopedResource()
            defer { if ok { url.stopAccessingSecurityScopedResource() } }
            let name = "music-\(UUID().uuidString.prefix(6)).\(url.pathExtension)"
            try? FileManager.default.copyItem(at: url, to: folder.appendingPathComponent(name))
            model.audio.musicFile = name
            model.audio.musicName = url.deletingPathExtension().lastPathComponent
            model.rebuild()
        }
    }
}

// The transcript. Tap a word to pick it: retype it (the captions show what
// you type), cut it or bring it back, or highlight it.
private struct WordsPanel: View {
    @Bindable var model: EditModel
    @State private var picked: WKey?
    @State private var draft = ""
    @FocusState private var typing: Bool

    private var speakingKey: WKey? { model.timeline.caps.first { model.time >= $0.t0 && model.time < $0.t1 }?.key }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let k = picked {
                editor(k)
            } else {
                Text("Tap a word to change it, cut it or highlight it.").font(.tSmall).foregroundStyle(Color.textFaint)
            }
            ForEach(Array(model.heard.enumerated()), id: \.offset) { c, h in
                VStack(alignment: .leading, spacing: 6) {
                    if model.heard.count > 1 { Text("Take \(c + 1)").font(.tLabel).foregroundStyle(Color.textMuted) }
                    WordFlow(words: h.words, take: c, plan: model.plan, kept: model.isKept, speaking: speakingKey, picked: picked) { key in
                        pick(key)
                    }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: picked)
        .sensoryFeedback(.impact(weight: .medium), trigger: model.plan.kept.count)
    }

    private func editor(_ k: WKey) -> some View {
        let kept = model.isKept(k)
        let hot = model.plan.hot.contains(k)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("", text: $draft, prompt: Text("Word").foregroundStyle(Color.textFaint))
                    .focused($typing)
                    .submitLabel(.done)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onSubmit { commit() }
                    .field()
                Button { commit(); picked = nil } label: {
                    Image(systemName: "checkmark").font(.system(size: 16, weight: .semibold)).frame(width: 52, height: 52)
                        .background(Circle().fill(Color.white)).foregroundStyle(Color.bg)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 8) {
                Chip(label: kept ? "Cut it" : "Bring it back", on: false) { commit(); model.toggle(k, hot: false) }
                Chip(label: hot ? "Remove highlight" : "Highlight", on: hot) { commit(); model.toggle(k, hot: true) }
                if model.plan.fixes[k] != nil {
                    Chip(label: "Undo change", on: false) {
                        model.fix(k, text: "")
                        draft = original(k)
                    }
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }

    private func original(_ k: WKey) -> String {
        model.heard.indices.contains(k.c) && model.heard[k.c].words.indices.contains(k.i) ? model.heard[k.c].words[k.i].text : ""
    }

    private func pick(_ key: WKey) {
        commit()
        if picked == key { picked = nil; return }
        picked = key
        draft = model.plan.fixes[key] ?? original(key)
        // Jump the preview to the word, when it plays.
        if let cap = model.timeline.caps.first(where: { $0.key == key }) { model.seek(cap.t0) }
    }

    // Saves the typed word, if it changed.
    private func commit() {
        guard let k = picked else { return }
        let now = model.plan.fixes[k] ?? original(k)
        let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty, t != now { model.fix(k, text: t) }
    }
}

// MARK: - small pieces

private struct Labeled<Content: View>: View {
    let label: String
    let content: Content
    init(_ label: String, @ViewBuilder content: () -> Content) { self.label = label; self.content = content() }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.tLabel).foregroundStyle(Color.textMuted)
            content
        }
    }
}

private struct Chip: View {
    let label: String
    var font: Font = .geist(13, .medium)
    let on: Bool
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(label).font(font).foregroundStyle(on ? Color.bg : Color.text)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Capsule().fill(on ? Color.white : Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: on)
    }
}

private struct Swatches: View {
    @Binding var value: RGBA
    var body: some View {
        HStack(spacing: 10) {
            ForEach(RGBA.palette, id: \.self) { c in
                Button { value = c } label: {
                    Circle().fill(c.color).frame(width: 30, height: 30)
                        .overlay(Circle().strokeBorder(Color.white.opacity(value == c ? 1 : 0.15), lineWidth: value == c ? 2.5 : 1))
                        .padding(2)
                }
                .buttonStyle(.plain)
            }
        }
        .sensoryFeedback(.selection, trigger: value)
    }
}

// When something shows: from the playhead, until the playhead, or by sliders.
private struct Timing: View {
    @Binding var start: Double
    @Binding var end: Double
    let duration: Double
    let now: Double
    let done: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Shows \(fmt(start)) – \(fmt(end))").font(.tLabel).foregroundStyle(Color.textMuted)
                Spacer()
                Button("Start here") { start = min(now, end - 0.2); done() }.font(.tSmall)
                Button("End here") { end = max(now, start + 0.2); done() }.font(.tSmall)
            }
            .foregroundStyle(Color.text)
            Slider(value: Binding(get: { start }, set: { start = min($0, end - 0.2) }), in: 0...duration, onEditingChanged: { if !$0 { done() } }).tint(.white)
            Slider(value: Binding(get: { end }, set: { end = max($0, start + 0.2) }), in: 0...duration, onEditingChanged: { if !$0 { done() } }).tint(.white)
        }
    }
    private func fmt(_ t: Double) -> String { String(format: "%d:%04.1f", Int(t) / 60, t.truncatingRemainder(dividingBy: 60)) }
}

// AVPlayerLayer, filling its frame.
struct VideoSurface: UIViewRepresentable {
    let player: AVPlayer
    func makeUIView(context: Context) -> PlayerView { let v = PlayerView(); v.layer.player = player; v.layer.videoGravity = .resizeAspectFill; return v }
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

// The transcript, word by word, wrapping like text.
private struct WordFlow: View {
    let words: [Word]
    let take: Int
    let plan: Plan
    let kept: (WKey) -> Bool
    let speaking: WKey?
    let picked: WKey?
    let tap: (WKey) -> Void

    var body: some View {
        FlowLayout(spacing: 4, lineSpacing: 6) {
            ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                let key = WKey(c: take, i: i)
                let kept = kept(key)
                let hot = plan.hot.contains(key)
                let on = picked == key
                Text(plan.fixes[key] ?? w.text)
                    .font(.geist(15, hot ? .semibold : .regular))
                    .foregroundStyle(on ? Color.bg : kept ? Color.text : Color.textFaint)
                    .strikethrough(!kept && !on, color: Color.textFaint)
                    .underline(hot && !on, color: RGBA.yellow.color)
                    .opacity(kept || on ? 1 : 0.5)
                    .padding(.horizontal, 4).padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(on ? Color.white : speaking == key ? Color.raisedHover : .clear))
                    .contentShape(Rectangle())
                    .onTapGesture { tap(key) }
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
