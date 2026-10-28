// The creator's own Shorts as the retention screen reads them: the rows
// sync-retention writes into video_retention, and the same arithmetic the
// prompts use (supabase/functions/_shared/retention.ts), so the screen and the
// chat can never disagree about where people left.

import { OPEN_RETENTION_KEY } from './intents';

export interface CurvePoint { r: number; w: number; rel: number | null }
export interface Drop {
  from_s: number; to_s: number;
  from_pct: number; to_pct: number;
  lost: number;
  steepest_s?: number;
  says?: string; shows?: string;
}
export interface Beat { t: number; says: string; shows: string }

export interface RetentionRow {
  video_id: string;
  title: string | null;
  published_at: string | null;
  duration_s: number | null;
  views: number | null;
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

// What the list needs: everything but the transcript, plus its first line for
// Shorts titled with hashtags only.
export type RetentionListRow = Omit<RetentionRow, 'beats'> & { first_words: string | null };

export const LIST_COLUMNS = 'video_id, title, published_at, duration_s, views, stayed_pct, avg_view_s, avg_view_pct, likes, comments, shares, subs_gained, curve, drops, beats_at, fetched_at, first_words:beats->0->>says';

export const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// A moment inside the video, the way the player's own clock shows it: 1.5s
// is still 0:01.
export const clock = (s: number) => mmss(Math.floor(s));

// Percent still watching at second `s`, straight between the two curve points
// either side of it. Same as the server's pctAt.
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

// How it holds people against every YouTube video of the same length, 0-1.
export function relAt(curve: CurvePoint[], s: number, duration: number): number | null {
  const pts = curve.filter(p => p.rel != null);
  if (!pts.length) return null;
  const r = duration > 0 ? s / duration : 0;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.r - r) < Math.abs(best.r - r)) best = p;
  return best.rel;
}

// Whatever the curve starts above 100% is people on their second loop: on
// every Short checked it equals the share that reached the end.
export const replayShare = (curve: CurvePoint[]) => Math.max(0, Math.round(curve[0].w * 100 - 100));

// The line being said at second `t`: the last beat that started by then.
export function beatAt(beats: Beat[] | null, t: number): Beat | null {
  if (!beats?.length) return null;
  let at: Beat | null = null;
  for (const b of beats) {
    if (b.t <= t + 0.05) at = b;
    else break;
  }
  return at ?? beats[0];
}

// The lines said through a drop, the one already playing when the fall
// starts included: that is usually the line people left on. The same span the
// server pins to each drop (pinDrops), kept as lines instead of one string.
export function beatsIn(beats: Beat[] | null, d: Drop): Beat[] {
  if (!beats?.length) return [];
  const during = beats.filter(b => b.t >= d.from_s - 0.25 && b.t < d.to_s + 0.5);
  const before = [...beats].reverse().find(b => b.t < d.from_s - 0.25);
  return before ? [before, ...during] : during;
}

// Which drop second `t` falls inside, if any.
export const dropAt = (drops: Drop[] | null, t: number) =>
  drops?.find(d => t >= d.from_s && t <= d.to_s) ?? null;

// Titles that came through YouTube's search API arrive HTML-escaped
// ("your video&#39;s").
const decodeEntities = (s: string) =>
  s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// A Short's name on screen. Plenty are titled with hashtags only
// ("#ai #reyzostyle"), and the first thing said is what the creator
// remembers it by.
export function labelOf(row: { title: string | null; first_words?: string | null; beats?: Beat[] | null }): string {
  const bare = decodeEntities(row.title ?? '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
  if (bare) return bare;
  const said = (row.first_words ?? row.beats?.[0]?.says ?? '').trim();
  if (said) return said.length > 60 ? `${said.slice(0, 60).replace(/\s+\S*$/, '')}...` : said;
  return row.title?.trim() || 'Untitled Short';
}

// Their normal over the other Shorts with enough views to mean anything. The
// same rule as the server's loadUsual.
export function usualOf(rows: RetentionListRow[], exceptId?: string): { stayed: number | null; avgView: number | null; videos: number } | null {
  const pool = rows.filter(r => r.video_id !== exceptId && (r.views ?? 0) >= 20);
  if (pool.length < 2) return null;
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return Math.round(m * 10) / 10;
  };
  return {
    stayed: median(pool.map(r => r.stayed_pct).filter((x): x is number => x != null).map(Number)),
    avgView: median(pool.map(r => r.avg_view_pct).filter((x): x is number => x != null).map(Number)),
    videos: pool.length,
  };
}

// Opening the screen, on one Short when one is named (a review in the chat):
// the id waits under OPEN_RETENTION_KEY for the screen to pick up.
export function openRetention(videoId?: string) {
  // The extension's side panel is not the app and has no tabs, and its
  // storage is not the app's either: the Short opens in a tab of its own.
  if (window.location.pathname === '/panel') {
    window.open(`${window.location.origin}/${videoId ? `?retention=${videoId}` : ''}`, '_blank', 'noopener');
    return;
  }
  try {
    if (videoId) localStorage.setItem(OPEN_RETENTION_KEY, videoId);
  } catch { /* opens on the list instead */ }
  window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'retention' }));
}
