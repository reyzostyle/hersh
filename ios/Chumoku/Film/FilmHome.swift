import SwiftUI

// The Film tab: start a shoot from a saved idea's script or your own words,
// and come back to earlier shoots and their takes.
struct FilmHome: View {
    @Environment(FilmStore.self) private var films
    @State private var newShoot = false
    @State private var filming: Shoot?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Film").font(.tTitle).foregroundStyle(Color.text).padding(.top, 8)

                    Button("New shoot") { newShoot = true }
                        .buttonStyle(.pill)
                        .padding(.top, 24)

                    if !films.shoots.isEmpty {
                        Text("Shoots").font(.tLabel).foregroundStyle(Color.textMuted).padding(.top, 36).padding(.bottom, 12)
                        VStack(spacing: 10) {
                            ForEach(films.shoots) { shoot in
                                NavigationLink(value: shoot.id) { ShootRow(shoot: shoot) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .background(Color.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in ShootView(shootId: id) }
        }
        .sheet(isPresented: $newShoot) {
            NewShootSheet { shoot in
                newShoot = false
                filming = shoot
            }
        }
        .fullScreenCover(item: $filming) { shoot in FilmView(shootId: shoot.id) }
    }
}

struct ShootRow: View {
    let shoot: Shoot
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(shoot.title).font(.geist(15, .medium)).foregroundStyle(Color.text).lineLimit(2)
                Text("\(shoot.takes.count) \(shoot.takes.count == 1 ? "take" : "takes") · \(shoot.createdAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.textFaint)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .contentShape(Rectangle())
    }
}

// One shoot: its script, its takes, and the way back into the camera.
struct ShootView: View {
    @Environment(FilmStore.self) private var films
    @Environment(\.dismiss) private var dismiss
    let shootId: String
    @State private var filming = false
    @State private var editingScript = false

    var body: some View {
        if let shoot = films.shoot(shootId) {
            TakesList(shootId: shootId)
                .navigationTitle(shoot.title)
                .safeAreaInset(edge: .bottom) {
                    HStack(spacing: 10) {
                        Button("Film") { filming = true }
                            .buttonStyle(PillButtonStyle(kind: shoot.takes.isEmpty ? .primary : .secondary))
                        if !shoot.takes.isEmpty {
                            NavigationLink("Edit") { EditorView(shootId: shootId) }
                                .buttonStyle(.pill)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Color.bg.ignoresSafeArea())
                }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("Edit script", systemImage: "pencil") { editingScript = true }
                            Button("Delete shoot", systemImage: "trash", role: .destructive) {
                                films.deleteShoot(shoot)
                                dismiss()
                            }
                        } label: { Image(systemName: "ellipsis") }
                    }
                }
                .fullScreenCover(isPresented: $filming) { FilmView(shootId: shootId) }
                .sheet(isPresented: $editingScript) {
                    ScriptEditor(text: shoot.script) { newText in
                        films.update(shootId) { $0.script = newText }
                        editingScript = false
                    }
                }
        }
    }
}

struct ScriptEditor: View {
    @State var text: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .font(.geist(17))
                .scrollContentBackground(.hidden)
                .padding(16)
                .background(Color.bg.ignoresSafeArea())
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { onSave(text) } }
                }
                .navigationTitle("Script")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// Pick a script: a saved idea's outline, or type your own.
struct NewShootSheet: View {
    @Environment(FilmStore.self) private var films
    @Environment(IdeasStore.self) private var ideas
    @Environment(\.dismiss) private var dismiss
    let onStart: (Shoot) -> Void
    @State private var own = ""

    private var withScripts: [Idea] { ideas.saved.filter { $0.outline != nil } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TextEditor(text: $own)
                        .font(.geist(16))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 140)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
                        .overlay(alignment: .topLeading) {
                            if own.isEmpty {
                                Text("Write or paste your script").font(.geist(16)).foregroundStyle(Color.textFaint).padding(.horizontal, 17).padding(.vertical, 20).allowsHitTesting(false)
                            }
                        }
                        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))

                    Button("Film this script") {
                        let title = own.split(separator: "\n").first.map(String.init) ?? "Shoot"
                        onStart(films.create(title: String(title.prefix(60)), script: own))
                    }
                    .buttonStyle(.pill)
                    .disabled(own.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .padding(.top, 12)

                    Button("Film without a script") {
                        onStart(films.create(title: "Shoot \(Date.now.formatted(date: .abbreviated, time: .shortened))", script: ""))
                    }
                    .buttonStyle(.pillGhost)
                    .padding(.top, 10)

                    if !withScripts.isEmpty {
                        Text("From saved").font(.tLabel).foregroundStyle(Color.textMuted).padding(.top, 32).padding(.bottom, 12)
                        VStack(spacing: 10) {
                            ForEach(withScripts) { idea in
                                Button {
                                    onStart(films.create(title: idea.outline?.hook ?? idea.headline, script: idea.outline?.script ?? "", ideaId: idea.id))
                                } label: {
                                    HStack(spacing: 12) {
                                        Thumb(url: idea.thumbnailURL, radius: 8).frame(width: 40, height: 52)
                                        Text(idea.outline?.hook ?? idea.headline).font(.geist(14, .medium)).foregroundStyle(Color.text).lineLimit(2).multilineTextAlignment(.leading)
                                        Spacer()
                                    }
                                    .padding(10)
                                    .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(Color.bg.ignoresSafeArea())
            .navigationTitle("New shoot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .task { await ideas.loadSaved() }
    }
}
