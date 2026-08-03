import { supabase, getSessionToken } from './supabase';

// ─── Rank system ──────────────────────────────────────────────────────────────
// Season = calendar month. RP sources (theoretical max 1200):
//   Own videos  — top-10 unique videos × best score × 0.6, capped at 600.
//                 Calibration: the first 3 unique own videos of a season earn
//                 ×1.5 (the cap still applies, so it speeds up, not raises).
//   Channel     — views of videos published this season on a log scale (≤200)
//                 + engagement (likes+comments)/views vs a 5% benchmark (≤100).
//   Learning    — other-creator analyses 8 RP (cap 25) + hook checks 1 RP
//                 (cap 100). Deliberately the weakest source.
//   Carryover   — 25% of last season's final RP (soft reset, like ranked games).

export const TIERS = [
  { name: 'Iron', min: 0 },
  { name: 'Bronze', min: 100 },
  { name: 'Silver', min: 250 },
  { name: 'Gold', min: 400 },
  { name: 'Platinum', min: 550 },
  { name: 'Diamond', min: 700 },
  { name: 'Master', min: 850 },
  { name: 'Viral', min: 1000 },
] as const;

export interface RankBreakdown {
  own: number;
  channel: number;
  channelViews: number;
  channelEngagement: number;
  learning: number;
  learningOthers: number;
  learningHooks: number;
  carryover: number;
  total: number;
}

export interface RadarAxes {
  hook: number;        // avg AI hook score, 0-100
  retention: number;   // real channel retention %, AI fallback
  engagement: number;  // (likes+comments)/views vs 5% benchmark
  views: number;       // season views, log scale
  consistency: number; // unique own videos analyzed, 5+ = 100
}

export interface RankData {
  season: string;           // 'YYYY-MM'
  rp: number;
  tier: string;
  division: string | null;  // 'III' | 'II' | 'I' | null for Master/Viral
  nextTierAt: number | null;
  progressPct: number;      // progress within current tier, 0-100
  breakdown: RankBreakdown;
  radar: RadarAxes;
  calibrationUsed: number;  // 0-3 own-video calibration slots used
  ownVideosCounted: number; // unique own videos this season
  youtubeConnected: boolean;
  daysLeft: number;
  rpBoostMultiplier: number; // 1 when no voucher boost is active this season
}

