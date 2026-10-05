// deno-lint-ignore-file no-explicit-any
import { callLLM } from './llm.ts';
import { parseModelJson } from './json.ts';
import { loadBrain, brainBlock } from './brain.ts';
import { loadChannelScan, channelScanBlock } from './channel-scan.ts';

// One cheap call over titles only: for each pooled Short, what THIS creator's
// version would be and whether it fits their channel. Shared by pitch-ideas
// (the feed, on demand) and daily-ideas (the morning drop). Writes the
// competitor_ideas rows and returns them; `extra` rides along on every row.

export interface PitchSource {
  video_id: string;
  channel_id: string;
  channel_name: string | null;
  title: string | null;
  views: number | null;
  published_at: string | null;
  outlier_score: number | null;
}

export async function pitchVideos(
  supabase: any,
  userId: string,
  todo: PitchSource[],
  extra: Record<string, unknown> = {},
): Promise<any[]> {
  if (todo.length === 0) return [];

  const brain = await loadBrain(supabase, userId);
  const scan = channelScanBlock(await loadChannelScan(supabase, userId));
  const who = brain ? brainBlock(brain) : '';
  if (!who && !scan) {
    // Nothing to adapt against. Better no pitch than a pitch for nobody.
    return [];
  }

  const list = todo.map((p, i) => `${i + 1}. [${p.video_id}] "${p.title ?? ''}" (${p.channel_name ?? 'unknown channel'})`).join('\n');

  const prompt = `You help one Shorts creator decide which viral Shorts from other channels are worth stealing the format of.

${who}${scan}

Below are Shorts that beat their own channel's usual views. You only have the titles. For each one:
- pitch: ONE line, under 90 characters, saying what THIS creator's version would be. Their subject, the other video's format. Written like a working title or a one-line premise, not advice. Never reuse the other video's subject.
- fit: "yes" if this creator could film their version this week with what they already make, "stretch" if it would need a real change of subject or setup, "no" if it does not transfer to their channel at all.

Be strict with fit. Most creators have one niche; a format from far outside it is a stretch at best. If a title is too vague to judge, give your best pitch and mark it "stretch".

Shorts:
${list}

Respond with JSON only, one entry per Short, same ids:
{"ideas":[{"id":"<video id>","pitch":"...","fit":"yes|stretch|no"}]}

Never use an em-dash or en-dash, only the regular hyphen.`;

  const raw = await callLLM(prompt, { maxTokens: 2400 });
  const parsed = parseModelJson(raw, 'pitch-ideas') as { ideas?: Array<{ id?: string; pitch?: string; fit?: string }> };
  const byId = new Map(todo.map(p => [p.video_id, p]));

  const rows = (parsed.ideas ?? [])
    .filter(r => r.id && byId.has(r.id) && r.pitch)
    .map(r => {
      const p = byId.get(r.id!)!;
      return {
        user_id: userId,
        video_id: p.video_id,
        channel_id: p.channel_id,
        channel_name: p.channel_name,
        video_title: p.title,
        video_views: p.views,
        video_published_at: p.published_at,
        outlier_score: p.outlier_score,
        pitch: String(r.pitch).replace(/[—–]/g, '-').trim().slice(0, 140),
        fit: r.fit === 'yes' || r.fit === 'no' ? r.fit : 'stretch',
        ...extra,
      };
    });
  if (rows.length === 0) return [];

  // liked is not in the row, so an upsert never touches a save or a dismiss.
  const { data: saved, error } = await supabase
    .from('competitor_ideas')
    .upsert(rows, { onConflict: 'user_id,video_id' })
    .select();
  if (error) throw error;

  return saved ?? [];
}
