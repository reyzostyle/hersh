import SwiftUI

struct SettingsView: View {
    @Environment(AuthModel.self) private var auth

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Settings").font(.tTitle).foregroundStyle(Color.text).padding(.top, 8)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Account").font(.tLabel).foregroundStyle(Color.textMuted)
                    Text(auth.user?.email ?? "").font(.tBody).foregroundStyle(Color.text)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
                .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
                .padding(.top, 24)

                Button("Sign out") { Task { await auth.signOut() } }
                    .buttonStyle(.pillGhost)
                    .padding(.top, 16)
            }
            .padding(.horizontal, 20)
        }
        .background(Color.bg.ignoresSafeArea())
    }
}
