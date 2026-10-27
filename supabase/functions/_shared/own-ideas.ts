// deno-lint-ignore-file no-explicit-any
import { callLLM } from './llm.ts';
import { parseModelJson } from './json.ts';
import { loadBrain, brainBlock } from './brain.ts';
import { loadChannelScan, type ChannelScan } from './channel-scan.ts';

// Ideas from the creator's own channel (2026-10-27).
//
// Everything else in the drop is someone else's Short that beat its channel:
// proven, but proven for them. Ivan's ask: also throw in ideas built only from
// what worked on YOUR channel, the way a person would go through your uploads
// and say "this one did three times your usual, do more of that". Nothing has
// tested these yet, so they are rows of their own kind (source 'ai', no real
// video behind them) and the client draws them differently, so nobody mistakes
// a suggestion for a Short that already got the views.
//
// One writer call per drop. `video_id` is a made-up `ai-` key only because the
// table is unique on (user_id, video_id) and save, dismiss and chat all key on
// it; nothing ever loads it as a YouTube id.

export const MIN_UPLOADS = 3;

export interface IdeaBasis {
  video_id: string | null;
  title: string;
  views: number;
  multiple: number;
  why: string;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Enough of their own uploads to learn from.
export function canSuggest(scan: ChannelScan | null): boolean {
  return (scan?.videos?.length ?? 0) >= MIN_UPLOADS;
}

export async function suggestFromChannel(
  supabase: any,
  userId: string,
  count: number,
  dropDate: string,
): Promise<number> {
  if (count <= 0) return 0;
  let scan = await loadChannelScan(supabase, userId);
  // A scan cached before uploads carried their ids: read it again once, so
  // the card can show the Short it builds on.
  if (scan?.videos?.length && !scan.videos[0].id) scan = await loadChannelScan(supabase, userId, 0) ?? scan;
  if (!scan || !canSuggest(scan)) return 0;
  const brain = await loadBrain(supabase, userId);

  // A video only a day or two old has not had its views yet.
  const settled = scan.videos.filter(v => Date.now() - new Date(v.publishedAt).getTime() > 2 * 86_400_000);
  const base = median((settled.length >= MIN_UPLOADS ? settled : scan.videos).map(v => v.views)) || 1;
  const uploads = scan.videos.map((v, i) => ({
    n: i + 1, ...v, multiple: Math.round((v.views / base) * 10) / 10,
  }));
  const list = uploads
    .map(v => `${v.n}. "${v.title}" - ${v.views.toLocaleString()} views (${v.multiple}x their usual)`)
    .join('\n');

  // What it suggested before, so tomorrow is not today again.
  const { data: earlier } = await supabase
    .from('competitor_ideas').select('pitch')
    .eq('user_id', userId).eq('source', 'ai')
    .order('created_at', { ascending: false }).limit(40);
  const before = (earlier ?? []).map((r: any) => r.pitch).filter(Boolean);

  const prompt = `You are going through one Shorts creator's own uploads to tell them what to film next.

${brainBlock(brain)}

## Their last ${uploads.length} uploads, newest first
Channel: ${scan.channelTitle}${scan.subscribers != null ? ` (${scan.subscribers.toLocaleString()} subscribers)` : ''}
"Their usual" is the median, ${Math.round(base).toLocaleString()} views.
${list}

Write ${count} new video ideas for them, each one built on something that measurably worked on THIS channel: a subject, a format, a kind of hook or a setup from an upload that beat their usual. Push what worked one step further or into a new subject; never just remake the same video. Spread the ideas across different winning uploads where you can, and use a below-usual upload only to say what to avoid.

For each idea:
- pitch: the working title, under 80 characters, the way they would title it but without hashtags. Not advice, not "Make a video about".
- premise: two short sentences. What happens on screen, and the first line they say.
- basis: the number of the upload it builds on.
- why: under 70 characters, what to repeat from that upload. Plain words, no numbers (they are shown next to it).

${before.length ? `Already suggested on earlier days, do not repeat these or near-copies:\n${before.map((p: string) => `- ${p}`).join('\n')}\n\n` : ''}Respond with JSON only:
{"ideas":[{"pitch":"...","premise":"...","basis":1,"why":"..."}]}

Never use an em-dash or en-dash, only the regular hyphen.`;

  const raw = await callLLM(prompt, { maxTokens: 3000, tier: 'writer' });
  const parsed = parseModelJson(raw, 'own-ideas') as { ideas?: Array<{ pitch?: string; premise?: string; basis?: number; why?: string }> };
  const clean = (s: unknown, max: number) => String(s ?? '').replace(/[—–]/g, '-').trim().slice(0, max);
  // Their titles carry hashtags; on a card they are noise.
  const untag = (s: string) => s.replace(/(^|\s)#[\w-]+/g, '').replace(/\s{2,}/g, ' ').trim();

  const rows = (parsed.ideas ?? [])
    .filter(r => r.pitch && r.premise)
    .slice(0, count)
    .map(r => {
      const src = uploads.find(v => v.n === Number(r.basis));
      const basis: IdeaBasis | null = src ? {
        video_id: src.id ?? null, title: untag(src.title), views: src.views, multiple: src.multiple, why: clean(r.why, 120),
      } : null;
      return {
        user_id: userId,
        video_id: `ai-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        source: 'ai',
        channel_id: null,
        channel_name: scan.channelTitle || null,
        video_title: null,
        pitch: untag(clean(r.pitch, 140)),
        adapted_idea: clean(r.premise, 600),
        fit: 'yes',
        basis,
        drop_date: dropDate,
      };
    });
  if (rows.length === 0) return 0;

  const { error } = await supabase.from('competitor_ideas').insert(rows);
  if (error) throw error;
  return rows.length;
}
