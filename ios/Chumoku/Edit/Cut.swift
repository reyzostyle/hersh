import Foundation
import Supabase

// The cut is a set of kept words, not a list of cuts; the same model as the
// web editor (src/lib/edit/timeline.ts), ported with its fixes: cut edges are
// pushed out to where the sound really starts and stops, and two pieces that
// both reach into a voiced pause are merged instead of playing it twice.

nonisolated struct WKey: Hashable, Codable, Sendable, CodingKeyRepresentable {
    let c: Int // take
    let i: Int // word
    init(c: Int, i: Int) { self.c = c; self.i = i }
    // So [WKey: ...] encodes as a JSON object ("2:14": ...), not a flat array.
    var codingKey: CodingKey { AnyKey("\(c):\(i)") }
    init?<T: CodingKey>(codingKey: T) {
        let p = codingKey.stringValue.split(separator: ":").compactMap { Int($0) }
        guard p.count == 2 else { return nil }
        c = p[0]; i = p[1]
    }
}

nonisolated struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

nonisolated struct Plan: Sendable {
    var kept: Set<WKey> = []
    var rank: [WKey: Double] = [:]
    var fixes: [WKey: String] = [:]
    var hot: Set<WKey> = []
    var note = ""

    static func keepAll(_ takes: [[Word]]) -> Plan {
        var p = Plan()
        for (c, words) in takes.enumerated() { for i in words.indices { p.kept.insert(WKey(c: c, i: i)) } }
        return p
    }
}

nonisolated struct Segment: Hashable, Sendable {
    let take: Int
    let src0: Double
    let src1: Double
    let out0: Double
    let out1: Double
    let zoom: Double
}

nonisolated struct CapWord: Hashable, Sendable {
    let key: WKey
    let text: String
    let t0: Double
    let t1: Double
    let hot: Bool
}

nonisolated struct CapGroup: Hashable, Sendable {
    var words: [CapWord]
    var t0: Double
    var t1: Double
}

nonisolated enum Pace: String, CaseIterable, Codable, Sendable { case tight, natural }
nonisolated enum CaptionStyle: String, CaseIterable, Codable, Sendable { case pop, bold, word, clean, none }

nonisolated struct EditSettings: Equatable, Sendable {
    var pace: Pace = .tight
    var speed: Double = 1.1
    var zoom = true
}

nonisolated struct Timeline: Sendable {
    var segments: [Segment] = []
    var caps: [CapWord] = []
    var duration: Double = 0
}

enum Cutter {
    private static func pace(_ p: Pace) -> (maxGap: Double, lead: Double, tail: Double) {
        p == .tight ? (0.2, 0.06, 0.1) : (0.45, 0.12, 0.18)
    }
    private static let reachBack = 0.5
    private static let reachFwd = 0.4

