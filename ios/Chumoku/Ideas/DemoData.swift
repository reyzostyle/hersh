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
        func own(_ n: Int, _ pitch: String, _ premise: String, _ basis: IdeaBasis) -> Idea {
            Idea(id: "ai-demo\(n)", channelName: "reyzostyle", videoId: "ai-demo\(n)", videoTitle: nil, videoThumbnail: nil,
                 videoViews: nil, outlierScore: nil, pitch: pitch, fit: "yes", concept: nil, adaptedIdea: premise,
                 outline: nil, script: nil, liked: nil, createdAt: nil, source: "ai", basis: basis)
        }
        today = [
            idea(1, "Your version: the same Short filmed three ways, one hook wins", 1_240_000, 14, outline: outline),
            idea(2, "Show the result before you explain it", 860_000, 3.9),
            own(1, "Claude Code now runs in your browser. I built an app on my phone",
                "Open Claude Code on the web from your phone and ship a tiny app before your coffee is done. Show the live link at the end.",
                IdeaBasis(kind: "research", hook: "I just built an app on my phone, no laptop.", source: "Claude Code on the web, Oct 20",
                          why: "New, and your build-on-screen Shorts beat your usual", videoId: nil, title: nil, views: nil, multiple: nil)),
            own(2, "I gave 3 AI builders the same prompt. One broke instantly",
                "Same prompt into three builders, side by side, then add a database to each. Only one survives.",
                IdeaBasis(kind: "remix", hook: "Same prompt, three AI builders, and one of them broke in ten seconds.", source: nil,
                          why: "A real build on screen, result in the first second", videoId: nil,
                          title: "how to vibecode an app with no experience", views: 41_000, multiple: 4.6)),
            idea(3, "One mistake every new creator makes on camera", 412_000, 6, liked: true),
            idea(4, "I tried posting at 6am for a week", 95_000, 3, liked: false),
        ]
        saved = today.filter { $0.liked == true }
        nextAt = Date().addingTimeInterval(5 * 3600 + 120)
    }
}
#endif
