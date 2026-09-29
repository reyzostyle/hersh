// What "normal" means for a channel: the median views of its Shorts that have
// finished performing. Shared by the Ideas feed (fetch-competitor-ideas), which
// scores a tracked channel's whole pool against it, and steal-video, which
// scores the one Short someone pressed Steal on - so "31x" means the same thing
// wherever it is printed.

export const MAX_SHORT_SECONDS = 180; // YouTube's current ceiling for a Short
export const BASELINE_SIZE = 50;      // uploads pulled to establish "normal" (videos.list caps at 50 ids)
export const MIN_BASELINE = 5;        // below this the median is noise
// A video published yesterday has barely any views yet; letting it into the
// median drags the median toward zero and inflates every multiplier.
export const BASELINE_MIN_AGE_DAYS = 7;

// "PT1M30S" -> 90. Returns null when the duration is missing or unparseable,
// which is treated as "not a Short" rather than guessed at.
export function parseDurationSeconds(iso: string | undefined): number | null {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, min, s] = m;
  return Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(min || 0) * 60 + Number(s || 0);
}

// Streams and long-form uploads are a different game from Shorts, and mixing
// them in skews the median. A finished stream reports liveBroadcastContent
// "none", so its presence in liveStreamingDetails is what identifies it.
// deno-lint-ignore no-explicit-any
export function isShort(item: any): boolean {
  if (item.liveStreamingDetails) return false;
  const seconds = parseDurationSeconds(item.contentDetails?.duration);
  return seconds !== null && seconds > 0 && seconds <= MAX_SHORT_SECONDS;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function ageDays(publishedAt: string): number {
  return (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
}

// One decimal under 10x, whole numbers above: "2.4x", "31x".
export function roundScore(score: number): number {
  return score >= 10 ? Math.round(score) : Math.round(score * 10) / 10;
}

// The channel's median Short views, or null when there is too little finished
// history to call anything normal. Three Data API reads (1 unit each).
export async function channelShortsMedian(channelId: string, apiKey: string): Promise<number | null> {
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=contentDetails&key=${apiKey}`,
  );
  if (!channelRes.ok) return null;
  const uploads = (await channelRes.json()).items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return null;

  const listRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploads}&part=contentDetails&maxResults=${BASELINE_SIZE}&key=${apiKey}`,
  );
  if (!listRes.ok) return null;
  // deno-lint-ignore no-explicit-any
  const ids = ((await listRes.json()).items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean).slice(0, 50);
  if (ids.length === 0) return null;

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${ids.join(',')}&part=snippet,statistics,contentDetails,liveStreamingDetails&key=${apiKey}`,
  );
  if (!statsRes.ok) return null;
  const views = ((await statsRes.json()).items || [])
    .filter(isShort)
    // deno-lint-ignore no-explicit-any
    .filter((v: any) => v.snippet?.publishedAt && ageDays(v.snippet.publishedAt) >= BASELINE_MIN_AGE_DAYS)
    // deno-lint-ignore no-explicit-any
    .map((v: any) => parseInt(v.statistics?.viewCount || '0', 10));
  if (views.length < MIN_BASELINE) return null;
  const m = median(views);
  return m > 0 ? m : null;
}
