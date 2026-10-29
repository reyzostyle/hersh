// Keeping video_retention current for one creator, and the lessons drawn from
// it. Called by sync-retention (cron, Settings) and nothing else writes the
// lessons.
//
// The lessons are the part that makes the curves matter beyond one video: a
// short list of what keeps and what loses THIS channel's viewers, each one
// backed by named videos and their numbers. They ride along with the brain
// (brain.ts), so ideas, outlines, scripts, reviews and the chat are all
// written against them.

import { callLLM } from './llm.ts';
import { languageRule, loadLanguage } from './language.ts';
import { parseModelJson } from './json.ts';
import { freshAccessToken } from './youtube-token.ts';
import {
  MAX_SHORT_S, NoAnalyticsScope, fetchStats, syncOne, watchBeats, attachBeats, listShorts,
  perSecond, pctAt, relAt, replayShare, mmss, type RetentionRow,
} from './retention.ts';

export interface RetentionLessons {
  // Second person, one or two sentences: where they lose people, what holds them.
  summary: string;
  lessons: { rule: string; evidence: string }[];
  stayed_median: number | null;
  avg_view_median: number | null;
  videos: number;
  made_at: string;
}

export interface SyncResult {
  synced: number;
  beats: number;
  lessons: boolean;
  error?: 'not_connected' | 'no_scope' | 'no_videos';
}

// deno-lint-ignore no-explicit-any
type DB = any;

const DAY = 86_400_000;
// Lessons need enough videos to be patterns rather than anecdotes, and a curve
// on a Short with a handful of views is noise.
const MIN_LESSON_VIDEOS = 3;
const MIN_VIEWS = 20;

