import Foundation
import Supabase
import AuthenticationServices
import CryptoKit

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

    // Sign in with Apple, natively: Apple hands the app an identity token and
    // Supabase checks it (provider 'apple', client id = the bundle id). The
    // nonce Apple saw is the hash of the one sent here, so a stolen token
    // cannot be replayed. Required by the App Store next to Google (4.8).
    func signInWithApple(_ credential: ASAuthorizationAppleIDCredential, nonce: String) async throws {
        guard let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8) else {
            throw URLError(.userAuthenticationRequired)
        }
        try await supabase.auth.signInWithIdToken(credentials: .init(provider: .apple, idToken: idToken, nonce: nonce))
        // Apple gives the name only the first time, so keep it when it comes.
        let name = [credential.fullName?.givenName, credential.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
        if !name.isEmpty {
            _ = try? await supabase.auth.update(user: UserAttributes(data: ["full_name": .string(name)]))
        }
    }

    static func newNonce() -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String((0..<32).map { _ in chars.randomElement()! })
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }
}
