// Real retention for the creator's own Shorts: fetched from YouTube Analytics,
// read in seconds, stored per video (video_retention), and written into every
// prompt that talks about their numbers.
//
// Why it exists (2026-10-28). The review used to fetch the curve, keep the
// three biggest single steps as "at ~12% of the video: -25% viewers" and drop
// the rest. A cliff that takes three seconds came out as three small steps,
// the model turned percentages of the video into seconds by itself, and on
// Ivan's 0:41 Short it reported a 25% drop at 0:05-0:07 while Studio shows
// 150% falling to 50% by 0:03. The fix is to never make the model do the
// arithmetic: the curve goes in second by second, the drops are found here
// with their exact seconds and numbers, and the prompt says those are the
// only drops there are.

import { watchVideo } from './analyze-video.ts';
import { parseModelJson } from './json.ts';
import { freshAccessToken } from './youtube-token.ts';

const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2/reports';

// A Short runs up to three minutes. Anything longer in `videos` is not one.
export const MAX_SHORT_S = 180;

export interface CurvePoint { r: number; w: number; rel: number | null }
export interface Drop {
  from_s: number; to_s: number;
  from_pct: number; to_pct: number;
  lost: number;
  // The second that loses the most inside the drop: where to look first.
  steepest_s?: number;
  says?: string; shows?: string;
}
export interface Beat { t: number; says: string; shows: string }

export interface RetentionRow {
  user_id: string;
  video_id: string;
  title: string | null;
  published_at: string | null;
  duration_s: number | null;
  views: number | null;
  engaged_views: number | null;
  // From the Shorts feed only; stayed_pct is feed_engaged / feed_views when
  // the feed has enough views, else engaged_views / views.
  feed_views: number | null;
  feed_engaged: number | null;
  stayed_pct: number | null;
  avg_view_s: number | null;
  avg_view_pct: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subs_gained: number | null;
  curve: CurvePoint[] | null;
  drops: Drop[] | null;
  beats: Beat[] | null;
  beats_at: string | null;
  fetched_at: string;
}

export interface Usual { stayed: number | null; avgView: number | null; videos: number }

// YouTube refused the Analytics read itself: connected before the scope was
// asked for, or the box was unticked on Google's consent screen. Reconnecting
// is the only fix, so it is told apart from every other failure.
export class NoAnalyticsScope extends Error {}

// deno-lint-ignore no-explicit-any
type DB = any;

const today = () => new Date().toISOString().slice(0, 10);

export const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

