import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { analyzeVideo } from '../_shared/analyze-video.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  videoId: string; // YouTube video ID
  videoContext?: string;
}

async function fetchPublicVideoData(videoId: string, accessTokenOrApiKey: string, useApiKey = false): Promise<any> {
  const url = useApiKey
    ? `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,statistics,contentDetails&key=${accessTokenOrApiKey}`
    : `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,statistics,contentDetails`;
  const res = await fetch(url, useApiKey ? {} : { headers: { Authorization: `Bearer ${accessTokenOrApiKey}` } });
  if (!res.ok) throw new Error(`YouTube API error: ${await res.text()}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('Video not found on YouTube');

  // Parse ISO 8601 duration (PT1M30S → 90)
  const dur = item.contentDetails.duration || 'PT0S';
  const durMatch = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const durationSec = durMatch
    ? (parseInt(durMatch[1] || '0') * 3600 + parseInt(durMatch[2] || '0') * 60 + parseInt(durMatch[3] || '0'))
    : 0;

  return {
    video_id: videoId,
    channel_id: item.snippet.channelId,
    title: item.snippet.title,
    thumbnail_url: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    views: parseInt(item.statistics.viewCount || '0'),
    likes_count: parseInt(item.statistics.likeCount || '0'),
    comment_count: parseInt(item.statistics.commentCount || '0'),
    duration: durationSec,
    retention_percentage: null,
    average_view_duration: null,
    is_external: true,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('YOUTUBE_CLIENT_ID')!,
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const tokens = await res.json();
  return tokens.access_token;
}

// The connected account's own channel id (authoritative for ownership).
async function getOwnChannelId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// Pull the audience-retention curve + summary for one of the user's OWN videos
// via the YouTube Analytics API (requires the yt-analytics.readonly scope).
// Returns null if the scope is missing (403), the video isn't owned, or there's
// no data yet (too new / too few views).
async function fetchOwnRetention(accessToken: string, videoId: string): Promise<{
  averageViewPercentage: number | null;
  averageViewDuration: number | null;
  curve: { t: number; watch: number }[];
} | null> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const auth = { headers: { Authorization: `Bearer ${accessToken}` } };
  const base = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&filters=video==${videoId}`;

  let averageViewPercentage: number | null = null;
  let averageViewDuration: number | null = null;
  try {
    const res = await fetch(`${base}&metrics=averageViewDuration,averageViewPercentage&dimensions=video`, auth);
    if (res.ok) {
      const d = await res.json();
      if (d.rows?.length) {
        averageViewDuration = Math.round(d.rows[0][1]) || null;
        averageViewPercentage = Math.round(d.rows[0][2]) || null;
      }
    }
  } catch { /* ignore */ }

  let curve: { t: number; watch: number }[] = [];
  try {
    const res = await fetch(`${base}&metrics=audienceWatchRatio&dimensions=elapsedVideoTimeRatio`, auth);
    if (res.ok) {
      const d = await res.json();
      curve = (d.rows || [])
        .map((r: number[]) => ({ t: r[0], watch: r[1] }))
        .sort((a: { t: number }, b: { t: number }) => a.t - b.t);
    }
  } catch { /* ignore */ }

  if (averageViewPercentage == null && curve.length === 0) return null;
  return { averageViewPercentage, averageViewDuration, curve };
}

// Turn the retention curve into a short, human-readable list of the biggest
// viewer drop-offs for the analysis prompt.
function summarizeRetentionDrops(curve: { t: number; watch: number }[]): string {
  if (!curve || curve.length < 2) return '';
  const segs: { at: number; drop: number }[] = [];
  for (let i = 1; i < curve.length; i++) {
    const drop = curve[i - 1].watch - curve[i].watch; // positive = viewers left
    if (drop > 0) segs.push({ at: curve[i].t, drop });
  }
  segs.sort((a, b) => b.drop - a.drop);
  const top = segs.slice(0, 3).filter(s => s.drop >= 0.03); // ignore <3% noise
  if (top.length === 0) return '';
  return top
    .map(s => `at ~${Math.round(s.at * 100)}% of the video: -${Math.round(s.drop * 100)}% viewers`)
    .join('; ');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || serviceKey;

    // Admin client for DB operations
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT signature via the auth server, then read id/email from the
    // VERIFIED user. Never trust raw token claims — the signature isn't checked
    // by the gateway, so a decoded-only token could be forged (e.g. admin email).
    let userId: string;
    let userEmail: string;
    try {
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authUser) throw new Error('invalid token');
      userId = authUser.id;
      userEmail = authUser.email || '';
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { videoId, videoContext }: RequestBody = await req.json();
    console.log(`[analyze-with-gemini] user=${userId}, videoId=${videoId}`);

    // Check plan limits
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, channel_niche, channel_description, channel_context, creator_level, access_token, refresh_token, token_expiry')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    const isAdmin = userEmail === 'reyzostyle@gmail.com';

    // Every plan, including free, spends from the shared credit pool — free's
    // allowance is just a one-time grant that never resets (_shared/credits.ts).
    const creditStatus = await loadCreditStatus(supabase, userId);
    if (!canAfford(creditStatus, CREDIT_COSTS.video_analysis, isAdmin)) {
      const message = plan === 'agency'
        ? "You've hit this month's fair-use credit limit. Contact us if you need more."
        : plan === 'free'
          ? 'Your free credits are used up. Upgrade to keep analyzing.'
          : "You've used all your credits this month. Upgrade for more.";
      return new Response(
        JSON.stringify({ error: message }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get video data — own channel first, then fall back to public YouTube API
    const { data: ownVideo } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', userId)
      .eq('video_id', videoId)
      .maybeSingle();

    let video = ownVideo;

    if (!video) {
      console.log('[analyze-with-gemini] External video — fetching public stats via API key...');
      const ytApiKey = Deno.env.get('YOUTUBE_API_KEY');
      if (ytApiKey) {
        try {
          video = await fetchPublicVideoData(videoId, ytApiKey, true);
          console.log('[analyze-with-gemini] External video stats fetched:', video.title);
        } catch (e) {
          console.log('[analyze-with-gemini] Could not fetch stats, proceeding without:', e);
          video = { video_id: videoId, title: `youtube.com/watch?v=${videoId}`, views: null, likes_count: null, comment_count: null, duration: null, retention_percentage: null, average_view_duration: null, is_external: true };
        }
      } else {
        video = { video_id: videoId, title: `youtube.com/watch?v=${videoId}`, views: null, likes_count: null, comment_count: null, duration: null, retention_percentage: null, average_view_duration: null, is_external: true };
      }
    }

    // ── Own-video deep stats ────────────────────────────────────────────────
    // If this video belongs to the connected YouTube account, pull its private
    // retention curve (Analytics API) and treat it as the user's own content.
    // Requires the yt-analytics.readonly scope; degrades silently without it.
    if (tokenRow?.access_token) {
      try {
        let accessToken = tokenRow.access_token as string;
        const expiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry) : new Date(0);
        if (expiry < new Date() && tokenRow.refresh_token) {
          accessToken = await refreshAccessToken(tokenRow.refresh_token);
          const newExpiry = new Date();
          newExpiry.setSeconds(newExpiry.getSeconds() + 3600);
          await supabase
            .from('user_tokens')
            .update({ access_token: accessToken, token_expiry: newExpiry.toISOString(), updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        }

        // Synced videos are already known-own. For pasted/unsynced videos, match
        // the video's channel against the connected account's channel.
        let isOwn = !!ownVideo;
        if (!isOwn && video.channel_id) {
          const ownChannelId = await getOwnChannelId(accessToken);
          isOwn = !!ownChannelId && ownChannelId === video.channel_id;
        }

        if (isOwn) {
          video.is_external = false;
          const rt = await fetchOwnRetention(accessToken, videoId);
          if (rt) {
            if (rt.averageViewPercentage != null) video.retention_percentage = rt.averageViewPercentage;
            if (rt.averageViewDuration != null) video.average_view_duration = rt.averageViewDuration;
            video.retention_drops = summarizeRetentionDrops(rt.curve);
            console.log(`[analyze-with-gemini] Own video: avg%=${rt.averageViewPercentage}, drops="${video.retention_drops}"`);
          }
        }
      } catch (e) {
        console.log('[analyze-with-gemini] Retention fetch skipped:', e);
      }
    }

    const profile = {
      channel_niche: tokenRow?.channel_niche || '',
      channel_description: tokenRow?.channel_description || '',
      channel_context: tokenRow?.channel_context || '',
      creator_level: tokenRow?.creator_level || 'intermediate',
    };

    // One pass: the same model watches the video and writes the verdict.
    console.log('[analyze-with-gemini] Analyzing video...');
    const analysis = await analyzeVideo(
      { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/mp4' },
      video, profile, videoContext, supabase, profile.creator_level,
    );
    console.log('[analyze-with-gemini] Done, transcript length:', analysis.transcript?.length);

    // Save transcript only for own videos
    if (analysis.transcript && !video.is_external) {
      await supabase
        .from('videos')
        .update({ transcript: analysis.transcript })
        .eq('user_id', userId)
        .eq('video_id', videoId);
    }

    // Save analysis
    const { data: analysisData, error: analysisError } = await supabase
      .from('analyses')
      .insert({
        user_id: userId,
        video_ids: [videoId],
        hook_analysis: { overall_assessment: analysis.overall_assessment, overall_score: analysis.overall_score, score_breakdown: analysis.score_breakdown || null, title: video.title || null, source: 'youtube' },
        strong_spots: analysis.strong_spots || [],
        weak_spots: analysis.weak_spots,
        new_hook_ideas: [],
        analysis_type: 'advanced',
        is_my_video: video.is_external === false,
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    await spendCredits(supabase, userId, creditStatus, CREDIT_COSTS.video_analysis);

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysisData,
        gemini: {
          transcript: analysis.transcript,
          hook_visual: analysis.hook_visual,
          visual_observations: analysis.visual_observations,
          overall_energy: analysis.overall_energy,
          technical_audit: analysis.technical_audit,
          timeline: analysis.timeline || [],
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[analyze-with-gemini] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
