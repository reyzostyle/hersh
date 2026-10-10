// deno-lint-ignore-file no-explicit-any
import { watchVideo } from './analyze-video.ts';
import { callLLM } from './llm.ts';
import { parseModelJson } from './json.ts';

// How this creator actually talks on camera, taken from their own Shorts.
//
// Ivan, 2026-10-10: scripts and outlines read like AI, not like the person
// filming them. The brain's "voice" field could not fix that: it is written
// from titles, so it comes out as "Direct, informal, fast-paced", which
// describes half of YouTube and gives a model nothing to copy. Five transcripts
// existed across all users, so there was no text to learn from either.
//
// So the model watches the creator's two best-performing Shorts and writes down
// what it hears: the opening lines verbatim, the words they reach for, how long
// their sentences run, what they put on screen. Writers then get real lines to
// match instead of adjectives. Built in the background (daily-ideas cron),
// refreshed monthly, and absent for anyone without a connected channel, in
// which case everything falls back to the brain as before.

export interface CreatorVoice {
  example_lines: string[];   // verbatim, as spoken
  how_they_talk: string;     // concrete: sentence length, person, energy, slang
  words_they_use: string[];
  never: string[];           // things that would sound wrong from them
  hook_style: string;
  on_screen: string;
  built_from: string[];      // video ids
}

export const VOICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SAMPLES = 2;

export async function loadVoice(supabase: any, userId: string): Promise<CreatorVoice | null> {
  const { data } = await supabase.from('user_tokens').select('voice').eq('user_id', userId).maybeSingle();
  const v = data?.voice;
  return v && Array.isArray(v.example_lines) ? v as CreatorVoice : null;
}

export function voiceBlock(voice: CreatorVoice | null): string {
  if (!voice) return '';
  return `## How they actually talk on camera (heard in their own Shorts)
${voice.how_they_talk}
Hooks: ${voice.hook_style}
On screen: ${voice.on_screen}
Words they use: ${voice.words_they_use.join(', ') || 'none noted'}
Would sound wrong from them: ${voice.never.join('; ') || 'none noted'}
Lines they really said, verbatim:
${voice.example_lines.map(l => `- "${l}"`).join('\n')}

Anything written for them to say must sound like those lines: same length, same words, same energy. If a line could not plausibly come out of their mouth, rewrite it.

`;
}

// The best two of their ten most recent Shorts, from the synced `videos` table.
// Recent first, because channels change: Ivan's all-time top Shorts are old
// Fortnite videos with a text-to-speech voiceover, and the first voice built
// from them described a channel he no longer makes. Only real YouTube ids: the
// table also holds demo rows ("rankdemo01") that would 404 the watch.
async function topShorts(supabase: any, userId: string): Promise<{ video_id: string; title: string }[]> {
  const { data } = await supabase
    .from('videos').select('video_id, title, views, duration, published_at')
    .eq('user_id', userId).lte('duration', 180).gt('duration', 0)
    .order('published_at', { ascending: false, nullsFirst: false }).limit(25);
  return (data ?? [])
    .filter((v: any) => /^[\w-]{11}$/.test(v.video_id))
    .slice(0, 10)
    .sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, SAMPLES);
}

export async function buildVoice(supabase: any, userId: string): Promise<CreatorVoice | null> {
  const shorts = await topShorts(supabase, userId);
  if (shorts.length === 0) return null;

  const heard: string[] = [];
  for (const v of shorts) {
    try {
      const notes = await watchVideo(
        { fileUri: `https://www.youtube.com/watch?v=${v.video_id}`, mimeType: 'video/mp4' },
        `This is one of the creator's own YouTube Shorts ("${v.title}"). Listen to how they talk.

1. Write down, word for word, the first five to eight things they say. Exactly as spoken, filler words and slang included. Do not clean it up.
2. Then, in a few short lines: how long their sentences are, whether they talk to camera or narrate over footage, their energy, any phrases or slang they repeat, and what text or visuals they put on screen.

Plain text.`,
        { maxTokens: 1200 },
      );
      if (notes.trim()) heard.push(`Video: "${v.title}"\n${notes.trim()}`);
    } catch (e) {
      console.error(`[voice] could not watch ${v.video_id}:`, e);
    }
  }
  if (heard.length === 0) return null;

  const raw = await callLLM(`Below are notes on how one creator talks in their own Shorts, including lines transcribed word for word.

${heard.join('\n\n')}

Turn this into a voice profile another writer can copy. Be concrete: "sentences of four to eight words, says 'bro' and 'lowkey', talks straight to camera" is useful, "direct and engaging" is not.

Respond with JSON only:
{
  "example_lines": ["up to 8 lines copied verbatim from the transcripts above, the most characteristic ones"],
  "how_they_talk": "2-3 concrete sentences",
  "words_they_use": ["words or phrases they actually use"],
  "never": ["phrasings that would sound wrong coming from them, e.g. polished marketing language"],
  "hook_style": "how their videos open, concretely",
  "on_screen": "what they show and put as text on screen"
}

Never use an em-dash or en-dash.`, { maxTokens: 1500, tier: 'writer' });

  const p = parseModelJson(raw, 'voice') as Partial<CreatorVoice>;
  const arr = (x: unknown) => Array.isArray(x) ? x.map(String).map(s => s.replace(/[—–]/g, '-')).filter(Boolean) : [];
  const voice: CreatorVoice = {
    example_lines: arr(p.example_lines).slice(0, 8),
    how_they_talk: String(p.how_they_talk ?? '').replace(/[—–]/g, '-'),
    words_they_use: arr(p.words_they_use).slice(0, 15),
    never: arr(p.never).slice(0, 8),
    hook_style: String(p.hook_style ?? '').replace(/[—–]/g, '-'),
    on_screen: String(p.on_screen ?? '').replace(/[—–]/g, '-'),
    built_from: shorts.map(s => s.video_id),
  };
  if (voice.example_lines.length === 0) return null;

  await supabase.from('user_tokens')
    .update({ voice, voice_at: new Date().toISOString() }).eq('user_id', userId);
  return voice;
}
