import SwiftUI

@main
struct ChumokuApp: App {
    @State private var auth = AuthModel()
    @State private var ideas = IdeasStore()
    @State private var films = FilmStore()
    @State private var notes = NotesStore.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(ideas)
                .environment(films)
                .environment(notes)
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
    @Environment(NotesStore.self) private var notes
    enum T: Hashable { case ideas, create, edit, analytics, settings }
    @State private var tab: T = .ideas

    var body: some View {
        TabView(selection: $tab) {
            Tab("Ideas", systemImage: "lightbulb", value: T.ideas) { IdeasView() }
            Tab("Edit", systemImage: "scissors", value: T.edit) { EditHome() }
            Tab("Create", systemImage: "plus", value: T.create) { FilmHome() }
            Tab("Analytics", systemImage: "chart.bar", value: T.analytics) { AnalyticsView() }
            Tab("Settings", systemImage: "gearshape", value: T.settings) { SettingsView() }
        }
        .sensoryFeedback(.selection, trigger: tab)
        // "Record an idea" from Siri or the Lock Screen lands in Notes.
        .onChange(of: notes.recordNow) { _, now in if now { tab = .ideas } }
    }
}
