import SwiftUI

// The Edit tab: every shoot that has takes, newest first, one tap from its edit.
struct EditHome: View {
    @Environment(FilmStore.self) private var films

    private var withTakes: [Shoot] { films.shoots.filter { !$0.takes.isEmpty } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Edit").font(.tTitle).foregroundStyle(Color.text).padding(.top, 8)
                    if withTakes.isEmpty {
                        Empty(text: "Film a few takes and they show up here to cut.")
                            .padding(.top, 24)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(withTakes) { shoot in
                                NavigationLink(value: shoot.id) { ShootRow(shoot: shoot) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.top, 24)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .background(Color.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in EditorView(shootId: id) }
        }
    }
}
