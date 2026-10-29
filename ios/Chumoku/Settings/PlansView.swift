import SwiftUI
import StoreKit
import Supabase

// The plans, bought through Apple. Same two plans and the same top-up as the
// web's Upgrade page; prices come from the App Store in the buyer's currency.
struct PlansView: View {
    @Environment(AuthModel.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    private var store: Purchases { Purchases.shared }

    @State private var yearly = true
    @State private var plan: String?
    @State private var applePlan: String?
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Seg(options: [(true, String(localized: "Yearly")), (false, String(localized: "Monthly"))], value: $yearly)
                        .frame(maxWidth: .infinity)

                    card(name: "Plus", id: yearly ? Purchases.plusYearly : Purchases.plusMonthly, dbPlan: "pro", lines: [
                        String(localized: "About 30 scripts a month"),
                        String(localized: "100 credits: 3 a script, 1 a message"),
                        String(localized: "A chat that knows your channel"),
                        String(localized: "Track up to 5 channels"),
                    ])
                    card(name: "Pro", id: yearly ? Purchases.proYearly : Purchases.proMonthly, dbPlan: "agency", lines: [
                        String(localized: "About 100 scripts a month"),
                        String(localized: "300 credits"),
                        String(localized: "Everything in Plus"),
                    ])

                    if let plan, plan != "free", let topup = store.products[Purchases.credits50] {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("50 credits").font(.geist(16, .medium)).foregroundStyle(Color.text)
                                Text("On top of your plan. They don't expire.").font(.tSmall).foregroundStyle(Color.textMuted)
                            }
                            Spacer()
                            buyButton(id: Purchases.credits50, label: topup.displayPrice, primary: false)
                        }
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
                        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
                    }

                    if store.loadFailed && store.products.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Couldn't reach the App Store.").font(.tSmall).foregroundStyle(Color.textMuted)
                            Button("Try again") { Task { await store.load() } }
                                .font(.geist(14, .medium)).foregroundStyle(Color.text).buttonStyle(.plain)
                        }
                    }

                    if let m = store.message {
                        Text(m).font(.tSmall).foregroundStyle(Color.textMuted)
                    }

                    Button { Task { await store.restore(); await loadPlan() } } label: {
                        HStack(spacing: 8) {
                            if store.restoring { ProgressView().controlSize(.small) }
                            Text("Restore purchases")
                        }
                        .font(.geist(14, .medium)).foregroundStyle(Color.text)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                    .disabled(store.restoring)

                    // What the App Store requires next to any subscription.
                    Text("Plans renew automatically at the price shown until you cancel. Cancel any time in your Apple ID's subscription settings, at least 24 hours before the period ends. Payment is charged to your Apple ID.")
                        .font(.geist(12)).foregroundStyle(Color.textFaint)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 16) {
                        Button("Terms of Use") { open("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/") }
                        Button("Terms") { open("https://chumoku.co/terms") }
                        Button("Privacy") { open("https://chumoku.co/privacy") }
                    }
                    .font(.geist(12, .medium)).foregroundStyle(Color.textMuted).buttonStyle(.plain)
                }
                .padding(20)
            }
            .background(Color.bg.ignoresSafeArea())
            .navigationTitle("Plans")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
        .task {
            if store.products.isEmpty { await store.load() }
            await loadPlan()
        }
        .onChange(of: store.changed) { Task { await loadPlan() } }
    }

    // A plan bought on the web renews there; buying the same thing again
    // through Apple would bill twice.
    private var billedElsewhere: Bool { loaded && (plan ?? "free") != "free" && applePlan == nil }

    @ViewBuilder
    private func card(name: String, id: String, dbPlan: String, lines: [String]) -> some View {
        let product = store.products[id]
        let current = plan == dbPlan
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(name).font(.tHeading).foregroundStyle(Color.text)
                Spacer()
                if let product {
                    Text(yearly ? "\(product.displayPrice) / year" : "\(product.displayPrice) / month")
                        .font(.tBody).foregroundStyle(Color.textMuted).monospacedDigit()
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(lines, id: \.self) { line in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.textMuted).padding(.top, 3)
                        Text(line).font(.tSmall).foregroundStyle(Color.text)
                    }
                }
            }
            if current {
                Text(applePlan == id || applePlan == nil ? "Your plan" : "Your plan, billed \(yearly ? String(localized: "monthly") : String(localized: "yearly"))")
                    .font(.geist(14, .medium)).foregroundStyle(Color.textMuted)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background(Capsule().strokeBorder(Color.lineStrong, lineWidth: 1))
                if applePlan != nil && applePlan != id && !billedElsewhere {
                    buyButton(id: id, label: yearly ? String(localized: "Switch to yearly") : String(localized: "Switch to monthly"), primary: false)
                }
            } else if billedElsewhere {
                EmptyView()
            } else {
                buyButton(id: id, label: String(localized: "Get \(name)"), primary: dbPlan == "pro" || plan == "pro")
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(current ? Color.lineStrong : Color.line, lineWidth: 1))
    }

    private func buyButton(id: String, label: String, primary: Bool) -> some View {
        Button {
            guard let uid = auth.user?.id else { return }
            Task { await store.buy(id, for: uid) }
        } label: {
            HStack(spacing: 8) {
                if store.buying == id { ProgressView().controlSize(.small).tint(primary ? Color.bg : Color.text) }
                Text(label)
            }
        }
        .buttonStyle(primary ? .pill : .pillSecondary)
        .frame(maxWidth: id == Purchases.credits50 ? 120 : .infinity)
        .disabled(store.buying != nil || store.products[id] == nil)
    }

    private func open(_ s: String) { if let u = URL(string: s) { openURL(u) } }

    private func loadPlan() async {
        nonisolated struct Row: Decodable { let plan: String?; let apple_product_id: String?; let apple_expires_at: String? }
        defer { loaded = true }
        guard let uid = auth.user?.id else { return }
        let row: Row? = try? await supabase.from("user_tokens").select("plan, apple_product_id, apple_expires_at")
            .eq("user_id", value: uid).single().execute().value
        plan = row?.plan ?? "free"
        let live = row?.apple_expires_at.flatMap(ISO8601DateFormatter.flexible).map { $0 > .now } ?? false
        applePlan = live ? row?.apple_product_id : nil
        if let a = applePlan { yearly = a.hasSuffix("yearly") }
    }
}