async function report(token: string, params: Record<string, string>): Promise<{ headers: string[]; rows: unknown[][] }> {
  const q = new URLSearchParams({ ids: 'channel==MINE', startDate: '2015-01-01', endDate: today(), ...params });
  const res = await fetch(`${ANALYTICS}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && /scope|insufficient/i.test(body)) throw new NoAnalyticsScope(body.slice(0, 300));
    throw new Error(`Analytics ${res.status}: ${body.slice(0, 300)}`);
  }
  const d = await res.json();
  return {
    headers: (d.columnHeaders ?? []).map((h: { name: string }) => h.name),
    rows: d.rows ?? [],
  };
}

// For checking numbers against Studio by hand (sync-retention, cron secret only).
export const rawReport = (token: string, params: Record<string, string>) => report(token, params);

export interface VideoStats {
  views: number | null; engagedViews: number | null;
  avgViewS: number | null; avgViewPct: number | null;
  likes: number | null; comments: number | null; shares: number | null; subs: number | null;
}

const STAT_METRICS = ['views', 'engagedViews', 'averageViewDuration', 'averageViewPercentage', 'likes', 'comments', 'shares', 'subscribersGained'];

// One read for up to fifty videos.
export async function fetchStats(token: string, videoIds: string[]): Promise<Map<string, VideoStats>> {
  const out = new Map<string, VideoStats>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const params = (metrics: string[]) => ({
      metrics: metrics.join(','), dimensions: 'video',
      filters: `video==${chunk.join(',')}`, sort: '-views', maxResults: '200',
    });
    let r;
    try {
      r = await report(token, params(STAT_METRICS));
    } catch (e) {
      if (e instanceof NoAnalyticsScope) throw e;
      // engagedViews is new (2025). If this API version will not take it,
      // the rest of the numbers still come back without it.
      console.log('[retention] stats with engagedViews failed, retrying without:', String(e).slice(0, 200));
      r = await report(token, params(STAT_METRICS.filter(m => m !== 'engagedViews')));
    }
    const at = (n: string) => r.headers.indexOf(n);
    for (const row of r.rows) {
      const get = (n: string) => { const k = at(n); return k >= 0 && row[k] != null ? Number(row[k]) : null; };
      out.set(String(row[at('video')]), {
        views: get('views'), engagedViews: get('engagedViews'),
        avgViewS: get('averageViewDuration'), avgViewPct: get('averageViewPercentage'),
        likes: get('likes'), comments: get('comments'), shares: get('shares'), subs: get('subscribersGained'),
      });
    }
  }
  return out;
}

// Views and engaged views from the Shorts feed alone. Studio's "stayed to
// watch" is about the feed: someone who opened it from search or the channel
// page almost never swipes, so counting them made Ivan's 0:41 Short read 39%
// where Studio shows 34.3%. The feed alone reads 37%, the closest the API gets.
export async function fetchFeed(token: string, videoId: string): Promise<{ views: number; engaged: number } | null> {
  const r = await report(token, {
    metrics: 'views,engagedViews', dimensions: 'insightTrafficSourceType', filters: `video==${videoId}`,
  });
  const at = (n: string) => r.headers.indexOf(n);
  const row = r.rows.find(x => x[at('insightTrafficSourceType')] === 'SHORTS');
  if (!row) return null;
  return { views: Number(row[at('views')]) || 0, engaged: Number(row[at('engagedViews')]) || 0 };
}

// The audience-retention curve: 100 points across the video whatever its
// length. Empty when the video is too new or has too few views.
export async function fetchCurve(token: string, videoId: string): Promise<CurvePoint[]> {
  const r = await report(token, {
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId}`,
  });
  const at = (n: string) => r.headers.indexOf(n);
  return r.rows
    .map(row => ({
      r: Number(row[at('elapsedVideoTimeRatio')]),
      w: Number(row[at('audienceWatchRatio')]),
      rel: at('relativeRetentionPerformance') >= 0 && row[at('relativeRetentionPerformance')] != null
        ? Number(row[at('relativeRetentionPerformance')]) : null,
    }))
    .filter(p => isFinite(p.r) && isFinite(p.w))
    .sort((a, b) => a.r - b.r);
}

// Percent still watching at second `s`, straight between the two curve
// points either side of it.
export function pctAt(curve: CurvePoint[], s: number, duration: number): number {
  if (!curve.length) return 0;
  const r = duration > 0 ? s / duration : 0;
  if (r <= curve[0].r) return curve[0].w * 100;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].r >= r) {
      const a = curve[i - 1], b = curve[i];
      const f = (r - a.r) / ((b.r - a.r) || 1);
      return (a.w + (b.w - a.w) * f) * 100;
    }
  }
  return curve[curve.length - 1].w * 100;
}

// relativeRetentionPerformance at second `s`: 0-1, how this Short holds
// people against every YouTube video of the same length (0.5 = typical).
export function relAt(curve: CurvePoint[], s: number, duration: number): number | null {
  const pts = curve.filter(p => p.rel != null);
  if (!pts.length) return null;
  const r = duration > 0 ? s / duration : 0;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.r - r) < Math.abs(best.r - r)) best = p;
  return best.rel;
}

// Index = second, 0 to the last second.
export function perSecond(curve: CurvePoint[], duration: number): number[] {
  const d = Math.max(1, Math.round(duration));
  return Array.from({ length: d + 1 }, (_, s) => pctAt(curve, s, d));
}