export async function syncUser(
  supabase: DB, userId: string,
  opts: { beatsBudget?: number; deadline?: number; force?: boolean } = {},
): Promise<SyncResult> {
  const deadline = opts.deadline ?? Date.now() + 100_000;
  const beatsBudget = opts.beatsBudget ?? 4;
  // Stamped on every way out, so the hourly cron leaves an account alone for
  // a day whatever happened, instead of retrying a dead one every hour.
  const stamp = (error: string | null) => supabase.from('user_tokens')
    .update({ retention_synced_at: new Date().toISOString(), retention_error: error })
    .eq('user_id', userId);
  const token = await freshAccessToken(supabase, userId);
  if (!token) {
    await stamp('not_connected');
    return { synced: 0, beats: 0, lessons: false, error: 'not_connected' };
  }

  const { data: vids } = await supabase
    .from('videos').select('video_id, title, duration, published_at')
    .eq('user_id', userId).gt('duration', 0).lte('duration', MAX_SHORT_S)
    .order('published_at', { ascending: false, nullsFirst: false }).limit(40);
  // deno-lint-ignore no-explicit-any
  let shorts = (vids ?? []).filter((v: any) => /^[\w-]{11}$/.test(v.video_id));
  if (!shorts.length) {
    try {
      shorts = await listShorts(token);
    } catch (e) {
      if (e instanceof NoAnalyticsScope) {
        await stamp('no_scope');
        return { synced: 0, beats: 0, lessons: false, error: 'no_scope' };
      }
      console.log(`[retention-sync] listing ${userId} failed:`, String(e).slice(0, 200));
    }
  }
  if (!shorts.length) {
    await stamp(null);
    return { synced: 0, beats: 0, lessons: false, error: 'no_videos' };
  }

  const { data: have } = await supabase
    .from('video_retention').select('video_id, fetched_at, drops, beats_at')
    .eq('user_id', userId)
    // deno-lint-ignore no-explicit-any
    .in('video_id', shorts.map((v: any) => v.video_id));
  // deno-lint-ignore no-explicit-any
  const known = new Map<string, any>((have ?? []).map((h: any) => [h.video_id, h]));

  // A video's first month is when its curve still moves; after that, weekly.
  // deno-lint-ignore no-explicit-any
  const due = shorts.filter((v: any) => {
    const h = known.get(v.video_id);
    if (!h || opts.force) return true;
    const age = Date.now() - new Date(h.fetched_at).getTime();
    const young = v.published_at && Date.now() - new Date(v.published_at).getTime() < 30 * DAY;
    return age > (young ? 0.8 * DAY : 7 * DAY);
  });

  let synced = 0;
  if (due.length) {
    let stats;
    try {
      // deno-lint-ignore no-explicit-any
      stats = await fetchStats(token, due.map((v: any) => v.video_id));
    } catch (e) {
      if (e instanceof NoAnalyticsScope) {
        await stamp('no_scope');
        return { synced: 0, beats: 0, lessons: false, error: 'no_scope' };
      }
      throw e;
    }
    // Five at a time: one after another took seven seconds a video.
    let noScope = false;
    for (let i = 0; i < due.length && !noScope; i += 5) {
      if (Date.now() > deadline - 20_000) break;
      // deno-lint-ignore no-explicit-any
      await Promise.all(due.slice(i, i + 5).map(async (v: any) => {
        try {
          const row = await syncOne(supabase, userId, token, v, { stats: stats.get(v.video_id) ?? null, beats: false });
          if (row) { synced++; known.set(v.video_id, { video_id: v.video_id, fetched_at: row.fetched_at, drops: row.drops, beats_at: row.beats_at }); }
        } catch (e) {
          if (e instanceof NoAnalyticsScope) noScope = true;
          else console.log(`[retention-sync] ${v.video_id} failed:`, String(e).slice(0, 200));
        }
      }));
    }
    if (noScope) {
      await stamp('no_scope');
      return { synced, beats: 0, lessons: false, error: 'no_scope' };
    }
  }

  // What is said at each second, for the videos that have a curve and no
  // beats yet: the newest first, a few per run, three at a time.
  // deno-lint-ignore no-explicit-any
  const needBeats = shorts.filter((v: any) => {
    const h = known.get(v.video_id);
    return h && Array.isArray(h.drops) && !h.beats_at;
  }).slice(0, beatsBudget);
  let beats = 0;
  for (let i = 0; i < needBeats.length; i += 3) {
    if (Date.now() > deadline - 45_000) break;
    const batch = needBeats.slice(i, i + 3);
    // deno-lint-ignore no-explicit-any
    await Promise.all(batch.map(async (v: any) => {
      try {
        const got = await watchBeats(v.video_id, v.duration);
        if (!got.length) return;
        const { data: row } = await supabase
          .from('video_retention').select('*').eq('user_id', userId).eq('video_id', v.video_id).maybeSingle();
        if (row) { await attachBeats(supabase, row as RetentionRow, got); beats++; }
      } catch (e) {
        console.log(`[retention-sync] beats ${v.video_id} failed:`, String(e).slice(0, 200));
      }
    }));
  }

  let lessons = false;
  if ((synced || beats || opts.force) && Date.now() < deadline - 15_000) {
    try {
      lessons = !!(await buildRetentionLessons(supabase, userId));
    } catch (e) {
      console.log('[retention-sync] lessons failed:', String(e).slice(0, 200));
    }
  }

  await stamp(null);
  return { synced, beats, lessons };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return Math.round(m * 10) / 10;
};

