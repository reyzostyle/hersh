import UIKit
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

// A fresh Sign in with Apple authorization code, asked for right before the
// account is deleted so delete-account can revoke the Apple grant (App Store
// 5.1.1(v)). Nil when they close Apple's sheet; the deletion goes ahead.
final class AppleAuthorizationCode: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<String?, Never>?
    private var controller: ASAuthorizationController?

    static func request() async -> String? { await AppleAuthorizationCode().run() }

    private func run() async -> String? {
        await withCheckedContinuation { c in
            continuation = c
            let controller = ASAuthorizationController(authorizationRequests: [ASAuthorizationAppleIDProvider().createRequest()])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let code = (authorization.credential as? ASAuthorizationAppleIDCredential)?.authorizationCode
        continuation?.resume(returning: code.flatMap { String(data: $0, encoding: .utf8) })
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(returning: nil)
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.keyWindow ?? ASPresentationAnchor()
    }
}

// Sign in with Apple from our own button: the system one only comes white or
// black, and next to Google it should look the same (Ivan, 2026-10-30).
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?
    private var controller: ASAuthorizationController?

    // `hashedNonce` is what Apple puts in the token; the raw one goes to Supabase.
    static func credential(hashedNonce: String) async throws -> ASAuthorizationAppleIDCredential {
        try await AppleSignIn().run(hashedNonce)
    }

    private func run(_ hashedNonce: String) async throws -> ASAuthorizationAppleIDCredential {
        try await withCheckedThrowingContinuation { c in
            continuation = c
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = hashedNonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            continuation?.resume(returning: credential)
        } else {
            continuation?.resume(throwing: ASAuthorizationError(.unknown))
        }
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.keyWindow ?? ASPresentationAnchor()
    }
}
