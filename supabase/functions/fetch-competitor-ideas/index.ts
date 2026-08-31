import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Refreshes the competitor video POOL. Nothing here reads a transcript, calls a
// model or spends a credit - it is public YouTube data and arithmetic.
//
// This function used to do the whole job: find outliers AND have the model
// write an angle for each one, billing a credit per video, before the user had
// seen anything. That is what capped the feed at eight videos per channel
// inside a two-week window, and why triaging the inbox emptied it. Now it fills
// a pool the feed can draw from indefinitely, and enrich-competitor-video runs
// the model on the one video the user actually picked.
//
// The name is unchanged on purpose: the client calls it by this path, and the
// browser and the functions deploy separately, so renaming would break the feed
// for the length of whichever deploy landed second.

async function getUserIdFromToken(supabase: any, token: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('invalid token');
  return user.id;
}

// A video is worth surfacing when it out-performs what this channel normally
// does. The obvious way to normalise for age is views-per-day, and that is what
// this used to do - but it is wrong for Shorts, and badly so. A Short collects
// almost all of its views in the first week, so dividing by lifetime makes the
// number collapse as the video ages: on a live pool, Cluely's 4.2M-view Short
// from four months ago scored 70x while a 1.1M-view one from four days ago
// scored 552x. The metric was measuring age, and "Top outliers" had quietly
// become "Newest".
//
// So: compare total views against the channel's median total views, and only
// judge videos that have had a fair run at it. A two-day-old Short has not
// beaten anything yet; it enters the pool a week later, on the same footing as
// everything else, because the pool is rebuilt hourly and spans the last 50
// uploads either way.
const BASELINE_SIZE = 50;      // uploads pulled to establish "normal" (videos.list caps at 50 ids)
const OUTLIER_THRESHOLD = 1.5; // times the channel's median views
const POOL_PER_CHANNEL = 30;   // how deep the pool goes per channel
const MIN_BASELINE = 5;        // below this the median is noise, so don't filter on it

// English only. Auto-find pulled in a Portuguese channel and its videos landed
// in the feed, which is worse than useless: an idea you cannot read is an idea
// you cannot adapt. Videos that declare no language at all are KEPT - plenty of
// creators never set the field, and dropping them would empty the feed to
// enforce a rule most uploads do not answer.
function isEnglish(item: any): boolean {
  const lang = item.snippet?.defaultAudioLanguage || item.snippet?.defaultLanguage;
  return !lang || String(lang).toLowerCase().startsWith('en');
}
// Applies to the BASELINE only, not to what gets surfaced. A video published
// yesterday has barely any views yet, so letting it into the median drags the
// median toward zero and inflates every multiplier on the channel. Keeping it
// out of the FEED as well was a mistake: under this formula a fresh video is
// understated, not overstated, so it can be shown honestly the day it goes up
// and simply climbs as its views land.
const BASELINE_MIN_AGE_DAYS = 7;

// A channel synced this recently is left alone, no matter who asked. Two
// creators tracking the same competitor cost one API call between them, which
// is what keeps the daily quota from scaling with the subscriber count.
const CHANNEL_SYNC_TTL_MS = 60 * 60 * 1000;

interface PoolVideo {
  videoId: string;
  title: string;
  views: number;
  publishedAt: string;
  outlierScore: number | null;
}

const MAX_SHORT_SECONDS = 180; // YouTube's current ceiling for a Short

// "PT1M30S" -> 90. Returns null when the duration is missing or unparseable,
// which is treated as "not a Short" rather than guessed at.
function parseDurationSeconds(iso: string | undefined): number | null {
  const m = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso || '');
  if (!m) return null;
  const [, d, h, min, s] = m;
  return Number(d || 0) * 86400 + Number(h || 0) * 3600 + Number(min || 0) * 60 + Number(s || 0);
}

