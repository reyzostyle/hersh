import SwiftUI
import AuthenticationServices

// The same account as chumoku.co: Apple, Google, or email and password.
struct SignInView: View {
    @Environment(AuthModel.self) private var auth
    @State private var email = ""
    @State private var password = ""
    @State private var creating = false
    @State private var busy = false
    @State private var error: String?
    @State private var confirmSent = false
    @State private var nonce = ""
    @FocusState private var focus: Field?
    enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Image("Mark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 44, height: 44)
                    .padding(.top, 72)

                Text(creating ? "Create your account" : "Sign in to Chumoku")
                    .font(.tTitle)
                    .foregroundStyle(Color.text)
                    .padding(.top, 28)

                // Apple first and the same size as Google (App Store 4.8).
                SignInWithAppleButton(.continue) { request in
                    nonce = AuthModel.newNonce()
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = AuthModel.sha256(nonce)
                } onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else { return }
                        let raw = nonce
                        run { try await auth.signInWithApple(credential, nonce: raw) }
                    case .failure(let err):
                        // Closing Apple's sheet is not an error worth showing.
                        if (err as? ASAuthorizationError)?.code != .canceled { error = err.localizedDescription }
                    }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 48)
                .clipShape(Capsule())
                .disabled(busy)
                .padding(.top, 36)

                Button {
                    run { try await auth.signInWithGoogle() }
                } label: {
                    HStack(spacing: 10) {
                        Image("Google").resizable().frame(width: 18, height: 18)
                        Text("Continue with Google")
                    }
                }
                .buttonStyle(.pillSecondary)
                .disabled(busy)
                .padding(.top, 10)

                HStack(spacing: 12) {
                    Rectangle().fill(Color.line).frame(height: 1)
                    Text("or").font(.tSmall).foregroundStyle(Color.textFaint)
                    Rectangle().fill(Color.line).frame(height: 1)
                }
                .padding(.vertical, 24)

                VStack(spacing: 10) {
                    TextField("", text: $email, prompt: Text("Email").foregroundStyle(Color.textFaint))
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                        .field()
                    SecureField("", text: $password, prompt: Text("Password").foregroundStyle(Color.textFaint))
                        .textContentType(creating ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                        .field()
                }

                if let error {
                    Text(error).font(.tSmall).foregroundStyle(Color.danger).padding(.top, 12)
                }
                if confirmSent {
                    Text("Check your email to confirm, then sign in.")
                        .font(.tSmall).foregroundStyle(Color.textMuted).padding(.top, 12)
                }

                Button(creating ? "Create account" : "Sign in", action: submit)
                    .buttonStyle(.pillSecondary)
                    .disabled(busy || email.isEmpty || password.count < 6)
                    .padding(.top, 16)

                Button {
                    withAnimation(.easeOut(duration: 0.2)) { creating.toggle(); error = nil }
                } label: {
                    Text(creating ? "Have an account? Sign in" : "New here? Create an account")
                        .font(.tSmall)
                        .foregroundStyle(Color.textMuted)
                        .frame(maxWidth: .infinity)
                }
                .padding(.top, 20)
            }
            .padding(.horizontal, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.bg.ignoresSafeArea())
    }

    private func submit() {
        guard !email.isEmpty, password.count >= 6 else { return }
        run {
            if creating {
                try await auth.signUp(email: email, password: password)
                confirmSent = true
            } else {
                try await auth.signIn(email: email, password: password)
            }
        }
    }

    private func run(_ work: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch {
                // Closing the Google sheet is not an error worth showing.
                if (error as NSError).code == 1 && (error as NSError).domain.contains("WebAuthenticationSession") { return }
                self.error = error.localizedDescription
            }
        }
    }
}
