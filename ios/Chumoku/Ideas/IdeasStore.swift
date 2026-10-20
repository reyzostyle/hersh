import Foundation
import Supabase

nonisolated struct OutlineSection: Codable, Hashable {
    let title: String
    let content: String
    let duration: String?
}

nonisolated struct Outline: Codable, Hashable {
    let hook: String
    let sections: [OutlineSection]
    let cta: String

    // What you read while filming: hook, every section, the call to action.
    var script: String {
        ([hook] + sections.map(\.content) + [cta]).filter { !$0.isEmpty }.joined(separator: "\n\n")
    }
}

// A row of competitor_ideas, the same table the web Ideas tab reads.
nonisolated struct Idea: Codable, Identifiable, Hashable {
    let id: String
    let channelName: String?
    let videoId: String
    let videoTitle: String?
    let videoThumbnail: String?
    let videoViews: Int?
    let outlierScore: Double?
    let pitch: String?
    let fit: String?
    let concept: String?
    let adaptedIdea: String?
    let outline: Outline?
    var liked: Bool?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, pitch, fit, concept, outline, liked
        case channelName = "channel_name"
        case videoId = "video_id"
        case videoTitle = "video_title"
        case videoThumbnail = "video_thumbnail"
        case videoViews = "video_views"
        case outlierScore = "outlier_score"
        case adaptedIdea = "adapted_idea"
        case createdAt = "created_at"
    }

    // The line worth reading first: the hook if one was written, then the
    // pitch for this creator, then the source title.
    var headline: String { outline?.hook ?? pitch ?? videoTitle ?? "Untitled" }

    var thumbnailURL: URL? {
        URL(string: videoThumbnail ?? "https://i.ytimg.com/vi/\(videoId)/sddefault.jpg")
    }

    var shortsURL: URL? { URL(string: "https://www.youtube.com/shorts/\(videoId)") }

    // "14×": how far it beat its own channel, the number the feed is sorted by.
    var outlierBadge: String? {
        guard let o = outlierScore, o >= 2, o < 1000 else { return nil }
        return "\(Int(o.rounded()))×"
    }

    // What you read off the prompter: the outline if there is one, else the angle.
    var filmScript: String { outline?.script ?? adaptedIdea ?? "" }

    var meta: String {
        var parts: [String] = []
        if let v = videoViews { parts.append("\(Idea.compact(v)) views") }
        if let o = outlierScore, o >= 1, o < 1000 { parts.append("\(Int(o.rounded()))× its channel") }
        return parts.joined(separator: " · ")
    }

    static func compact(_ n: Int) -> String {
        func trim(_ d: Double) -> String { String(format: "%.1f", d).replacingOccurrences(of: ".0", with: "") }
        if n >= 1_000_000 { return trim(Double(n) / 1_000_000) + "M" }
        if n >= 1_000 { return trim(Double(n) / 1_000) + "K" }
        return String(n)
    }
}

nonisolated struct DailyDrop: Decodable {
    let date: String
    let nextAt: String
    let size: Int
    let items: [Idea]
    let needsProfile: Bool?
}

@Observable
final class IdeasStore {
    var today: [Idea] = []
    var saved: [Idea] = []
    var nextAt: Date?
    var needsProfile = false
    var loadingToday = false
    var loadingSaved = false
    var error: String?
    // Which ideas have a model call running, and which step.
    enum Step { case angle, outline }
    var working: [String: Step] = [:]

    // Today's drop, built server-side on the first call of the day, so the
    // first open can take a few seconds.
    func loadToday() async {
        #if DEBUG
        if Self.isDemo { if today.isEmpty { fillDemo() }; return }
        #endif
        loadingToday = true
        defer { loadingToday = false }
        do {
            let drop: DailyDrop = try await supabase.functions.invoke(
                "daily-ideas",
                options: FunctionInvokeOptions(body: ["timezone": TimeZone.current.identifier])
            )
            today = drop.items
            needsProfile = drop.needsProfile ?? false
            nextAt = ISO8601DateFormatter.withFractions.date(from: drop.nextAt) ?? ISO8601DateFormatter().date(from: drop.nextAt)
            error = nil
        } catch {
            self.error = "Could not load today's ideas."
        }
    }

    func loadSaved() async {
        #if DEBUG
        if Self.isDemo { return }
        #endif
        guard let uid = try? await supabase.auth.session.user.id else { return }
        loadingSaved = true
        defer { loadingSaved = false }
        do {
            saved = try await supabase.from("competitor_ideas")
                .select()
                .eq("user_id", value: uid)
                .eq("liked", value: true)
                .order("created_at", ascending: false)
                .limit(100)
                .execute()
                .value
        } catch {
            self.error = "Could not load saved ideas."
        }
    }

    // Save (true), dismiss (false) or undo (nil), written straight through.
    func rule(_ idea: Idea, liked: Bool?) async {
        func apply(_ list: inout [Idea]) {
            if let i = list.firstIndex(where: { $0.id == idea.id }) { list[i].liked = liked }
        }
        apply(&today)
        apply(&saved)
        if liked == true, !saved.contains(where: { $0.id == idea.id }) {
            var s = idea
            s.liked = true
            saved.insert(s, at: 0)
        }
        if liked != true { saved.removeAll { $0.id == idea.id } }
        #if DEBUG
        if Self.isDemo { return }
        #endif
        do {
            try await supabase.from("competitor_ideas")
                .update(["liked": liked])
                .eq("id", value: idea.id)
                .execute()
        } catch {
            self.error = "Could not save that. Try again."
        }
    }
}

extension IdeasStore {
    nonisolated private struct IdeaResponse: Decodable { let idea: Idea }
    nonisolated private struct ErrorBody: Decodable { let error: String? }

    // Step 1, one credit: the model reads the video and writes this creator's angle.
    func revealAngle(_ idea: Idea) async -> String? {
        await run(idea, .angle, "enrich-competitor-video", ["videoId": .string(idea.videoId), "adaptForProfile": .bool(true)])
    }

    // Step 2, four credits: it watches the video and writes the outline.
    func buildOutline(_ idea: Idea) async -> String? {
        await run(idea, .outline, "generate-outline", ["ideaId": .string(idea.id)])
    }

    // Returns an error to show, or nil when the idea was updated.
    private func run(_ idea: Idea, _ step: Step, _ fn: String, _ body: [String: AnyJSON]) async -> String? {
        #if DEBUG
        if Self.isDemo { return "Not in demo mode." }
        #endif
        working[idea.id] = step
        defer { working[idea.id] = nil }
        do {
            let res: IdeaResponse = try await supabase.functions.invoke(fn, options: FunctionInvokeOptions(body: body))
            replace(res.idea)
            return nil
        } catch let FunctionsError.httpError(_, data) {
            let msg = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            if msg == "limit_reached" { return "You're out of credits. Top up on chumoku.co." }
            if msg == "upgrade_required" { return "This needs a paid plan. Upgrade on chumoku.co." }
            return msg ?? "Something went wrong. Try again."
        } catch {
            return "Something went wrong. Try again."
        }
    }

    private func replace(_ updated: Idea) {
        if let i = today.firstIndex(where: { $0.id == updated.id || $0.videoId == updated.videoId }) { today[i] = updated }
        if let i = saved.firstIndex(where: { $0.id == updated.id }) { saved[i] = updated }
    }

    func live(_ idea: Idea) -> Idea {
        today.first { $0.id == idea.id } ?? saved.first { $0.id == idea.id } ?? idea
    }
}

extension ISO8601DateFormatter {
    static let withFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
