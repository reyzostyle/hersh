import Foundation
import Supabase

// Chat, the web's Chat tab on a phone (2026-10-28). Same function
// (chat-followup, 1 credit a message) and the same chat_threads /
// chat_messages rows, so a conversation started on chumoku.co continues here
// and the other way round. Text only for now: no screenshots, no video
// reviews from a pasted link.
nonisolated struct ChatThread: Decodable, Identifiable, Hashable {
    let id: String
    let title: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title
        case updatedAt = "updated_at"
    }
}

nonisolated struct ChatMessage: Decodable, Identifiable, Hashable {
    var id: String
    let role: String
    let content: String
    var isUser: Bool { role == "user" }

    // A review row carries the scorecard JSON in another column; its content
    // is the readable part, which is all this screen shows.
    init(id: String = UUID().uuidString, role: String, content: String) {
        self.id = id; self.role = role; self.content = content
    }
}

@Observable
final class ChatStore {
    var threads: [ChatThread] = []
    var loadingThreads = false
    // The open conversation. nil id = a new one, not written anywhere yet.
    var threadId: String?
    var messages: [ChatMessage] = []
    var sending = false
    var error: String?
    // Set from an idea's script ("Continue in Chat"): MainTabs switches to
    // Chat, which opens a new conversation about that idea with the script on
    // screen as a card, so it is plain which script the chat has. Nothing is
    // typed for them or sent: it costs nothing until they ask something.
    var pending: (title: String, script: String, ideaId: String)?
    // The script this conversation is about, shown at its top.
    var attached: (title: String, script: String)?
    // The idea this conversation is about; sent with every message so the
    // chat has its script.
    var ideaId: String?

    static let shared = ChatStore()

    func loadThreads() async {
        #if DEBUG
        if IdeasStore.isDemo { return }
        #endif
        guard let uid = try? await supabase.auth.session.user.id else { return }
        loadingThreads = true
        defer { loadingThreads = false }
        threads = (try? await supabase.from("chat_threads")
            .select("id, title, updated_at")
            .eq("user_id", value: uid)
            .order("updated_at", ascending: false)
            .limit(50)
            .execute().value) ?? threads
    }

    func open(_ thread: ChatThread) async {
        threadId = thread.id
        ideaId = nil
        attached = nil
        messages = []
        error = nil
        nonisolated struct Row: Decodable { let id: String; let role: String; let content: String? }
        let rows: [Row] = (try? await supabase.from("chat_messages")
            .select("id, role, content")
            .eq("thread_id", value: thread.id)
            .order("created_at", ascending: true)
            .execute().value) ?? []
        messages = rows.compactMap { r in
            guard let c = r.content, !c.isEmpty else { return nil }
            return ChatMessage(id: r.id, role: r.role, content: c)
        }
    }

    func startNew() {
        threadId = nil
        ideaId = nil
        attached = nil
        messages = []
        error = nil
    }

    func send(_ text: String, ideaId: String? = nil) async {
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !sending else { return }
        error = nil
        messages.append(ChatMessage(role: "user", content: q))
        sending = true
        defer { sending = false }

        #if DEBUG
        if IdeasStore.isDemo {
            try? await Task.sleep(for: .seconds(1))
            messages.append(ChatMessage(role: "assistant", content: String(localized: "Demo mode: this is where Chumoku answers. Sign in to talk for real.")))
            return
        }
        #endif

        nonisolated struct Answer: Decodable { let answer: String }
        nonisolated struct Failed: Decodable { let error: String? }
        var body: [String: AnyJSON] = ["question": .string(q)]
        if let threadId { body["threadId"] = .string(threadId) }
        if let id = ideaId ?? self.ideaId { body["ideaId"] = .string(id) }
        do {
            let res: Answer = try await supabase.functions.invoke("chat-followup", options: FunctionInvokeOptions(body: body))
            messages.append(ChatMessage(role: "assistant", content: res.answer))
            // The server writes into a thread that exists; the first exchange
            // of a new conversation is written here, as the web does.
            if threadId == nil { await keepFirst(question: q, answer: res.answer) }
            else { await loadThreads() }
        } catch let FunctionsError.httpError(code, data) {
            if code == 403 {
                error = String(localized: "You're out of credits for this month.")
                Purchases.shared.showPlans = true
            }
            else { error = (try? JSONDecoder().decode(Failed.self, from: data))?.error ?? String(localized: "Could not get an answer. Try again.") }
        } catch {
            self.error = String(localized: "Could not get an answer. Try again.")
        }
    }

    private func keepFirst(question: String, answer: String) async {
        guard let uid = try? await supabase.auth.session.user.id else { return }
        nonisolated struct NewThread: Encodable { let user_id: UUID; let title: String }
        nonisolated struct NewMessage: Encodable { let thread_id: String; let user_id: UUID; let role: String; let content: String }
        nonisolated struct Made: Decodable { let id: String }
        guard let made: Made = try? await supabase.from("chat_threads")
            .insert(NewThread(user_id: uid, title: String(question.prefix(60))))
            .select("id").single().execute().value else { return }
        threadId = made.id
        _ = try? await supabase.from("chat_messages").insert([
            NewMessage(thread_id: made.id, user_id: uid, role: "user", content: question),
            NewMessage(thread_id: made.id, user_id: uid, role: "assistant", content: answer),
        ]).execute()
        await loadThreads()
    }
}
