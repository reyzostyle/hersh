#if DEBUG
import Foundation

// Launch with -demo to see the signed-in screens without an account, for
// checking layout in the simulator. Debug builds only.
extension IdeasStore {
    static var isDemo: Bool { ProcessInfo.processInfo.arguments.contains("-demo") }

    func fillDemo() {
        let outline = Outline(
            hook: "I filmed the same Short three ways and only one got past 1,000 views.",
            sections: [
                OutlineSection(title: "Setup", content: "Same script, same light. The only thing I changed was the first second.", duration: "0:05"),
                OutlineSection(title: "The test", content: "Version one opens on my face. Version two opens on the result. Version three opens mid-sentence.", duration: "0:15"),
                OutlineSection(title: "Result", content: "Mid-sentence kept 71% past the first second. The other two lost half the room.", duration: "0:10"),
            ],
            cta: "Steal the opening, tell me what you got."
        )
        func idea(_ n: Int, _ title: String, _ views: Int, _ score: Double, liked: Bool? = nil, outline: Outline? = nil) -> Idea {
            Idea(id: "demo\(n)", channelName: "Demo Channel \(n)", videoId: "demo\(n)", videoTitle: title, videoThumbnail: nil,
                 videoViews: views, outlierScore: score, pitch: title, fit: "yes", concept: nil, adaptedIdea: nil,
                 outline: outline, script: nil, liked: liked, createdAt: nil)
        }
        today = [
            idea(1, "Your version: the same Short filmed three ways, one hook wins", 1_240_000, 14, outline: outline),
            idea(2, "Show the result before you explain it", 860_000, 9),
            idea(3, "One mistake every new creator makes on camera", 412_000, 6, liked: true),
            idea(4, "I tried posting at 6am for a week", 95_000, 3, liked: false),
        ]
        saved = today.filter { $0.liked == true }
        nextAt = Date().addingTimeInterval(5 * 3600 + 120)
    }
}
#endif