    static func build(_ takes: [Heard], durations: [Double], plan: Plan, settings: EditSettings) -> Timeline {
        let p = pace(settings.pace)
        struct Piece { var take: Int; var src0: Double; var src1: Double; var rank: Double; var lastRank: Double; var words: [Int] }
        var pieces: [Piece] = []

        for (c, heard) in takes.enumerated() {
            let words = heard.words, env = heard.env
            let thr = Listener.threshold(env)
            let dur = durations[c]
            func loud(_ t: Double) -> Bool { let i = Int((t / Listener.hop).rounded()); return i >= 0 && i < env.count && env[i] >= thr }
            func quietest(_ a: Double, _ b: Double, _ fallback: Double) -> Double {
                guard b > a else { return fallback }
                var best = fallback, bestV = Float.infinity, t = a
                while t <= b { let i = Int((t / Listener.hop).rounded()); if i >= 0 && i < env.count && env[i] < bestV { bestV = env[i]; best = t }; t += Listener.hop }
                return best
            }
            func startOf(_ i: Int) -> Double {
                let lo = max(i > 0 ? words[i - 1].e + 0.02 : 0, words[i].s - reachBack)
                var x = words[i].s
                while x - Listener.hop > lo && loud(x - Listener.hop) { x -= Listener.hop }
                let from = max(lo, x - p.lead)
                return max(0, quietest(from, x, from))
            }
            func endOf(_ i: Int) -> Double {
                let hi = min(i < words.count - 1 ? words[i + 1].s - 0.02 : dur, words[i].e + reachFwd)
                var x = words[i].e
                while x + Listener.hop < hi && loud(x + Listener.hop) { x += Listener.hop }
                let to = min(hi, x + p.tail)
                return max(words[i].e, quietest(x, to, to))
            }

            var mine: [Piece] = []
            var lastRank = 1e9 + Double(c) * 1e5
            var prevRank = -Double.infinity
            var open = false
            for i in words.indices {
                let key = WKey(c: c, i: i)
                let rank = plan.rank[key] ?? lastRank + 0.001
                lastRank = rank
                guard plan.kept.contains(key) else { open = false; prevRank = rank; continue }
                let contiguous = rank > prevRank && rank - prevRank <= 1.01
                prevRank = rank
                let joinable = open && contiguous && plan.kept.contains(WKey(c: c, i: i - 1)) && words[i].s - words[i - 1].e <= p.maxGap
                if joinable {
                    mine[mine.count - 1].words.append(i)
                    mine[mine.count - 1].lastRank = rank
                } else {
                    mine.append(Piece(take: c, src0: startOf(i), src1: 0, rank: rank, lastRank: rank, words: [i]))
                    open = true
                }
            }
            for k in mine.indices { mine[k].src1 = endOf(mine[k].words.last!) }
            var k = mine.count - 1
            while k > 0 {
                let a = mine[k - 1], b = mine[k]
                if b.words.first! == a.words.last! + 1 && a.src1 > b.src0 {
                    if b.rank > a.lastRank && b.rank - a.lastRank <= 1.01 {
                        mine[k - 1].words += b.words
                        mine[k - 1].src1 = b.src1
                        mine[k - 1].lastRank = b.lastRank
                        mine.remove(at: k)
                    } else {
                        let cut = quietest(b.src0, a.src1, (a.src1 + b.src0) / 2)
                        mine[k - 1].src1 = cut
                        mine[k].src0 = cut
                    }
                }
                k -= 1
            }
            pieces += mine
        }
        pieces.sort { $0.rank < $1.rank }

        var tl = Timeline()
        var out = 0.0
        for (n, pc) in pieces.enumerated() {
            let len = (pc.src1 - pc.src0) / settings.speed
            guard len > 0.04 else { continue }
            let zoom = settings.zoom ? (n % 2 == 0 ? 1.0 : 1.12) : 1.0
            tl.segments.append(Segment(take: pc.take, src0: pc.src0, src1: pc.src1, out0: out, out1: out + len, zoom: zoom))
            for i in pc.words {
                let w = takes[pc.take].words[i], key = WKey(c: pc.take, i: i)
                tl.caps.append(CapWord(key: key, text: plan.fixes[key] ?? w.text,
                                       t0: out + (max(w.s, pc.src0) - pc.src0) / settings.speed,
                                       t1: out + (min(w.e, pc.src1) - pc.src0) / settings.speed,
                                       hot: plan.hot.contains(key)))
            }
            out += len
        }
        tl.duration = out
        return tl
    }

    // Words into the phrases that share the screen.
    static func groups(_ caps: [CapWord], captions c: CaptionSettings) -> [CapGroup] {
        let style = c.preset
        guard style != .none else { return [] }
        let maxWords = max(1, c.maxWords)
        let maxChars = maxWords == 1 ? 99 : max(14, maxWords * 6)
        var groups: [CapGroup] = []
        var cur: [CapWord] = []
        func flush() { if let f = cur.first, let l = cur.last { groups.append(CapGroup(words: cur, t0: f.t0, t1: l.t1)) }; cur = [] }
        for (i, w) in caps.enumerated() {
            let prev = i > 0 ? caps[i - 1] : nil
            let chars = cur.reduce(0) { $0 + $1.text.count + 1 } + w.text.count
            if !cur.isEmpty, cur.count >= maxWords || chars > maxChars
                || (prev.map { w.t0 - $0.t1 > 0.45 } ?? false)
                || (prev.map { $0.text.hasSuffix(".") || $0.text.hasSuffix("?") || $0.text.hasSuffix("!") } ?? false)
                || (style == .pop && (prev.map { $0.text.hasSuffix(",") } ?? false)) {
                flush()
            }
            cur.append(CapWord(key: w.key, text: clean(w.text, c), t0: w.t0, t1: w.t1, hot: w.hot))
        }
        flush()
        for i in groups.indices {
            let next = i + 1 < groups.count ? groups[i + 1].t0 : nil
            groups[i].t1 = next.map { min($0, groups[i].t1 + 0.6) } ?? groups[i].t1 + 0.4
        }
        return groups
    }

