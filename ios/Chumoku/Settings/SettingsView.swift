import SwiftUI
import Supabase

// The account as the web app keeps it (user_tokens), read-only here except
// for the phone's own filming preferences. Anything that costs money or needs
// an OAuth dance (upgrading, connecting YouTube, editing the brain) is one
// tap away on chumoku.co.
nonisolated struct Brain: Decodable, Hashable {
    let summary: String?
    let niche: String?
    let format: String?
    let audience: String?
    let voice: String?
}

nonisolated struct Account: Decodable {
    let plan: String?
    let creditsUsed: Int?
    let bonusCredits: Int?
    let youtubeChannelName: String?
    let youtubeChannelThumbnail: String?
    let brain: Brain?

    enum CodingKeys: String, CodingKey {
        case plan, brain
        case creditsUsed = "credits_used"
        case bonusCredits = "bonus_credits"
        case youtubeChannelName = "youtube_channel_name"
        case youtubeChannelThumbnail = "youtube_channel_thumbnail"
    }

    // Mirrors src/lib/useUsage.ts.
    static let limits = ["free": 20, "pro": 300, "agency": 1000]
    static let names = ["free": "Trial", "pro": "Plus", "agency": "Pro"]

    var planName: String { Self.names[plan ?? "free"] ?? "Trial" }
    var creditLimit: Int { (Self.limits[plan ?? "free"] ?? 20) + (bonusCredits ?? 0) }
    var creditsLeft: Int { max(0, creditLimit - (creditsUsed ?? 0)) }
}

