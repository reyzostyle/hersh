import SwiftUI

// The Chat tab: one conversation on screen, earlier ones a tap away, a
// composer at the bottom. The creator's own words on a raised bubble, Chumoku's
// as plain text, the way the web chat reads.
struct ChatView: View {
    @Environment(ChatStore.self) private var chat
    @State private var draft = ""
    @State private var historyOpen = false
    @FocusState private var typing: Bool

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
        .task(id: chat.pending?.text) {
            // "Continue in Chat" from a script: a fresh conversation about
            // that idea, the first line waiting in the box.
            guard let p = chat.pending else { return }
            chat.pending = nil
            chat.startNew()
            chat.ideaId = p.ideaId
            draft = p.text
            typing = true
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

    private var empty: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Ask anything about your channel, an idea or a script. Each answer is 1 credit.")
                .font(.tSmall).foregroundStyle(Color.textMuted)
                .padding(.bottom, 6)
            ForEach(starters, id: \.self) { s in
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
        .padding(.top, 24)
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
            TextField("", text: $draft, prompt: Text("Message Chumoku").foregroundStyle(Color.textFaint), axis: .vertical)
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
                        Empty(text: chat.loadingThreads ? "Loading…" : "No chats yet.")
                    }
                    ForEach(chat.threads) { t in
                        Button {
                            historyOpen = false
                            Task { await chat.open(t) }
                        } label: {
                            HStack {
                                Text(t.title?.isEmpty == false ? t.title! : "Untitled chat")
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
