import Foundation
import Supabase

// One client for the app, the same project the web app and extension use, so
// an idea saved anywhere shows up everywhere.
let supabase = SupabaseClient(
    supabaseURL: Config.supabaseURL,
    supabaseKey: Config.supabaseAnonKey,
    options: SupabaseClientOptions(
        auth: .init(redirectToURL: Config.authCallback, flowType: .pkce, emitLocalSessionAsInitialSession: true)
    )
)

@Observable
final class AuthModel {
    enum State { case loading, signedOut, signedIn(User) }
    var state: State = .loading

    var user: User? {
        if case .signedIn(let u) = state { return u }
        return nil
    }

    init() {
        Task { [weak self] in
            for await (_, session) in supabase.auth.authStateChanges {
                // A stored session may have an expired access token; the
                // client refreshes it on first use, and signs out (emitting
                // nil here) only when the refresh itself fails.
                if let session {
                    self?.state = .signedIn(session.user)
                } else {
                    self?.state = .signedOut
                }
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
    }

    func signUp(email: String, password: String) async throws {
        try await supabase.auth.signUp(email: email, password: password, redirectTo: URL(string: "https://chumoku.co/auth/callback"))
    }

    func signInWithGoogle() async throws {
        try await supabase.auth.signInWithOAuth(provider: .google, redirectTo: Config.authCallback) { session in
            session.prefersEphemeralWebBrowserSession = false
        }
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }
}
