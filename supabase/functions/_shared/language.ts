// deno-lint-ignore-file no-explicit-any
// The language a creator reads Chumoku in (user_tokens.language, 2026-10-30).
// Russian added the same day.
// The iOS app sets it from the phone's language until they pick one in
// Settings; unset means English, which is also every prompt's own language.
//
// Prompts stay in English and say once, at the end, which language to answer
// in. That keeps one prompt per job instead of six, and the model writes
// natural Spanish from English instructions better than it translates.
export const LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Brazilian Portuguese',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ru: 'Russian',
};

export async function loadLanguage(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from('user_tokens').select('language').eq('user_id', userId).maybeSingle();
  const code = data?.language as string | null | undefined;
  return code && code in LANGUAGES ? code : null;
}

// For anything the creator reads: ideas, outlines, scripts, reviews, the brain.
export function languageRule(code: string | null | undefined): string {
  if (!code || code === 'en' || !(code in LANGUAGES)) return '';
  const name = LANGUAGES[code];
  return `

## Language
Write every word this creator will read (titles, pitches, hooks, scripts, outlines, notes, explanations) in ${name}: the way creators who speak it actually talk on camera, not a translation. JSON keys and fixed values the format above spells out (like "yes", "stretch", "no") stay exactly as written. A line quoted from a source video stays in the language it was said in.`;
}

// For the chat: whoever writes in another language gets answered in it.
export function chatLanguageRule(code: string | null | undefined): string {
  if (!code || code === 'en' || !(code in LANGUAGES)) return '';
  return `## Language\nAnswer in the language of their message. If that is unclear, answer in ${LANGUAGES[code]}.\n\n`;
}