export function seasonOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function seasonRange(season: string): { start: string; end: string } {
  const [y, m] = season.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function prevSeason(season: string): string {
  const [y, m] = season.split('-').map(Number);
  return seasonOf(new Date(y, m - 2, 15));
}

export function tierFor(rp: number): { tier: string; division: string | null; nextTierAt: number | null; progressPct: number } {
  let idx = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (rp >= TIERS[i].min) { idx = i; break; }
  }
  const t = TIERS[idx];
  const next = TIERS[idx + 1] ?? null;
  const span = next ? next.min - t.min : 0;
  let division: string | null = null;
  if (next && t.name !== 'Master') {
    const third = span / 3;
    division = rp < t.min + third ? 'III' : rp < t.min + 2 * third ? 'II' : 'I';
  }
  return {
    tier: t.name,
    division,
    nextTierAt: next ? next.min : null,
    progressPct: next ? Math.min(100, Math.round(((rp - t.min) / span) * 100)) : 100,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// 100 views → 0, 1k → 25%, 10k → 50%, 100k → 75%, 1M+ → 100% of `max`
function viewsScale(views: number, max: number): number {
  if (views < 100) return 0;
  return Math.round(clamp((Math.log10(views) - 2) / 4, 0, 1) * max);
}

interface SeasonAnalysisRow {
  video_ids: string[] | null;
  video_title: string | null;
  is_my_video: boolean | null;
  created_at: string;
  hook_analysis: { overall_score?: number; score_breakdown?: { hook?: number; retention?: number } | null } | null;
}

// Pure math for one season's analyses + channel stats. `hooksUsed` comes from
// the monthly counter (no per-event log exists), close enough to the season.
// `multiplier` (from a redeemed MU15-style voucher) speeds up reaching each
// source's cap — it's applied to the raw pre-cap value, so it never lets a
// source exceed its usual max (600/300/300).
function computeSeasonRP(
  rows: SeasonAnalysisRow[],
  hooksUsed: number,
  seasonVideos: { views: number; likes_count: number; comment_count: number; retention_percentage: number }[],
  carryover: number,
  multiplier = 1,
) {
  // Own videos: best score per unique video, chronological first-seen order
  const byVideo = new Map<string, { best: number; hook: number; retention: number; firstSeen: number }>();
  let othersCount = 0;
  for (const r of rows) {
    const score = Number(r.hook_analysis?.overall_score ?? 0);
    if (!r.is_my_video) { othersCount++; continue; }
    const key = r.video_ids?.[0] || r.video_title || `row-${r.created_at}`;
    const seen = byVideo.get(key);
    const hook = Number(r.hook_analysis?.score_breakdown?.hook ?? 0);
    const retention = Number(r.hook_analysis?.score_breakdown?.retention ?? 0);
    if (!seen) {
      byVideo.set(key, { best: score, hook, retention, firstSeen: new Date(r.created_at).getTime() });
    } else if (score > seen.best) {
      seen.best = score; seen.hook = hook; seen.retention = retention;
    }
  }

  const videos = [...byVideo.values()].sort((a, b) => a.firstSeen - b.firstSeen);
  const calibrationUsed = Math.min(3, videos.length);
  const points = videos
    .map((v, i) => v.best * 0.6 * (i < 3 ? 1.5 : 1))
    .sort((a, b) => b - a)
    .slice(0, 10);
  const own = Math.min(600, Math.round(points.reduce((s, p) => s + p, 0) * multiplier));

  const learningOthers = Math.min(200, Math.round(Math.min(25, othersCount) * 8 * multiplier));
  const learningHooks = Math.min(100, Math.round(Math.min(100, hooksUsed) * multiplier));
  const learning = learningOthers + learningHooks;

  const totalViews = seasonVideos.reduce((s, v) => s + (v.views || 0), 0);
  const totalLikes = seasonVideos.reduce((s, v) => s + (v.likes_count || 0), 0);
  const totalComments = seasonVideos.reduce((s, v) => s + (v.comment_count || 0), 0);
  const er = totalViews > 0 ? (totalLikes + totalComments) / totalViews : 0;
  const channelViews = Math.min(200, Math.round(viewsScale(totalViews, 200) * multiplier));
  const channelEngagement = Math.min(100, Math.round(clamp(er / 0.05, 0, 1) * 100 * multiplier));
  const channel = channelViews + channelEngagement;

  const total = own + channel + learning + carryover;

  // Radar axes (0-100)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const retentions = seasonVideos.map(v => v.retention_percentage).filter(r => r > 0);
  const radar: RadarAxes = {
    hook: Math.round(avg(videos.map(v => (v.hook / 30) * 100))),
    retention: Math.round(retentions.length ? avg(retentions) : avg(videos.map(v => (v.retention / 25) * 100))),
    engagement: channelEngagement,
    views: viewsScale(totalViews, 100),
    consistency: Math.round(clamp(videos.length / 5, 0, 1) * 100),
  };

  return {
    breakdown: {
      own, channel, channelViews, channelEngagement,
      learning, learningOthers, learningHooks,
      carryover, total,
    } as RankBreakdown,
    radar,
    calibrationUsed,
    ownVideosCounted: videos.length,
  };
}

async function fetchSeasonInputs(userId: string, season: string) {
  const { start, end } = seasonRange(season);
  const [{ data: rows }, { data: vids }] = await Promise.all([
    supabase
      .from('analyses')
      .select('video_ids, video_title, is_my_video, created_at, hook_analysis')
      .eq('user_id', userId)
      .gte('created_at', start)
      .lt('created_at', end),
    supabase
      .from('videos')
      .select('views, likes_count, comment_count, retention_percentage, published_at')
      .eq('user_id', userId)
      .gte('published_at', start)
      .lt('published_at', end),
  ]);
  return { rows: (rows ?? []) as SeasonAnalysisRow[], vids: vids ?? [] };
}

export async function fetchRank(userId: string): Promise<RankData> {
  const now = new Date();
  const season = seasonOf(now);
  const prev = prevSeason(season);

  const [{ data: tokenRow }, { data: history }] = await Promise.all([
    supabase.from('user_tokens').select('hooks_used, access_token, rank_boost_season, rank_boost_multiplier').eq('user_id', userId).maybeSingle(),
    supabase.from('rank_history').select('season, rp').eq('user_id', userId).in('season', [prev, prevSeason(prev)]),
  ]);

  // A redeemed boost is scoped to a single season; it only applies to
  // whichever of prev/current season it was redeemed for.
  const boostFor = (s: string) => (tokenRow?.rank_boost_season === s ? (tokenRow?.rank_boost_multiplier || 1) : 1);

  // Lazily finalize last season on first visit of a new month (hook count for
  // a past season isn't recoverable from the counter, so it counts as 0 there).
  let prevRow = history?.find(h => h.season === prev) ?? null;
  if (!prevRow) {
    const { rows, vids } = await fetchSeasonInputs(userId, prev);
    if (rows.length > 0 || vids.length > 0) {
      const prevPrevRp = history?.find(h => h.season === prevSeason(prev))?.rp ?? 0;
      const res = computeSeasonRP(rows, 0, vids, Math.floor(prevPrevRp * 0.25), boostFor(prev));
      const { error } = await supabase.from('rank_history').insert({
        user_id: userId,
        season: prev,
        rp: res.breakdown.total,
        tier: tierFor(res.breakdown.total).tier,
        breakdown: res.breakdown,
      });
      if (!error) prevRow = { season: prev, rp: res.breakdown.total };
    }
  }

  const carryover = Math.floor((prevRow?.rp ?? 0) * 0.25);
  const { rows, vids } = await fetchSeasonInputs(userId, season);
  const res = computeSeasonRP(rows, tokenRow?.hooks_used ?? 0, vids, carryover, boostFor(season));
  const t = tierFor(res.breakdown.total);

  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    season,
    rp: res.breakdown.total,
    ...t,
    breakdown: res.breakdown,
    radar: res.radar,
    calibrationUsed: res.calibrationUsed,
    ownVideosCounted: res.ownVideosCounted,
    youtubeConnected: !!tokenRow?.access_token,
    daysLeft: Math.max(1, Math.ceil((monthEnd.getTime() - now.getTime()) / 86400000)),
    rpBoostMultiplier: boostFor(season),
  };
}

const SYNC_STALE_MS = 6 * 60 * 60 * 1000; // 6h

// Pulls fresh views/likes/comments/retention for the connected channel's
// Shorts via the fetch-youtube-data edge function, if the last sync is stale
// or has never run. Powers the "Channel" RP source and the Retention/Views/
// Engagement radar axes with real data instead of the AI-estimate fallback.
// Returns true if a sync actually ran (caller should refetch rank data).
export async function syncYouTubeIfStale(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_tokens')
    .select('access_token, youtube_synced_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.access_token) return false;

  const lastSync = data.youtube_synced_at ? new Date(data.youtube_synced_at).getTime() : 0;
  if (Date.now() - lastSync < SYNC_STALE_MS) return false;

  const token = await getSessionToken();
  if (!token) return false;

  try {
    const res = await fetch('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/fetch-youtube-data', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