// Where the line falls faster than this video's own steady leak.
//
// A Short loses people all the way through; a "drop" worth naming is a
// stretch that loses them several times faster than that. Consecutive steep
// seconds are one drop, so a cliff that takes three seconds is reported as
// one cliff of three seconds and not as three small steps. Biggest first.
export function findDrops(sec: number[]): Drop[] {
  const n = sec.length;
  if (n < 3) return [];
  const loss = sec.map((v, i) => (i === 0 ? 0 : sec[i - 1] - v));
  const steadyPart = loss.slice(4).filter(x => x > 0).sort((a, b) => a - b);
  const steady = steadyPart.length ? steadyPart[Math.floor(steadyPart.length / 2)] : 0;
  const steep = Math.max(1.5, steady * 2.5);

  const out: Drop[] = [];
  let i = 1;
  while (i < n) {
    if (loss[i] < steep) { i++; continue; }
    let j = i;
    // One slower second inside a fall does not end it.
    while (j + 1 < n && (loss[j + 1] >= steep || (j + 2 < n && loss[j + 1] > 0 && loss[j + 2] >= steep))) j++;
    const from = sec[i - 1], to = sec[j];
    let steepest = i;
    for (let k = i; k <= j; k++) if (loss[k] > loss[steepest]) steepest = k;
    out.push({
      from_s: i - 1, to_s: j, from_pct: Math.round(from), to_pct: Math.round(to), lost: Math.round(from - to),
      steepest_s: steepest - 1,
    });
    i = j + 1;
  }
  return out
    .filter(d => d.lost >= 4 && d.lost >= d.from_pct * 0.06)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 4);
}

// Stretches people went back to: the line goes UP. On a Short that means they
// held or dragged back to watch it again.
export function findRises(sec: number[]): { from_s: number; to_s: number; gained: number }[] {
  const out: { from_s: number; to_s: number; gained: number }[] = [];
  let i = 1;
  while (i < sec.length) {
    if (sec[i] - sec[i - 1] <= 0.5) { i++; continue; }
    let j = i;
    while (j + 1 < sec.length && sec[j + 1] - sec[j] > 0.5) j++;
    const gained = Math.round(sec[j] - sec[i - 1]);
    if (gained >= 3) out.push({ from_s: i - 1, to_s: j, gained });
    i = j + 1;
  }
  return out.sort((a, b) => b.gained - a.gained).slice(0, 2);
}

// How a Short's curve reads, worked out on Ivan's eleven (2026-10-28):
// - it is flat for the first second or two although most of the feed swipes
//   away there, so the swipe is not on it: 100% is everyone who got past the
//   swipe, and the swipe itself is "stayed to watch";
// - whatever it starts above 100% equals, on every one of them, the share
//   that reached the end: people on their second loop, watching the start
//   again. They drop off early in the replay, so part of the first big fall
//   is replays ending, not first-time viewers leaving.
export function replayShare(sec: number[]): number {
  return Math.max(0, Math.round(sec[0] - 100));
}

// The second after which almost nobody leaves, if there is one before the
// last fifth of the video.
function flatFrom(sec: number[]): number | null {
  const n = sec.length;
  for (let s = 1; s < n * 0.8; s++) {
    const rest = sec[s] - sec[n - 1];
    if (rest <= Math.max(5, sec[s] * 0.12)) return s;
  }
  return null;
}

// At a word boundary, marked, so a cut line never reads as the real end.
const cut = (s: string, n: number) => {
  if (s.length <= n) return s;
  const head = s.slice(0, n);
  return `${head.slice(0, Math.max(head.lastIndexOf(' '), n * 0.6)).trimEnd()}...`;
};

// What was said and on screen during each drop. The beat already on screen
// when the fall starts counts: that is usually the line people left on.
export function pinDrops(drops: Drop[], beats: Beat[] | null): Drop[] {
  if (!beats?.length) return drops;
  return drops.map(d => {
    const during = beats.filter(b => b.t >= d.from_s - 0.25 && b.t < d.to_s + 0.5);
    const before = [...beats].reverse().find(b => b.t < d.from_s - 0.25);
    const span = before ? [before, ...during] : during;
    const says = span.map(b => b.says).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const shows = [...new Set(span.map(b => b.shows).filter(Boolean))].join('; ');
    return { ...d, says: cut(says, 320) || undefined, shows: cut(shows, 320) || undefined };
  });
}

