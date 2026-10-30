import Foundation
import Supabase

// The language ideas, scripts and the chat come back in (user_tokens.language;
// supabase/functions/_shared/language.ts). It follows the phone until it is
// picked in Settings. The app's own words follow iOS: the phone's language,
// or the one set for Chumoku under iOS Settings → Apps → Chumoku → Language.
enum ContentLanguage {
    static let all: [(code: String, name: String)] = [
        ("en", "English"), ("es", "Español"), ("pt", "Português"),
        ("fr", "Français"), ("de", "Deutsch"), ("ja", "日本語"),
    ]
    static let pickedKey = "language.picked"

    // The phone's first language Chumoku writes in, else English.
    static var device: String {
        for id in Locale.preferredLanguages {
            let code = String(id.prefix(2))
            if all.contains(where: { $0.code == code }) { return code }
        }
        return "en"
    }

    static func name(_ code: String) -> String { all.first { $0.code == code }?.name ?? "English" }

    static func save(_ code: String) async {
        guard let uid = try? await supabase.auth.session.user.id else { return }
        nonisolated struct Patch: Encodable { let language: String }
        _ = try? await supabase.from("user_tokens").update(Patch(language: code)).eq("user_id", value: uid).execute()
    }

    // On launch: until someone picks a language, the account follows the phone.
    static func sync() async {
        if UserDefaults.standard.string(forKey: pickedKey) != nil { return }
        await save(device)
    }
}
