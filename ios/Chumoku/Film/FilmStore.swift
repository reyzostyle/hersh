import Foundation
import AVFoundation
import Photos
import UIKit

// A shoot: one script and the takes recorded against it. Stored on the phone
// (Documents/Shoots/<id>/), because raw takes are large and the edit happens
// here too; only the finished video ever needs to leave the device.
nonisolated struct Take: Codable, Identifiable, Hashable {
    let id: String
    let file: String // name inside the shoot's folder
    let duration: Double
    let createdAt: Date
}

nonisolated struct Shoot: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var script: String
    var ideaId: String?
    var takes: [Take]
    let createdAt: Date
}

@Observable
final class FilmStore {
    private(set) var shoots: [Shoot] = []

    private static var root: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Shoots", isDirectory: true)
    }
    private static var index: URL { root.appendingPathComponent("shoots.json") }

    init() {
        try? FileManager.default.createDirectory(at: Self.root, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: Self.index), let list = try? JSONDecoder().decode([Shoot].self, from: data) {
            shoots = list
        }
        Task { await recoverOrphans() }
    }

    // Takes whose recording was interrupted before they were listed are still
    // on disk: list them, so nothing filmed is ever lost.
    private func recoverOrphans() async {
        for shoot in shoots {
            let listed = Set(shoot.takes.map(\.file))
            let files = (try? FileManager.default.contentsOfDirectory(atPath: folder(shoot).path)) ?? []
            for f in files.sorted() where f.hasPrefix("take-") && (f.hasSuffix(".mov") || f.hasSuffix(".mp4")) && !listed.contains(f) {
                await addTake(folder(shoot).appendingPathComponent(f), to: shoot.id)
            }
        }
    }

    // A shoot started without a script is named after what was said in it.
    func nameFromSpeech(_ id: String, words: [String]) {
        guard let s = shoot(id), s.script.isEmpty, s.title.hasPrefix("Shoot ") || s.title.hasPrefix("Imported "), words.count >= 3 else { return }
        let title = words.prefix(7).joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: ",. "))
        update(id) { $0.title = title + (words.count > 7 ? "…" : "") }
    }

    func folder(_ shoot: Shoot) -> URL { Self.root.appendingPathComponent(shoot.id, isDirectory: true) }
    func url(_ take: Take, in shoot: Shoot) -> URL { folder(shoot).appendingPathComponent(take.file) }
    func shoot(_ id: String) -> Shoot? { shoots.first { $0.id == id } }

    func create(title: String, script: String, ideaId: String? = nil) -> Shoot {
        // One shoot per idea: filming it again adds takes to the same one.
        if let ideaId, let existing = shoots.first(where: { $0.ideaId == ideaId }) {
            update(existing.id) { $0.script = script }
            return shoot(existing.id)!
        }
        let s = Shoot(id: UUID().uuidString, title: title, script: script, ideaId: ideaId, takes: [], createdAt: .now)
        try? FileManager.default.createDirectory(at: folder(s), withIntermediateDirectories: true)
        shoots.insert(s, at: 0)
        save()
        return s
    }

    func nextTakeURL(for shootId: String) -> URL {
        let s = shoot(shootId)!
        return folder(s).appendingPathComponent("take-\(Int(Date().timeIntervalSince1970 * 1000)).mov")
    }

    @discardableResult
    func addTake(_ url: URL, to shootId: String) async -> Bool {
        let duration = (try? await AVURLAsset(url: url).load(.duration).seconds) ?? 0
        guard duration > 0.3 else { try? FileManager.default.removeItem(at: url); return false }
        guard shoot(shootId)?.takes.contains(where: { $0.file == url.lastPathComponent }) == false else { return false }
        update(shootId) { $0.takes.append(Take(id: UUID().uuidString, file: url.lastPathComponent, duration: duration, createdAt: .now)) }
        return true
    }

    // A video from Photos becomes a take: moved into the shoot's folder.
    func importTake(_ file: URL, to shootId: String) async {
        let dest = nextTakeURL(for: shootId).deletingPathExtension().appendingPathExtension(file.pathExtension.isEmpty ? "mov" : file.pathExtension)
        do { try FileManager.default.moveItem(at: file, to: dest) } catch { return }
        await addTake(dest, to: shootId)
    }

    // Settings → Delete all takes.
    func deleteAll() {
        for s in shoots { try? FileManager.default.removeItem(at: folder(s)) }
        shoots = []
        save()
    }

    func deleteTake(_ take: Take, from shootId: String) {
        guard let s = shoot(shootId) else { return }
        try? FileManager.default.removeItem(at: url(take, in: s))
        update(shootId) { $0.takes.removeAll { $0.id == take.id } }
    }

    func deleteShoot(_ shoot: Shoot) {
        try? FileManager.default.removeItem(at: folder(shoot))
        shoots.removeAll { $0.id == shoot.id }
        save()
    }

    func update(_ id: String, _ change: (inout Shoot) -> Void) {
        guard let i = shoots.firstIndex(where: { $0.id == id }) else { return }
        change(&shoots[i])
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(shoots) { try? data.write(to: Self.index, options: .atomic) }
    }

    // How much room the raw takes take, for Settings.
    func diskUsage() -> String {
        let keys: Set<URLResourceKey> = [.fileSizeKey]
        var total: Int64 = 0
        if let e = FileManager.default.enumerator(at: Self.root, includingPropertiesForKeys: Array(keys)) {
            for case let url as URL in e {
                total += Int64((try? url.resourceValues(forKeys: keys))?.fileSize ?? 0)
            }
        }
        return ByteCountFormatter.string(fromByteCount: total, countStyle: .file)
    }

    // A still from early in the take, for lists.
    static func thumbnail(for url: URL) async -> UIImage? {
        let gen = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 240, height: 240)
        guard let cg = try? await gen.image(at: CMTime(seconds: 0.3, preferredTimescale: 600)).image else { return nil }
        return UIImage(cgImage: cg)
    }

    // nonisolated: Photos runs the change block on its own queue, and a block
    // made on the main actor traps there ("Block was expected to execute on
    // queue main"). That crash is why a finished 93 s edit never reached
    // Photos on 2026-10-26: the render was done, the app died saving it.
    nonisolated static func saveToPhotos(_ url: URL) async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else { return false }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetCreationRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }
            return true
        } catch {
            return false
        }
    }
}
