import SwiftUI
import AuthenticationServices
import Supabase

// The YouTube account, as on chumoku.co: connect (or reconnect) through
// Google in a browser sheet, the channel's four numbers, and disconnect.
// youtube-oauth-callback sends the sheet back to chumoku://youtube when the
// state carries ":ios".
nonisolated struct ChannelStats: Decodable {
    let connected: Bool
    let subscribers: Int?
    let totalViews: Int?
    let views28: Int?
    let subsGained28: Int?
    let watchMinutes28: Int?
}

struct YouTubeSection: View {
    let connected: Bool
    let channelName: String?
    let channelThumbnail: String?
    let syncedAt: String?
    let loading: Bool
    let onChange: () async -> Void

    @Environment(AuthModel.self) private var auth
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var stats: ChannelStats?
    @State private var connecting = false
    @State private var confirmDisconnect = false
    @State private var disconnecting = false
    @State private var error: String?

    // The web client's id; public, it is in every OAuth URL.
    fileprivate static let clientId = "558477063142-a7fscn1mppr73br9thnhi325qtb45vdj.apps.googleusercontent.com"

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                AsyncImage(url: channelThumbnail.flatMap(URL.init(string:))) { img in
                    img.resizable().scaledToFill()
                } placeholder: { Color.white.opacity(0.08) }
                .frame(width: 36, height: 36)
                .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(connected ? (channelName ?? String(localized: "Connected")) : (loading ? "…" : String(localized: "No account connected")))
                            .font(.tBody).foregroundStyle(Color.text).lineLimit(1)
                        if connected { Circle().fill(Color.process).frame(width: 6, height: 6) }
                    }
                    Text(subtitle).font(.tSmall).foregroundStyle(Color.textFaint)
                }
                Spacer()
                if !loading {
                    Button { Task { await connect() } } label: {
                        if connecting { ProgressView().controlSize(.small) }
                        else { Text(connected ? "Reconnect" : "Connect") }
                    }
                    .font(.geist(14, .medium))
                    .foregroundStyle(connected ? Color.text : Color.bg)
                    .padding(.horizontal, 14).frame(height: 34)
                    .background(Capsule().fill(connected ? Color.white.opacity(0.08) : Color.white))
                    .buttonStyle(.plain)
                    .disabled(connecting)
                }
            }
            .padding(16)

            if let error {
                Text(error).font(.tSmall).foregroundStyle(Color.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.bottom, 12)
            }

            if connected {
                if let stats, stats.connected {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        tile(String(localized: "Subscribers"), Idea.compact(stats.subscribers ?? 0),
                             sub: (stats.subsGained28 ?? 0) > 0 ? String(localized: "+\(Idea.compact(stats.subsGained28!)) in 28d") : nil)
                        tile(String(localized: "Views 28d"), Idea.compact(stats.views28 ?? 0))
                        tile(String(localized: "Watch time 28d"), "\(Idea.compact((stats.watchMinutes28 ?? 0) / 60))h")
                        tile(String(localized: "Total views"), Idea.compact(stats.totalViews ?? 0))
                    }
                    .padding(.horizontal, 16).padding(.bottom, 16)
                } else if stats == nil {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        ForEach(0..<4, id: \.self) { _ in Skeleton(cornerRadius: Radius.sm).frame(height: 76) }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 16)
                }

                Rectangle().fill(Color.line).frame(height: 1).padding(.leading, 16)
                Button { confirmDisconnect = true } label: {
                    HStack(spacing: 8) {
                        if disconnecting { ProgressView().controlSize(.small) }
                        Text(disconnecting ? "Disconnecting" : "Disconnect account")
                    }
                    .font(.tBody).foregroundStyle(Color.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(16).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(disconnecting)
            }
        }
        .task(id: connected) { if connected { await loadStats() } }
        .confirmationDialog("Disconnect this YouTube account?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Yes, disconnect", role: .destructive) { Task { await disconnect() } }
            Button("Keep", role: .cancel) {}
        }
    }

    private var subtitle: String {
        if connected, let syncedAt, let d = ISO8601DateFormatter.flexible(syncedAt) {
            return String(localized: "Last synced \(d.formatted(.dateTime.month(.abbreviated).day().year()))")
        }
        return String(localized: "YouTube")
    }

    private func tile(_ label: String, _ value: String, sub: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.tLabel).foregroundStyle(Color.textMuted)
            Text(value).font(.geist(22, .medium)).foregroundStyle(Color.text).monospacedDigit()
            if let sub { Text(sub).font(.geist(12)).foregroundStyle(Color.textFaint) }
        }
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Color.white.opacity(0.04)))
    }

    private func loadStats() async {
        stats = try? await supabase.functions.invoke("channel-stats", options: FunctionInvokeOptions(method: .get))
    }

    private func connect() async {
        guard let uid = auth.user?.id else { return }
        connecting = true
        error = nil
        defer { connecting = false }
        switch await YouTubeConnect.run(webAuth, user: uid) {
        case .connected:
            stats = nil
            await onChange()
        case .failed: error = String(localized: "Could not connect that account. Try again.")
        case .cancelled: break
        }
    }

    private func disconnect() async {
        guard let uid = auth.user?.id else { return }
        nonisolated struct Patch: Encodable {
            let access_token = ""
            let refresh_token = ""
            let youtube_channel_name: String? = nil
            let youtube_channel_thumbnail: String? = nil
            let updated_at: String

            // Nil has to be sent as null, not left out, or the name stays.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(access_token, forKey: .access_token)
                try c.encode(refresh_token, forKey: .refresh_token)
                try c.encodeNil(forKey: .youtube_channel_name)
                try c.encodeNil(forKey: .youtube_channel_thumbnail)
                try c.encode(updated_at, forKey: .updated_at)
            }
            enum CodingKeys: CodingKey { case access_token, refresh_token, youtube_channel_name, youtube_channel_thumbnail, updated_at }
        }
        disconnecting = true
        defer { disconnecting = false }
        do {
            try await supabase.from("user_tokens")
                .update(Patch(updated_at: ISO8601DateFormatter().string(from: .now)))
                .eq("user_id", value: uid).execute()
            stats = nil
            await onChange()
        } catch {
            self.error = String(localized: "Could not disconnect. Try again.")
        }
    }
}

// Google's consent screen in a browser sheet, back through
// youtube-oauth-callback to chumoku://youtube. Settings and onboarding both
// connect this way.
enum YouTubeConnect {
    enum Outcome { case connected, failed, cancelled }

    static func run(_ webAuth: WebAuthenticationSession, user: UUID) async -> Outcome {
        var c = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        c.queryItems = [
            .init(name: "client_id", value: YouTubeSection.clientId),
            .init(name: "redirect_uri", value: Config.supabaseURL.appending(path: "functions/v1/youtube-oauth-callback").absoluteString),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly"),
            .init(name: "access_type", value: "offline"),
            .init(name: "prompt", value: "consent"),
            .init(name: "state", value: "\(user.uuidString.lowercased()):ios"),
        ]
        do {
            let back = try await webAuth.authenticate(using: c.url!, callback: .customScheme("chumoku"), additionalHeaderFields: [:])
            let q = URLComponents(url: back, resolvingAgainstBaseURL: false)?.queryItems ?? []
            return q.contains(where: { $0.name == "youtube_connected" }) ? .connected : .failed
        } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            return .cancelled
        } catch {
            return .failed
        }
    }
}