struct SettingsView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(FilmStore.self) private var films
    @Environment(\.openURL) private var openURL
    @State private var account: Account?
    @State private var loading = true
    @State private var storage: String = "…"
    @State private var brainOpen = false
    @State private var confirmClear = false
    @AppStorage("film.countdown") private var countdown = true
    @AppStorage("film.mirror") private var mirror = true
    @AppStorage("film.4k") private var fourK = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Settings").font(.tTitle).foregroundStyle(Color.text).padding(.top, 8)

                    section("Account") {
                        row("Email", auth.user?.email ?? "")
                        divider
                        row("Plan", account?.planName ?? (loading ? "…" : "Trial"))
                        divider
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("Credits").font(.tBody).foregroundStyle(Color.text)
                                Spacer()
                                Text(account.map { "\($0.creditsLeft) of \($0.creditLimit) left" } ?? (loading ? "…" : "—"))
                                    .font(.tBody).foregroundStyle(Color.textMuted).monospacedDigit()
                            }
                            if let a = account {
                                GeometryReader { g in
                                    Capsule().fill(Color.white.opacity(0.08))
                                        .overlay(alignment: .leading) {
                                            Capsule().fill(Color.white)
                                                .frame(width: g.size.width * CGFloat(a.creditsLeft) / CGFloat(max(1, a.creditLimit)))
                                        }
                                }
                                .frame(height: 4)
                            }
                        }
                        .padding(16)
                        divider
                        linkRow("Upgrade or top up", url: "https://chumoku.co")
                    }

                    section("Channel") {
                        HStack(spacing: 12) {
                            AsyncImage(url: account?.youtubeChannelThumbnail.flatMap(URL.init(string:))) { img in
                                img.resizable().scaledToFill()
                            } placeholder: { Color.white.opacity(0.08) }
                            .frame(width: 36, height: 36)
                            .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(account?.youtubeChannelName ?? (loading ? "…" : "Not connected"))
                                    .font(.tBody).foregroundStyle(Color.text)
                                Text("YouTube").font(.tSmall).foregroundStyle(Color.textFaint)
                            }
                            Spacer()
                            if account?.youtubeChannelName != nil {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundStyle(Color.process)
                            }
                        }
                        .padding(16)
                        if account?.youtubeChannelName == nil && !loading {
                            divider
                            linkRow("Connect on chumoku.co", url: "https://chumoku.co")
                        }
                    }

                    if let brain = account?.brain {
                        section("What Chumoku knows about you") {
                            Button { withAnimation(.ui) { brainOpen.toggle() } } label: {
                                HStack(alignment: .top) {
                                    Text(brain.summary ?? brain.niche ?? "Your channel")
                                        .font(.tBody).foregroundStyle(Color.text)
                                        .lineLimit(brainOpen ? nil : 2)
                                        .multilineTextAlignment(.leading)
                                    Spacer()
                                    Image(systemName: "chevron.down")
                                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.textFaint)
                                        .rotationEffect(.degrees(brainOpen ? 180 : 0))
                                        .padding(.top, 4)
                                }
                                .padding(16)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .sensoryFeedback(.selection, trigger: brainOpen)
                            if brainOpen {
                                ForEach([("Niche", brain.niche), ("Format", brain.format), ("Audience", brain.audience), ("Voice", brain.voice)], id: \.0) { item in
                                    if let value = item.1, !value.isEmpty {
                                        divider
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(item.0).font(.tLabel).foregroundStyle(Color.textMuted)
                                            Text(value).font(.tSmall).foregroundStyle(Color.text)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(16)
                                    }
                                }
                                divider
                                linkRow("Edit on chumoku.co", url: "https://chumoku.co")
                            }
                        }
                    }

                    section("Filming") {
                        toggle("Countdown before recording", $countdown)
                        divider
                        toggle("Mirror the front camera", $mirror)
                        divider
                        toggle("Record in 4K", $fourK)
                        divider
                        row("Takes on this iPhone", storage)
                        divider
                        Button { confirmClear = true } label: {
                            Text("Delete all takes").font(.tBody).foregroundStyle(Color.danger)
                                .frame(maxWidth: .infinity, alignment: .leading).padding(16).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }

                    Button { if let u = URL(string: "https://discord.com/invite/N8S6C95Ry2") { openURL(u) } } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .font(.system(size: 20)).foregroundStyle(.white)
                                .frame(width: 46, height: 46)
                                .background(Circle().fill(Color(red: 0.35, green: 0.4, blue: 0.95)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Join the Discord").font(.geist(16, .medium)).foregroundStyle(Color.text)
                                Text("Creators, feedback, early features").font(.tSmall).foregroundStyle(Color.textMuted)
                            }
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.textFaint)
                        }
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color(red: 0.35, green: 0.4, blue: 0.95).opacity(0.12)))
                        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color(red: 0.35, green: 0.4, blue: 0.95).opacity(0.35), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 28)

                    section("Chumoku") {
                        linkRow("Privacy", url: "https://chumoku.co/privacy")
                        divider
                        linkRow("Terms", url: "https://chumoku.co/terms")
                    }

                    Button("Sign out") { Task { await auth.signOut() } }
                        .buttonStyle(.pillGhost)
                        .padding(.top, 28)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .background(Color.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await load() }
            .confirmationDialog("Delete every take on this iPhone?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Delete all takes", role: .destructive) { films.deleteAll(); storage = films.diskUsage() }
            } message: { Text("Finished videos already in Photos stay.") }
            .sensoryFeedback(.warning, trigger: confirmClear) { _, on in on }
        }
        .task { await load() }
    }

    private func load() async {
        storage = films.diskUsage()
        defer { loading = false }
        guard let uid = auth.user?.id else { return }
        account = try? await supabase.from("user_tokens")
            .select("plan, credits_used, bonus_credits, youtube_channel_name, youtube_channel_thumbnail, brain")
            .eq("user_id", value: uid)
            .single()
            .execute()
            .value
    }

    // MARK: pieces

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.tLabel).foregroundStyle(Color.textMuted).padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
                .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        }
        .padding(.top, 28)
    }

    private var divider: some View { Rectangle().fill(Color.line).frame(height: 1).padding(.leading, 16) }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(.tBody).foregroundStyle(Color.text)
            Spacer()
            Text(value).font(.tBody).foregroundStyle(Color.textMuted).lineLimit(1)
        }
        .padding(16)
    }

    private func toggle(_ label: String, _ value: Binding<Bool>) -> some View {
        Toggle(isOn: value) { Text(label).font(.tBody).foregroundStyle(Color.text) }
            .tint(Color.process)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .sensoryFeedback(.selection, trigger: value.wrappedValue)
    }

    private func linkRow(_ label: String, url: String) -> some View {
        Button { if let u = URL(string: url) { openURL(u) } } label: {
            HStack {
                Text(label).font(.tBody).foregroundStyle(Color.text)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.textFaint)
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
