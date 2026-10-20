import SwiftUI
import AVKit

// Every take of a shoot, newest first: play, keep, throw away.
struct TakesList: View {
    @Environment(FilmStore.self) private var films
    let shootId: String
    @State private var playing: Take?
    @State private var savedNote: String?

    private var shoot: Shoot? { films.shoot(shootId) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let shoot {
                    ForEach(shoot.takes.reversed()) { take in
                        TakeRow(take: take, url: films.url(take, in: shoot), number: (shoot.takes.firstIndex(of: take) ?? 0) + 1)
                            .onTapGesture { playing = take }
                            .contextMenu {
                                Button("Save to Photos", systemImage: "square.and.arrow.down") {
                                    Task {
                                        let ok = await FilmStore.saveToPhotos(films.url(take, in: shoot))
                                        savedNote = ok ? "Saved to Photos" : "Allow Photos access in Settings"
                                    }
                                }
                                Button("Delete", systemImage: "trash", role: .destructive) { films.deleteTake(take, from: shootId) }
                            }
                    }
                    if shoot.takes.isEmpty {
                        Empty(text: "No takes yet.")
                    }
                }
                if let savedNote {
                    Text(savedNote).font(.tSmall).foregroundStyle(Color.textMuted).frame(maxWidth: .infinity)
                }
            }
            .padding(20)
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Takes")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $playing) { take in
            if let shoot {
                TakePlayer(url: films.url(take, in: shoot))
            }
        }
    }
}

struct TakeRow: View {
    let take: Take
    let url: URL
    let number: Int
    @State private var thumb: UIImage?

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Color.raisedHover
                if let thumb { Image(uiImage: thumb).resizable().scaledToFill() }
            }
            .frame(width: 44, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text("Take \(number)").font(.geist(15, .medium)).foregroundStyle(Color.text)
                Text("\(String(format: "%d:%02d", Int(take.duration) / 60, Int(take.duration) % 60)) · \(take.createdAt.formatted(date: .omitted, time: .shortened))")
                    .font(.tSmall).foregroundStyle(Color.textFaint)
            }
            Spacer()
            Image(systemName: "play.fill").font(.system(size: 13)).foregroundStyle(Color.textMuted)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).fill(Color.raised))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
        .contentShape(Rectangle())
        .task { thumb = await FilmStore.thumbnail(for: url) }
    }
}

struct TakePlayer: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            if let player { VideoPlayer(player: player).ignoresSafeArea() }
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 40, height: 40).background(Circle().fill(.black.opacity(0.5)))
            }
            .padding(16)
        }
        .onAppear { let p = AVPlayer(url: url); player = p; p.play() }
        .onDisappear { player?.pause() }
    }
}
