import SwiftUI

@main
struct ChumokuApp: App {
    @State private var auth = AuthModel()
    @State private var ideas = IdeasStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(ideas)
                .preferredColorScheme(.dark)
                .tint(.white)
        }
    }
}

struct RootView: View {
    @Environment(AuthModel.self) private var auth

    var body: some View {
        Group {
            #if DEBUG
            if IdeasStore.isDemo { MainTabs() } else { content }
            #else
            content
            #endif
        }
        .animation(.easeOut(duration: 0.2), value: auth.user?.id)
    }

    @ViewBuilder private var content: some View {
        Group {
            switch auth.state {
            case .loading: Color.bg.ignoresSafeArea()
            case .signedOut: SignInView()
            case .signedIn(let user): MainTabs().id(user.id)
            }
        }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            Tab("Ideas", systemImage: "lightbulb") { IdeasView() }
            Tab("Settings", systemImage: "gearshape") { SettingsView() }
        }
    }
}
