import SwiftUI
import Supabase

// Your own uploads and how each did against your usual. YouTube only for now:
// TikTok and Instagram join when posting to them does.
nonisolated struct OwnVideo: Decodable, Identifiable, Hashable, Sendable {
    let videoId: String
    let title: String
    let views: Int?
    let retentionPercentage: Double?
    let averageViewDuration: Double?
    let thumbnailUrl: String?
    let publishedAt: String?
    var id: String { videoId }

    enum CodingKeys: String, CodingKey {
        case title, views
        case videoId = "video_id"
        case retentionPercentage = "retention_percentage"
        case averageViewDuration = "average_view_duration"
        case thumbnailUrl = "thumbnail_url"
        case publishedAt = "published_at"
    }

    var published: Date? {
        guard let p = publishedAt else { return nil }
        return ISO8601DateFormatter.withFractions.date(from: p) ?? ISO8601DateFormatter().date(from: p)
    }
}

struct AnalyticsView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(\.openURL) private var openURL
    @State private var videos: [OwnVideo] = []
    @State private var channel: String?
    @State private var connected: Bool?
    @State private var loading = true

    private var median: Double {
        let v = videos.prefix(20).compactMap(\.views).sorted()
        guard !v.isEmpty else { return 0 }
        return Double(v[v.count / 2])
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Analytics").font(.tTitle).foregroundStyle(Color.text).padding(.top, 8)
                    if let channel { Text(channel).font(.tSmall).foregroundStyle(Color.textFaint).padding(.top, 4) }

                    if loading && videos.isEmpty {
                        VStack(spacing: 10) { ForEach(0..<4, id: \.self) { _ in Skeleton().frame(height: 76) } }.padding(.top, 24)
                    } else if connected == false {
                        Empty(text: "Connect your YouTube channel on chumoku.co and your videos show up here with how each did against your usual.")
                            .padding(.top, 24)
                        Button("Open chumoku.co") { if let u = URL(string: "https://chumoku.co") { openURL(u) } }
                            .buttonStyle(.pillSecondary).padding(.top, 12)
                    } else if videos.isEmpty {
                        Empty(text: "No uploads found yet. Pull to refresh.").padding(.top, 24)
                    } else {
                        summary.padding(.top, 24)
                        Text("Latest").font(.tLabel).foregroundStyle(Color.textMuted).padding(.top, 28).padding(.bottom, 10)
                        VStack(spacing: 10) {
                            ForEach(videos) { v in
                                Button { if let u = URL(string: "https://www.youtube.com/shorts/\(v.videoId)") { openURL(u) } } label: { row(v) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .refreshable { await load(sync: true) }
            .background(Color.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await load(sync: false) }
    }

    private var summary: some View {
        let recent = videos.prefix(10)
        let total = recent.compactMap(\.views).reduce(0, +)
        let ret = recent.compactMap(\.retentionPercentage).filter { $0 > 0 }
        return HStack(spacing: 10) {
            tile("Last 10 videos", Idea.compact(total), "views")
            tile("Your usual", Idea.compact(Int(median)), "views a video")
            tile("Kept watching", ret.isEmpty ? "–" : "\(Int(ret.reduce(0, +) / Double(ret.count)))%", "on average")
        }
    }

    private func tile(_ label: String, _ value: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.geist(11, .medium)).foregroundStyle(Color.textMuted).lineLimit(1)
            Text(value).font(.geist(22, .semibold)).foregroundStyle(Color.text).monospacedDigit()
            Text(sub).font(.geist(11)).foregroundStyle(Color.textFaint).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }

    private func row(_ v: OwnVideo) -> some View {
        let ratio = median > 0 ? Double(v.views ?? 0) / median : 0
        return HStack(spacing: 12) {
            AsyncImage(url: URL(string: v.thumbnailUrl ?? "https://i.ytimg.com/vi/\(v.videoId)/sddefault.jpg")) { img in
                img.resizable().scaledToFill().scaleEffect(1.35)
            } placeholder: { Color.raisedHover }
            .frame(width: 48, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(v.title).font(.geist(14, .medium)).foregroundStyle(Color.text).lineLimit(2)
                HStack(spacing: 6) {
                    Text("\(Idea.compact(v.views ?? 0)) views")
                    if let r = v.retentionPercentage, r > 0 { Text("· \(Int(r))% kept") }
                    if let d = v.published { Text("· \(d.formatted(.relative(presentation: .named)))") }
                }
                .font(.geist(12)).foregroundStyle(Color.textFaint).lineLimit(1)
            }
            Spacer(minLength: 0)
            if ratio > 0 {
                Text(ratio >= 1 ? String(format: "%.1f×", ratio) : String(format: "%.0f%%", ratio * 100))
                    .font(.geist(12, .semibold)).monospacedDigit()
                    .foregroundStyle(ratio >= 1.5 ? Color.bg : Color.text)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(ratio >= 1.5 ? Color.process : Color.white.opacity(0.08)))
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
    }

    private func load(sync: Bool) async {
        defer { loading = false }
        guard let uid = auth.user?.id else { connected = false; return }
        nonisolated struct Tokens: Decodable { let youtube_channel_name: String?; let access_token: String? }
        let t: Tokens? = try? await supabase.from("user_tokens").select("youtube_channel_name, access_token").eq("user_id", value: uid).single().execute().value
        channel = t?.youtube_channel_name
        connected = t?.access_token != nil
        guard connected == true else { return }
        if sync { _ = try? await supabase.functions.invoke("fetch-youtube-data") }
        videos = (try? await supabase.from("videos").select("video_id, title, views, retention_percentage, average_view_duration, thumbnail_url, published_at")
            .eq("user_id", value: uid).order("published_at", ascending: false).limit(30).execute().value) ?? []
    }
}
