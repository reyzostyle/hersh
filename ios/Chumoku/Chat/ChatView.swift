import SwiftUI

// The Chat tab: one conversation on screen, earlier ones a tap away, a
// composer at the bottom. The creator's own words on a raised bubble, Chumoku's
// as plain text, the way the web chat reads.
struct ChatView: View {
    @Environment(ChatStore.self) private var chat
    @State private var draft = ""
    @State private var historyOpen = false
    @FocusState private var typing: Bool

    @State private var scriptOpen = false

    // Asked about the script on screen, so they are about it and nothing else.
    private let scriptStarters = [
        String(localized: "Make the hook hit harder"),
        String(localized: "Cut it to 30 seconds"),
        String(localized: "Give me 3 other openings"),
        String(localized: "What should be on screen?"),
    ]

    private let starters = [
        "What should I film tomorrow?",
        "Give me 5 hooks for my next Short",
        "Why did my last Short flop?",
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        if let a = chat.attached { attachedCard(a) }
                        if chat.messages.isEmpty && !chat.sending { empty }
                        ForEach(chat.messages) { m in bubble(m).id(m.id) }
                        if chat.sending { Working(label: "Thinking").id("working") }
                        if let error = chat.error {
                            Text(error).font(.tSmall).foregroundStyle(Color.danger)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 16)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: chat.messages.count) { _, _ in withAnimation(.ui) { proxy.scrollTo("end", anchor: .bottom) } }
                .onChange(of: chat.sending) { _, _ in withAnimation(.ui) { proxy.scrollTo("end", anchor: .bottom) } }
            }
            composer
        }
        .background(Color.bg.ignoresSafeArea())
        .sheet(isPresented: $historyOpen) { history }
        .task { await chat.loadThreads() }
        .task(id: chat.pending?.ideaId) {
            // "Continue in Chat" from a script: a fresh conversation about
            // that idea, its script on screen and the box left empty.
            guard let p = chat.pending else { return }
            chat.pending = nil
            chat.startNew()
            chat.ideaId = p.ideaId
            chat.attached = (p.title, p.script)
            scriptOpen = false
            draft = ""
        }
    }

    private var header: some View {
        HStack {
            Text("Chat").font(.tTitle).foregroundStyle(Color.text)
            Spacer()
            circle("clock.arrow.circlepath") { historyOpen = true }
                .accessibilityLabel("Earlier chats")
            circle("square.and.pencil") { chat.startNew(); draft = ""; typing = true }
                .accessibilityLabel("New chat")
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // The script the chat took, so there is no guessing whether it did.
    private func attachedCard(_ a: (title: String, script: String)) -> some View {
        Button { withAnimation(.ui) { scriptOpen.toggle() } } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "doc.text").font(.system(size: 12, weight: .semibold))
                    Text("Script").font(.tLabel)
                    Spacer()
                    Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(scriptOpen ? 180 : 0))
                }
                .foregroundStyle(Color.textMuted)
                Text(a.title).font(.geist(15, .medium)).foregroundStyle(Color.text)
                    .multilineTextAlignment(.leading)
                if !a.script.isEmpty {
                    Text(a.script).font(.tSmall).foregroundStyle(Color.textMuted)
                        .lineLimit(scriptOpen ? nil : 3)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Color.raised))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 12)
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(chat.attached != nil ? "Ask anything about this script. Each answer is 1 credit." : "Ask anything about your channel, an idea or a script. Each answer is 1 credit.")
                .font(.tSmall).foregroundStyle(Color.textMuted)
                .padding(.bottom, 6)
            ForEach(chat.attached != nil ? scriptStarters : starters, id: \.self) { s in
                Button { Task { await chat.send(s) } } label: {
                    Text(s).font(.tBody).foregroundStyle(Color.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 13)
                        .background(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).fill(Color.raised))
                        .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, chat.attached != nil ? 4 : 24)
    }

    @ViewBuilder private func bubble(_ m: ChatMessage) -> some View {
        if m.isUser {
            HStack {
                Spacer(minLength: 48)
                Text(m.content)
                    .font(.tBody).foregroundStyle(Color.text)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.raisedHover))
                    .textSelection(.enabled)
            }
        } else {
            Text(markdown(m.content))
                .font(.tBody).foregroundStyle(Color.text).lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }

    // Bold, italics and links from the model's markdown; line breaks kept.
    private func markdown(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("", text: $draft, prompt: Text(chat.attached != nil ? "Ask about this script" : "Message Chumoku").foregroundStyle(Color.textFaint), axis: .vertical)
                .font(.geist(15)).foregroundStyle(Color.text)
                .lineLimit(1...6)
                .focused($typing)
                .padding(.horizontal, 16).padding(.vertical, 13)
                .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color.raised))
                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.line, lineWidth: 1))
            let empty = draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            Button {
                let text = draft
                draft = ""
                Task { await chat.send(text) }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(empty || chat.sending ? Color.textFaint : Color.bg)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(empty || chat.sending ? Color.white.opacity(0.08) : Color.white))
            }
            .buttonStyle(.plain)
            .disabled(empty || chat.sending)
            .accessibilityLabel("Send")
            .sensoryFeedback(.impact(weight: .light), trigger: chat.messages.count)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Color.bg)
    }

    private var history: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if chat.threads.isEmpty {
                        Empty(text: chat.loadingThreads ? String(localized: "Loading…") : String(localized: "No chats yet."))
                    }
                    ForEach(chat.threads) { t in
                        Button {
                            historyOpen = false
                            Task { await chat.open(t) }
                        } label: {
                            HStack {
                                Text(t.title?.isEmpty == false ? t.title! : String(localized: "Untitled chat"))
                                    .font(.tBody).foregroundStyle(Color.text).lineLimit(1)
                                Spacer()
                                if t.id == chat.threadId {
                                    Image(systemName: "checkmark").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.textMuted)
                                }
                            }
                            .padding(.vertical, 14)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Rectangle().fill(Color.line).frame(height: 1)
                    }
                }
                .padding(.horizontal, 20)
            }
            .background(Color.bg.ignoresSafeArea())
            .navigationTitle("Earlier chats")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { historyOpen = false } }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Color.bg)
    }

    private func circle(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium)).foregroundStyle(Color.text)
                .frame(width: 38, height: 38)
                .background(Circle().fill(Color.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
    }
}