export async function buildRetentionLessons(supabase: DB, userId: string): Promise<RetentionLessons | null> {
  const { data } = await supabase
    .from('video_retention')
    .select('video_id, title, duration_s, views, stayed_pct, avg_view_pct, avg_view_s, curve, drops, beats, published_at')
    .eq('user_id', userId).gte('views', MIN_VIEWS).not('curve', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false }).limit(30);
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []).filter((r: any) => r.duration_s && r.curve?.length) as RetentionRow[];
  if (rows.length < MIN_LESSON_VIDEOS) return null;

  const evidence = rows.map(r => {
    const d = r.duration_s!;
    const sec = perSecond(r.curve!, d);
    const end = Math.round(pctAt(r.curve!, d * 0.97, d));
    const first = r.beats?.find(b => b.says)?.says;
    const top = r.drops?.[0];
    const rel = relAt(r.curve!, d * 0.97, d);
    return `- "${r.title ?? r.video_id}" (${mmss(d)}, ${r.views} views): ${r.stayed_pct != null ? `${Math.round(r.stayed_pct)}% stayed to watch, ` : ''}average view ${r.avg_view_pct != null ? `${Math.round(r.avg_view_pct)}%` : 'unknown'}, ${end}% of those who stayed reached the end, ${replayShare(sec)}% looped${rel != null ? `, holds better than ${Math.round(rel * 100)}% of YouTube videos this length` : ''}.${first ? ` Opens with the words: "${first.slice(0, 160)}".` : ' Opening words not transcribed yet.'}${top ? ` Biggest drop ${mmss(top.from_s)} to ${mmss(top.to_s)}, ${top.from_pct}% down to ${top.to_pct}%${top.says ? `, while saying "${top.says.slice(0, 140)}"` : ''}.` : ' No sharp drop.'}`;
  }).join('\n');

  const stayedMedian = median(rows.map(r => r.stayed_pct).filter((x): x is number => x != null).map(Number));
  const avgMedian = median(rows.map(r => r.avg_view_pct).filter((x): x is number => x != null).map(Number));

  const prompt = `Below are the real YouTube Analytics numbers for one creator's Shorts, newest first. "Stayed to watch" is the share of Shorts-feed viewers who did not swipe away in the first second or two: that is the hook. Everything after it (the drops, reaching the end, looping) is about the people who stayed. A drop early in the video is partly people on their second loop leaving the replay, so judge an opening by "stayed to watch" first.

${evidence}

Their medians: ${stayedMedian != null ? `${stayedMedian}% stayed to watch, ` : ''}average view ${avgMedian ?? 'unknown'}%.

Find what keeps and what loses THIS creator's viewers. Compare the Shorts that held people with the ones that lost them: the opening line, the length, where the drops sit and what was being said there.

Rules:
- Every lesson needs at least two of these videos behind it. Name them in the evidence with their numbers, exactly as given above.
- A title is a label, not what the viewer hears. Only "Opens with the words" tells you how a video opens; never judge an opening by its title.
- Average view % and reaching the end are always higher on shorter videos, so they cannot tell you whether length helps. For length, use "holds better than N% of YouTube videos this length", which already allows for it.
- Videos under 100 views are noise on their own. Lean on the ones with the most views.
- Write each rule as an instruction for whoever writes their next hook or script, specific to this channel (for example: "Open on the finished result, not on the setup: ..."). Not general Shorts advice.
- 2 to 5 lessons. Fewer if the numbers do not show more. If they show nothing clear, return an empty list and say so in the summary.
- Never invent a number, a video or a line. Plain words. No em-dash or en-dash.

Answer with JSON only:
{"summary": "one or two sentences to the creator, second person: where they lose people and what holds them", "lessons": [{"rule": "...", "evidence": "..."}]}`;

  const raw = await callLLM(prompt + languageRule(await loadLanguage(supabase, userId)), { maxTokens: 1200, tier: 'writer' });
  const parsed = parseModelJson<{ summary?: string; lessons?: Array<{ rule?: string; evidence?: string }> }>(raw, 'retention lessons');
  const clean = (s: unknown) => String(s ?? '').replace(/[—–]/g, '-').trim();
  const lessons: RetentionLessons = {
    summary: clean(parsed.summary),
    lessons: (parsed.lessons ?? [])
      .map(l => ({ rule: clean(l.rule), evidence: clean(l.evidence) }))
      .filter(l => l.rule)
      .slice(0, 5),
    stayed_median: stayedMedian,
    avg_view_median: avgMedian,
    videos: rows.length,
    made_at: new Date().toISOString(),
  };
  if (!lessons.summary && !lessons.lessons.length) return null;
  await supabase.from('user_tokens').update({ retention_lessons: lessons }).eq('user_id', userId);
  return lessons;
}