// What is said and shown, by second, from the model watching the video once.
// Kept forever: the video does not change.
export async function watchBeats(videoId: string, duration: number): Promise<Beat[]> {
  const prompt = `Watch and listen to this ${duration}-second Short from the first frame to the last. Write down what is said and what is on screen, in order, with the second each thing starts.

One entry every time a new sentence or phrase starts, a cut happens, or text appears or changes on screen. Start at 0 and cover the whole video.
- t: the second it starts, as a number (0, 1.5, 12). Be exact: this is matched against a retention curve second by second.
- says: the words spoken from that moment until the next entry, word for word. Empty string if nothing is said.
- shows: what is on screen, in a few words: the shot, any on-screen text word for word, a cut or a zoom.

Answer with JSON only: {"beats":[{"t":0,"says":"...","shows":"..."}]}`;
  const raw = await watchVideo(
    { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/mp4' },
    prompt,
    { maxTokens: 4000 },
  );
  const parsed = parseModelJson<{ beats?: Array<{ t?: unknown; says?: unknown; shows?: unknown }> }>(raw, 'beats');
  return (parsed.beats ?? [])
    .map(b => ({ t: Number(b.t), says: String(b.says ?? '').trim().slice(0, 400), shows: String(b.shows ?? '').trim().slice(0, 300) }))
    .filter(b => isFinite(b.t) && b.t >= 0 && b.t <= duration + 1)
    .map(b => ({ ...b, t: round1(b.t) }))
    .sort((a, b) => a.t - b.t);
}

// The review's own beat timeline, as beats. A reviewed video gets its beats
// for free instead of a second watch.
// deno-lint-ignore no-explicit-any
export function beatsFromTimeline(timeline: any[] | null | undefined): Beat[] | null {
  if (!Array.isArray(timeline) || !timeline.length) return null;
  const toS = (at: unknown) => {
    const m = String(at ?? '').match(/(\d+):(\d{1,2}(?:\.\d+)?)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const beats = timeline
    .map(b => ({
      t: toS(b.at),
      says: /^silent$/i.test(String(b.words ?? '').trim()) ? '' : String(b.words ?? '').trim().slice(0, 400),
      shows: [b.visual, b.motion && !/static/i.test(b.motion) ? `(${b.motion})` : ''].filter(Boolean).join(' ').slice(0, 300),
    }))
    .filter(b => isFinite(b.t))
    .sort((a, b) => a.t - b.t);
  return beats.length ? beats : null;
}

// Title, length and date of one video, for one that is not in `videos` yet
// (uploaded since the last sync, or pasted). Null when YouTube does not know it.
export async function fetchVideoMeta(token: string, videoId: string): Promise<{ video_id: string; title: string; duration: number; published_at: string | null } | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const item = (await res.json()).items?.[0];
  if (!item) return null;
  const m = String(item.contentDetails?.duration ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const duration = m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  return { video_id: videoId, title: item.snippet?.title ?? videoId, duration, published_at: item.snippet?.publishedAt ?? null };
}

// Their Shorts straight from YouTube, for an account whose `videos` was never
// filled (it is written by the app, so someone who connected and left has
// none): the videos watched in the last four months, then their lengths.
export async function listShorts(token: string): Promise<{ video_id: string; title: string; duration: number; published_at: string | null }[]> {
  const start = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const r = await report(token, { startDate: start, metrics: 'views', dimensions: 'video', sort: '-views', maxResults: '50' });
  const ids = r.rows.map(x => String(x[r.headers.indexOf('video')])).filter(id => /^[\w-]{11}$/.test(id));
  if (!ids.length) return [];
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(',')}&maxResults=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  // deno-lint-ignore no-explicit-any
  return ((await res.json()).items ?? []).map((item: any) => {
    const m = String(item.contentDetails?.duration ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const duration = m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
    return { video_id: item.id, title: item.snippet?.title ?? item.id, duration, published_at: item.snippet?.publishedAt ?? null };
  })
    .filter((v: { duration: number }) => v.duration > 0 && v.duration <= MAX_SHORT_S)
    .sort((a: { published_at: string | null }, b: { published_at: string | null }) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, 40);
}

// The stored row for one of their videos, brought up to date first when it is
// old or missing and the channel is connected. What the chat reads.
export async function ownVideoRetention(
  supabase: DB, userId: string, videoId: string,
  opts: { token?: string | null; beats?: boolean; meta?: { title?: string | null; duration?: number | null; published_at?: string | null } } = {},
): Promise<{ row: RetentionRow | null; error?: 'no_scope' | 'not_connected' }> {
  const { data: have } = await supabase
    .from('video_retention').select('*').eq('user_id', userId).eq('video_id', videoId).maybeSingle();
  const row = have as RetentionRow | null;
  const age = row ? Date.now() - new Date(row.fetched_at).getTime() : Infinity;
  const fresh = age < 20 * 60 * 60 * 1000 && (!opts.beats || !!row?.beats_at || !row?.curve);
  if (fresh) return { row };

  const token = opts.token !== undefined ? opts.token : await freshAccessToken(supabase, userId);
  if (!token) return { row, error: row ? undefined : 'not_connected' };
  let meta = opts.meta?.duration ? { video_id: videoId, title: opts.meta.title ?? null, duration: opts.meta.duration, published_at: opts.meta.published_at ?? null } : null;
  if (!meta) {
    const { data: v } = await supabase.from('videos').select('title, duration, published_at')
      .eq('user_id', userId).eq('video_id', videoId).maybeSingle();
    meta = v?.duration ? { video_id: videoId, title: v.title, duration: v.duration, published_at: v.published_at } : await fetchVideoMeta(token, videoId);
  }
  if (!meta?.duration) return { row };
  try {
    return { row: (await syncOne(supabase, userId, token, meta, { beats: opts.beats })) ?? row };
  } catch (e) {
    if (e instanceof NoAnalyticsScope) return { row, error: 'no_scope' };
    console.log(`[retention] live read ${videoId} failed:`, String(e).slice(0, 200));
    return { row };
  }
}

// Fetch, read and store one video. Beats are reused when the row has them.
export async function syncOne(
  supabase: DB, userId: string, token: string,
  v: { video_id: string; title?: string | null; duration: number; published_at?: string | null },
  opts: { stats?: VideoStats | null; beats?: boolean } = {},
): Promise<RetentionRow | null> {
  const stats = opts.stats !== undefined ? opts.stats : (await fetchStats(token, [v.video_id])).get(v.video_id) ?? null;
  let curve: CurvePoint[] = [];
  let feed: { views: number; engaged: number } | null = null;
  try {
    [curve, feed] = await Promise.all([
      fetchCurve(token, v.video_id),
      fetchFeed(token, v.video_id).catch(e => {
        if (e instanceof NoAnalyticsScope) throw e;
        console.log(`[retention] feed ${v.video_id} failed:`, String(e).slice(0, 200));
        return null;
      }),
    ]);
  } catch (e) {
    if (e instanceof NoAnalyticsScope) throw e;
    console.log(`[retention] curve ${v.video_id} failed:`, String(e).slice(0, 200));
  }
  if (!stats && !curve.length) return null;

  const { data: prev } = await supabase
    .from('video_retention').select('beats, beats_at')
    .eq('user_id', userId).eq('video_id', v.video_id).maybeSingle();
  let beats: Beat[] | null = prev?.beats ?? null;
  let beatsAt: string | null = prev?.beats_at ?? null;
  if (!beats?.length && opts.beats && curve.length) {
    try {
      beats = await watchBeats(v.video_id, v.duration);
      beatsAt = new Date().toISOString();
    } catch (e) {
      console.log(`[retention] beats ${v.video_id} failed:`, String(e).slice(0, 200));
    }
  }

  const sec = curve.length ? perSecond(curve, v.duration) : null;
  const drops = sec ? pinDrops(findDrops(sec), beats) : null;
  const stayed = feed && feed.views >= 10
    ? round1((feed.engaged / feed.views) * 100)
    : stats?.engagedViews != null && stats.views
      ? round1((stats.engagedViews / stats.views) * 100) : null;

  const row: RetentionRow = {
    user_id: userId,
    video_id: v.video_id,
    title: v.title ?? null,
    published_at: v.published_at ?? null,
    duration_s: v.duration,
    views: stats?.views ?? null,
    engaged_views: stats?.engagedViews ?? null,
    feed_views: feed?.views ?? null,
    feed_engaged: feed?.engaged ?? null,
    stayed_pct: stayed,
    avg_view_s: stats?.avgViewS ?? null,
    avg_view_pct: stats?.avgViewPct != null ? round1(stats.avgViewPct) : null,
    likes: stats?.likes ?? null,
    comments: stats?.comments ?? null,
    shares: stats?.shares ?? null,
    subs_gained: stats?.subs ?? null,
    curve: curve.length ? curve.map(p => ({ r: p.r, w: Math.round(p.w * 10000) / 10000, rel: p.rel })) : null,
    drops,
    beats,
    beats_at: beatsAt,
    fetched_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('video_retention').upsert(row, { onConflict: 'user_id,video_id' });
  if (error) console.log(`[retention] store ${v.video_id} failed:`, error.message);
  return row;
}

// Beats arrived after the row was written (from a review's timeline): store
// them and pin the drops again.
export async function attachBeats(supabase: DB, row: RetentionRow, beats: Beat[]): Promise<RetentionRow> {
  const sec = row.curve?.length && row.duration_s ? perSecond(row.curve, row.duration_s) : null;
  const drops = sec ? pinDrops(findDrops(sec), beats) : row.drops;
  const next = { ...row, beats, beats_at: new Date().toISOString(), drops };
  await supabase.from('video_retention')
    .update({ beats, beats_at: next.beats_at, drops })
    .eq('user_id', row.user_id).eq('video_id', row.video_id);
  return next;
}

// Their normal: medians over their other Shorts with enough views to mean
// anything. A number means nothing without it.
export async function loadUsual(supabase: DB, userId: string, exceptVideoId?: string): Promise<Usual | null> {
  const { data } = await supabase
    .from('video_retention').select('video_id, views, stayed_pct, avg_view_pct')
    .eq('user_id', userId).gte('views', 20).limit(60);
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []).filter((r: any) => r.video_id !== exceptVideoId);
  if (rows.length < 2) return null;
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return round1(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  };
  return {
    // deno-lint-ignore no-explicit-any
    stayed: median(rows.map((r: any) => r.stayed_pct).filter((x: unknown) => x != null).map(Number)),
    // deno-lint-ignore no-explicit-any
    avgView: median(rows.map((r: any) => r.avg_view_pct).filter((x: unknown) => x != null).map(Number)),
    videos: rows.length,
  };
}

// The curve as text: every second for the first twenty, then coarser. The
// opening is where a Short is won or lost, so it gets the detail.
function curveLine(sec: number[]): string {
  const keep = sec.map((_, s) => s).filter(s => s <= 20 || (s <= 60 ? s % 2 === 0 : s % 5 === 0) || s === sec.length - 1);
  return keep.map(s => `${mmss(s)} ${Math.round(sec[s])}%`).join(' · ');
}

// The prompt block for one video. `script` adds what is said by second, for
// answers that rewrite it; a review watching the video does not need it.
export function retentionBlock(row: RetentionRow, usual: Usual | null, opts: { script?: boolean } = {}): string {
  const d = row.duration_s ?? 0;
  const head = [
    d ? `Length ${mmss(d)}` : null,
    row.views != null ? `${row.views.toLocaleString('en-US')} views` : null,
    row.stayed_pct != null ? `In the Shorts feed ${Math.round(row.stayed_pct)}% stayed to watch and ${Math.round(100 - row.stayed_pct)}% swiped away in the first seconds (YouTube's engaged views; Studio's own figure can read a few points lower)` : null,
    row.avg_view_s != null ? `Average view ${mmss(row.avg_view_s)}${row.avg_view_pct != null ? ` (${Math.round(row.avg_view_pct)}% of the video)` : ''}` : null,
  ].filter(Boolean).join('. ');

  const lines = [`## Real retention of "${row.title ?? row.video_id}" (YouTube Analytics, measured ${row.fetched_at.slice(0, 10)})`];
  if (head) lines.push(`${head}.`);
  if (usual && (usual.stayed != null || usual.avgView != null)) {
    lines.push(`Their usual, the median of their other ${usual.videos} Shorts: ${[
      usual.stayed != null ? `${Math.round(usual.stayed)}% stayed` : null,
      usual.avgView != null ? `average view ${Math.round(usual.avgView)}% of the video` : null,
    ].filter(Boolean).join(', ')}.`);
  }

  const sec = row.curve?.length && d ? perSecond(row.curve, d) : null;
  if (sec) {
    const replays = replayShare(sec);
    lines.push(`The retention curve: share still watching at each second. 100% = everyone who got past the swipe (the swipe itself is the stayed-to-watch figure and is not on this line).${replays >= 5 ? ` It starts at ${Math.round(sec[0])}% because ${replays}% are people on their second loop watching the start again; about the same share reaches the end.` : ''}`);
    lines.push(curveLine(sec));
    const drops = row.drops ?? [];
    if (drops.length) {
      lines.push('Where they left, biggest first:');
      for (const x of drops) {
        const atEnd = x.to_s >= d - 1;
        // Replays end early in the second loop, so an early fall is partly
        // them. What is left after taking all of them out is certainly
        // first-time viewers.
        const early = replays >= 8 && x.from_s < d / 2 && !atEnd;
        const firstTimers = early ? Math.max(0, x.lost - replays) : null;
        lines.push(`- ${mmss(x.from_s)} to ${mmss(x.to_s)}: ${x.from_pct}% down to ${x.to_pct}% (${x.lost} points)${x.steepest_s != null && x.to_s - x.from_s > 2 ? `, fastest from ${mmss(x.steepest_s)}` : ''}${atEnd ? ', in the last second: people swiping before it loops' : ''}${firstTimers != null ? `. Part of this is replays ending; at least ${firstTimers} of the ${x.lost} points are first-time viewers leaving` : ''}${x.says ? `. Said there: "${x.says}"` : ''}${x.shows ? `. On screen: ${x.shows}` : ''}`);
      }
    } else {
      lines.push('No stretch loses people faster than the rest: the line falls evenly.');
    }
    const rises = findRises(sec);
    for (const r of rises) lines.push(`- ${mmss(r.from_s)} to ${mmss(r.to_s)}: the line goes UP ${r.gained} points, people watched this part again.`);
    const flat = flatFrom(sec);
    if (flat != null && flat < d) lines.push(`From ${mmss(flat)} on the line is nearly flat: whoever got past ${mmss(flat)} stayed.`);
    // Against every YouTube video of this length, where it matters most: the
    // opening, the bottom of the biggest drop, the end.
    const marks = [...new Set([3, drops[0]?.to_s, Math.round(d * 0.97)].filter((x): x is number => x != null && x <= d))];
    const rel = marks.map(s => ({ s, v: relAt(row.curve!, s, d) })).filter(x => x.v != null);
    if (rel.length) lines.push(`Against all YouTube videos of this length, it holds people better than ${rel.map(x => `${Math.round(x.v! * 100)}% of them at ${mmss(x.s)}`).join(', ')} (50% = typical).`);
  } else {
    lines.push('No retention curve yet (too new or too few views). Only the numbers above are measured.');
  }

  if (opts.script && row.beats?.length) {
    lines.push('What is said and shown, by second:');
    let used = 0;
    for (const b of row.beats) {
      const l = `${mmss(b.t)} ${b.says ? `"${b.says}"` : '(no words)'}${b.shows ? ` [${b.shows}]` : ''}`;
      if (used + l.length > 2400) { lines.push('(rest cut for length)'); break; }
      lines.push(l);
      used += l.length;
    }
  }

  lines.push('These numbers are measured, not estimated. Every drop you mention must be one of the drops listed here, with these seconds and these numbers. Never describe a drop, dip or stall at any other second and never work one out from the footage. A slow part you notice yourself is "slow", not a place where viewers left.');
  return lines.join('\n');
}