// Streams and long-form uploads are a different game from Shorts, and mixing
// them in also skews the channel's median: a Short compared against an average
// that includes 20-minute videos is being measured against the wrong baseline.
// A finished stream reports liveBroadcastContent "none", so its presence in
// liveStreamingDetails is what actually identifies it.
function isShort(item: any): boolean {
  if (item.liveStreamingDetails) return false;
  const seconds = parseDurationSeconds(item.contentDetails?.duration);
  return seconds !== null && seconds > 0 && seconds <= MAX_SHORT_SECONDS;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function ageDays(publishedAt: string): number {
  return (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
}

async function fetchChannelPool(
  channelId: string,
  ytApiKey: string,
): Promise<{ videos: PoolVideo[]; medianViews: number }> {
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=contentDetails&key=${ytApiKey}`
  );
  if (!channelRes.ok) throw new Error(`YouTube channels API error: ${await channelRes.text()}`);
  const channelData = await channelRes.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return { videos: [], medianViews: 0 };

  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=snippet,contentDetails&maxResults=${BASELINE_SIZE}&key=${ytApiKey}`
  );
  if (!playlistRes.ok) throw new Error(`YouTube playlistItems API error: ${await playlistRes.text()}`);
  const playlistData = await playlistRes.json();
  const videoIds = (playlistData.items || [])
    .map((item: any) => item.contentDetails?.videoId)
    .filter(Boolean)
    .slice(0, 50); // videos.list caps at 50 ids per call

  if (videoIds.length === 0) return { videos: [], medianViews: 0 };

  // One stats call covers the whole baseline (same quota cost as fetching five).
  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.join(',')}&part=snippet,statistics,contentDetails,liveStreamingDetails&key=${ytApiKey}`
  );
  if (!statsRes.ok) throw new Error(`YouTube videos API error: ${await statsRes.text()}`);
  const statsData = await statsRes.json();

  const shorts = (statsData.items || [])
    .filter(isShort)
    .filter(isEnglish)
    .map((item: any) => ({
      videoId: item.id,
      title: item.snippet.title,
      views: parseInt(item.statistics?.viewCount || '0', 10),
      publishedAt: item.snippet.publishedAt,
    }))
    .filter((v: any) => v.publishedAt);

  // What "normal" means for this channel is decided by videos that have
  // finished performing. What gets SHOWN is every short, measured against that.
  const baseline = shorts.filter((v: any) => ageDays(v.publishedAt) >= BASELINE_MIN_AGE_DAYS);

  if (shorts.length === 0) return { videos: [], medianViews: 0 };

  const medianViews = median(baseline.map((v: any) => v.views));

  // Too little history (or a channel with no views at all) to call anything an
  // outlier - pool the most recent handful unscored rather than nothing.
  if (baseline.length < MIN_BASELINE || medianViews <= 0) {
    const recent = [...shorts]
      .sort((a: any, b: any) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, POOL_PER_CHANNEL)
      .map((v: any) => ({
        videoId: v.videoId, title: v.title, views: v.views,
        publishedAt: v.publishedAt, outlierScore: null,
      }));
    return { videos: recent, medianViews: 0 };
  }

  // No age limit either way. A video that tripled its channel is worth seeing
  // whether it went up yesterday or in March: the old 14-day ceiling is half of
  // why the inbox used to run dry, and a floor would have hidden exactly the
  // thing people open this tab for. Age is an input to the feed's sort, never a
  // gate on what exists.
  const videos = shorts
    .map((v: any) => ({ ...v, outlierScore: v.views / medianViews }))
    .filter((v: any) => v.outlierScore >= OUTLIER_THRESHOLD)
    .sort((a: any, b: any) => b.outlierScore - a.outlierScore)
    .slice(0, POOL_PER_CHANNEL)
    .map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      views: v.views,
      publishedAt: v.publishedAt,
      outlierScore: Math.round(v.outlierScore * 10) / 10,
    }));

  return { videos, medianViews };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ytApiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!ytApiKey) throw new Error('YouTube API key not configured');

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    let userId: string;
    try {
      userId = await getUserIdFromToken(supabase, authHeader.replace('Bearer ', ''));
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders });
    }

    // No plan gate: building the pool is YouTube reads and arithmetic, it costs
    // no credits, and a feature nobody can look at before paying does not sell
    // itself. What separates the plans here is how many channels you may track
    // (add-competitor-channel) and the credits the paid steps spend.

    let onlyChannelId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.channelId === 'string') onlyChannelId = body.channelId;
    } catch { /* no body / not JSON - a normal refresh */ }

    // The 12h rate limit and the idle throttle that used to guard this endpoint
    // are gone with the thing they were guarding. They existed because every
    // refresh spent credits on model calls; a refresh is now three YouTube
    // reads per stale channel, and the hour-long per-channel TTL below is what
    // keeps that honest.
    let channelsQuery = supabase.from('competitor_channels').select('*').eq('user_id', userId);
    if (onlyChannelId) channelsQuery = channelsQuery.eq('channel_id', onlyChannelId);
    const { data: channels, error: channelsError } = await channelsQuery;
    if (channelsError) throw channelsError;

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ success: true, videos: [], refreshed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const channelIds = channels.map((c: any) => c.channel_id);
    const { data: syncRows } = await supabase
      .from('competitor_channel_pool').select('channel_id, synced_at').in('channel_id', channelIds);
    const syncedAt = new Map((syncRows ?? []).map((r: any) => [r.channel_id, new Date(r.synced_at).getTime()]));

    let refreshed = 0;
    const failures: string[] = [];

    for (const channel of channels) {
      const last = syncedAt.get(channel.channel_id);
      if (last && Date.now() - last < CHANNEL_SYNC_TTL_MS) continue;

      let result: { videos: PoolVideo[]; medianViews: number };
      try {
        result = await fetchChannelPool(channel.channel_id, ytApiKey);
      } catch (e) {
        console.error(`[pool] ${channel.channel_id} failed:`, e);
        failures.push(channel.channel_name || channel.channel_id);
        continue;
      }

      // Prune first. Upsert alone can only ever add: rows pooled under an older
      // rule stayed forever, so tightening the filter (English only, a new
      // scoring formula) left the feed carrying videos it would no longer
      // accept. The pool is derived data, so the refresh is allowed to be
      // authoritative about what belongs in it.
      const keep = new Set(result.videos.map(v => v.videoId));
      const { data: pooled } = await supabase
        .from('competitor_videos').select('video_id').eq('channel_id', channel.channel_id);
      const stale = (pooled ?? []).map((r: any) => r.video_id).filter((id: string) => !keep.has(id));
      if (stale.length) {
        await supabase.from('competitor_videos').delete().in('video_id', stale);
      }

      if (result.videos.length > 0) {
        const { error: upsertError } = await supabase.from('competitor_videos').upsert(
          result.videos.map(v => ({
            video_id: v.videoId,
            channel_id: channel.channel_id,
            channel_name: channel.channel_name,
            title: v.title,
            views: v.views,
            published_at: v.publishedAt,
            outlier_score: v.outlierScore,
            refreshed_at: new Date().toISOString(),
          })),
          { onConflict: 'video_id' },
        );
        if (upsertError) console.error('[pool] upsert error:', upsertError);
      }

      await supabase.from('competitor_channel_pool').upsert({
        channel_id: channel.channel_id,
        synced_at: new Date().toISOString(),
        median_views: result.medianViews,
        video_count: result.videos.length,
      }, { onConflict: 'channel_id' });

      refreshed++;
    }

    // The whole pool for the tracked channels, not just what this run touched -
    // the caller renders the feed off this, and most refreshes legitimately
    // touch nothing because another user already synced the same channel.
    const { data: videos, error: videosError } = await supabase
      .from('competitor_videos')
      .select('*')
      .in('channel_id', channelIds)
      .order('outlier_score', { ascending: false, nullsFirst: false });
    if (videosError) throw videosError;

    return new Response(
      JSON.stringify({
        success: true,
        videos: videos || [],
        refreshed,
        message: failures.length
          ? `Could not reach YouTube for ${failures.join(', ')}. The rest is up to date.`
          : refreshed === 0
            ? 'Already up to date. Competitor channels refresh at most once an hour.'
            : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fetch-competitor-ideas] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