    private static func clean(_ text: String, _ c: CaptionSettings) -> String {
        var t = text.trimmingCharacters(in: .whitespaces)
        if c.preset != .clean { t = t.trimmingCharacters(in: CharacterSet(charactersIn: ".,;:")) }
        if c.maxWords == 1 { t = t.trimmingCharacters(in: CharacterSet(charactersIn: "\"'()")) }
        return c.upper ? t.uppercased() : t
    }
}

// One line in the device log per step of an edit, so a stuck or failed edit
// says where. Visible in Xcode's console or `devicectl ... --console`.
nonisolated func trace(_ s: String) { print("[chumoku] \(s)") }

// The same edit-plan function the web editor calls: which words make the cut.
enum Planner {
    nonisolated struct RawRange: Decodable { let clip: Double; let from: Double; let to: Double }
    nonisolated struct RawWord: Decodable { let clip: Double; let i: Double; let text: String? }
    nonisolated struct Raw: Decodable { let keep: [RawRange]?; let fix: [RawWord]?; let hot: [RawWord]?; let note: String? }
    nonisolated struct Body: Encodable { let clips: [Clip]; let script: String; let instructions: String
        nonisolated struct Clip: Encodable { let words: [String]; let pauses: [Int] } }

    static func plan(_ takes: [[Word]], script: String, notes: String) async throws -> Plan {
        let body = Body(clips: takes.map { words in
            Body.Clip(words: words.map(\.text), pauses: words.indices.filter { $0 > 0 && words[$0].s - words[$0 - 1].e >= 0.7 })
        }, script: script, instructions: notes)
        // Picking takes is a model thinking over the whole transcript: ~90 s,
        // past the 60 s every request gets by default. The function's own
        // limit is 150 s, so wait just past that.
        trace("cut: asking edit-plan, \(takes.count) takes, \(takes.map(\.count).reduce(0, +)) words")
        let raw: Raw
        do {
            raw = try await supabase.functions.invoke("edit-plan", options: FunctionInvokeOptions(body: body, timeoutInterval: 170))
        } catch {
            trace("cut: failed \(error)")
            throw EditError("Picking takes failed: \(error.localizedDescription)")
        }
        trace("cut: got \(raw.keep?.count ?? 0) ranges, note: \(raw.note ?? "-")")
        var p = Plan()
        func valid(_ c: Int, _ i: Int) -> Bool { takes.indices.contains(c) && takes[c].indices.contains(i) }
        for (n, r) in (raw.keep ?? []).enumerated() {
            let c = Int(r.clip), a = Int(min(r.from, r.to)), b = Int(max(r.from, r.to))
            guard a <= b else { continue }
            for i in a...b where valid(c, i) {
                let k = WKey(c: c, i: i)
                if p.kept.insert(k).inserted { p.rank[k] = Double(n) * 1e5 + Double(i) }
            }
        }
        guard !p.kept.isEmpty else { throw EditError(raw.note ?? "The plan kept nothing.") }
        for f in raw.fix ?? [] where valid(Int(f.clip), Int(f.i)) { if let t = f.text, !t.isEmpty { p.fixes[WKey(c: Int(f.clip), i: Int(f.i))] = t } }
        for h in raw.hot ?? [] where valid(Int(h.clip), Int(h.i)) { p.hot.insert(WKey(c: Int(h.clip), i: Int(h.i))) }
        p.note = raw.note ?? ""
        return p
    }
}
