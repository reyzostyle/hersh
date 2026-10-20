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

    func addTake(_ url: URL, to shootId: String) async {
        let duration = (try? await AVURLAsset(url: url).load(.duration).seconds) ?? 0
        guard duration > 0.3 else { try? FileManager.default.removeItem(at: url); return }
        update(shootId) { $0.takes.append(Take(id: UUID().uuidString, file: url.lastPathComponent, duration: duration, createdAt: .now)) }
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

    // A still from early in the take, for lists.
    static func thumbnail(for url: URL) async -> UIImage? {
        let gen = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 240, height: 240)
        guard let cg = try? await gen.image(at: CMTime(seconds: 0.3, preferredTimescale: 600)).image else { return nil }
        return UIImage(cgImage: cg)
    }

    static func saveToPhotos(_ url: URL) async -> Bool {
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
