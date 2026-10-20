import SwiftUI

// The clips of the edit on a strip, like CapCut's timeline: scroll it to
// scrub, tap a clip to pick it, drag its edges to trim, and split, delete,
// duplicate or move it with the buttons underneath. The first change turns the
// automatic cut into clips you own.
struct ClipsPanel: View {
    @Bindable var model: EditModel
    @State private var selected: String?
    @State private var scrolling = false
    @State private var pos = ScrollPosition(x: 0)
    @State private var trimming: (id: String, start: Bool, dx: CGFloat)?
    @State private var tick = 0

    private let scale: CGFloat = 64 // points per second of the finished video
    private let height: CGFloat = 60

    private var clips: [ClipEdit] { model.editableClips }
    private var pick: ClipEdit? { clips.first { $0.id == selected } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(model.clips == nil ? "Automatic cut" : "Edited by hand").font(.tLabel).foregroundStyle(Color.textMuted)
                Spacer()
                Text("\(fmt(model.time)) / \(fmt(model.timeline.duration))")
                    .font(.geist(12, .medium)).monospacedDigit().foregroundStyle(Color.textMuted)
            }
            strip
            controls
        }
        .sensoryFeedback(.selection, trigger: selected)
        .sensoryFeedback(.impact(weight: .medium), trigger: tick)
        .onChange(of: clips.map(\.id)) { _, ids in if let s = selected, !ids.contains(s) { selected = nil } }
    }

    // MARK: the strip

    private var strip: some View {
        GeometryReader { geo in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(clips) { c in cell(c) }
                }
                .padding(.horizontal, geo.size.width / 2)
            }
            .scrollPosition($pos)
            .onScrollPhaseChange { _, phase in
                scrolling = phase != .idle && phase != .animating
                if phase == .interacting { model.player.pause() }
            }
            .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.x } action: { _, x in
                if scrolling { model.seek(min(max(0, Double(x / scale)), model.timeline.duration)) }
            }
            .onChange(of: model.time) { _, t in if !scrolling, trimming == nil { pos.scrollTo(x: CGFloat(t) * scale) } }
            .onAppear { pos.scrollTo(x: CGFloat(model.time) * scale) }
            // The playhead stays in the middle; the clips move under it.
            .overlay {
                Capsule().fill(Color.white).frame(width: 2, height: height + 14)
                    .shadow(color: .black.opacity(0.6), radius: 2)
                    .allowsHitTesting(false)
            }
        }
        .frame(height: height + 14)
    }

    private func width(_ c: ClipEdit) -> CGFloat {
        var w = CGFloat(c.length / model.settings.speed) * scale
        if let t = trimming, t.id == c.id { w += t.start ? -t.dx : t.dx }
        return max(14, w)
    }

    private func cell(_ c: ClipEdit) -> some View {
        let w = width(c)
        let on = selected == c.id
        let n = max(1, Int(w / 34))
        return HStack(spacing: 0) {
            ForEach(0..<n, id: \.self) { k in
                ClipFrame(model: model, take: c.take, t: c.src0 + (Double(k) + 0.5) * c.length / Double(n))
                    .frame(width: w / CGFloat(n), height: height)
                    .clipped()
            }
        }
        .frame(width: w, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(on ? Color.white : Color.black.opacity(0.6), lineWidth: on ? 2.5 : 1)
        }
        .overlay(alignment: .leading) { if on { handle(c, start: true) } }
        .overlay(alignment: .trailing) { if on { handle(c, start: false) } }
        .padding(.horizontal, 1)
        .frame(width: w + 2)
        .contentShape(Rectangle())
        .onTapGesture {
            selected = on ? nil : c.id
            if !on { model.seek(model.outStart(of: c.id) + 0.01) }
        }
    }

    // An edge you drag to trim. Takes the touch before the strip can scroll.
    private func handle(_ c: ClipEdit, start: Bool) -> some View {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(Color.white)
            .frame(width: 16, height: height)
            .overlay {
                Image(systemName: start ? "chevron.compact.left" : "chevron.compact.right")
                    .font(.system(size: 14, weight: .bold)).foregroundStyle(Color.bg)
            }
            .offset(x: start ? -6 : 6)
            .highPriorityGesture(DragGesture(minimumDistance: 1)
                .onChanged { v in
                    if trimming == nil { model.player.pause() }
                    trimming = (c.id, start, v.translation.width)
                }
                .onEnded { v in
                    trimming = nil
                    let d = Double(v.translation.width / scale) * model.settings.speed
                    model.trim(c.id, start: start, by: d)
                    tick += 1
                    // Show the frame where the clip now starts or ends.
                    let s = model.outStart(of: c.id)
                    let len = (model.editableClips.first { $0.id == c.id }?.length ?? 0) / model.settings.speed
                    model.seek(start ? s + 0.01 : max(s, s + len - 0.05))
                })
    }

    // MARK: buttons

    private var controls: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                tool("Split", "scissors") {
                    if let id = model.split(at: model.time) { selected = id; tick += 1 }
                }
                tool("Delete", "trash", disabled: pick == nil) {
                    if let id = selected { model.delete(id); selected = nil; tick += 1 }
                }
                tool("Copy", "plus.square.on.square", disabled: pick == nil) {
                    if let id = selected { model.duplicate(id); tick += 1 }
                }
                tool("Left", "arrow.left", disabled: pick == nil || clips.first?.id == selected) {
                    if let id = selected { model.move(id, by: -1); tick += 1; model.seek(model.outStart(of: id) + 0.01) }
                }
                tool("Right", "arrow.right", disabled: pick == nil || clips.last?.id == selected) {
                    if let id = selected { model.move(id, by: 1); tick += 1; model.seek(model.outStart(of: id) + 0.01) }
                }
            }
            if let c = pick {
                // A tenth of a second at a time, for the cut that has to land
                // between two words.
                HStack(spacing: 18) {
                    nudge("Start", c, start: true)
                    nudge("End", c, start: false)
                }
                Text("\(String(format: "%.1f", c.length / model.settings.speed)) s from take \(c.take + 1)")
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            } else {
                Text("Scroll the strip to move through the video. Tap a clip to trim it by its edges, move or delete it. Split cuts at the white line.")
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }
            if model.clips != nil {
                Button("Back to the automatic cut") { selected = nil; model.resetClips(); tick += 1 }
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }
        }
    }

    private func tool(_ label: String, _ icon: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 17, weight: .medium))
                Text(label).font(.geist(11, .medium))
            }
            .foregroundStyle(Color.text)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Color.white.opacity(0.07)))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
    }

    private func nudge(_ label: String, _ c: ClipEdit, start: Bool) -> some View {
        HStack(spacing: 6) {
            Text(label).font(.tLabel).foregroundStyle(Color.textMuted)
            ForEach([-0.1, 0.1], id: \.self) { d in
                Button {
                    model.trim(c.id, start: start, by: d)
                    tick += 1
                    let s = model.outStart(of: c.id)
                    let len = (model.editableClips.first { $0.id == c.id }?.length ?? 0) / model.settings.speed
                    model.seek(start ? s + 0.01 : max(s, s + len - 0.05))
                } label: {
                    Text(d < 0 ? "−0.1" : "+0.1").font(.geist(12, .medium)).monospacedDigit()
                        .foregroundStyle(Color.text)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func fmt(_ t: Double) -> String { String(format: "%d:%04.1f", Int(t) / 60, t.truncatingRemainder(dividingBy: 60)) }
}

// One frame of a take, loaded when it scrolls into view.
private struct ClipFrame: View {
    let model: EditModel
    let take: Int
    let t: Double
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            Color.raisedHover
            if let image { Image(uiImage: image).resizable().scaledToFill() }
        }
        .task(id: "\(take):\(Int(t * 2))") { image = await model.thumb(take: take, at: t) }
    }
}
