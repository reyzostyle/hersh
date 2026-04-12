import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  // userId is now extracted from JWT, not accepted from body
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to refresh access token: ${errText}`);
  }

  const tokens = await tokenResponse.json();
  return tokens.access_token;
}

async function getChannelId(accessToken: string): Promise<string> {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to get channel ID: ${errText}`);
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('No channel found');
  }

  return data.items[0].id;
}

async function fetchShorts(accessToken: string, channelId: string) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&videoDuration=short&maxResults=30&order=date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch shorts: ${errText}`);
  }

  const data = await response.json();
  return data.items || [];
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0');
}

async function getVideoStats(accessToken: string, videoIds: string[]) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds.join(',')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to fetch video statistics: ${errText}`);
  }

  const data = await response.json();
  return data.items || [];
}

async function getRetentionData(accessToken: string, videoId: string) {
  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=averageViewDuration,averageViewPercentage&dimensions=video&filters=video==${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      return { averageViewDuration: 0, averageViewPercentage: 0 };
    }

    const data = await response.json();
    if (data.rows && data.rows.length > 0) {
      return {
        averageViewDuration: data.rows[0][1] || 0,
        averageViewPercentage: data.rows[0][2] || 0,
      };
    }

    return { averageViewDuration: 0, averageViewPercentage: 0 };
  } catch {
    return { averageViewDuration: 0, averageViewPercentage: 0 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    console.log(`[main] Starting data fetch for user ${userId}`);

    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenData) {
      throw new Error('No YouTube token found. Please connect your YouTube account.');
    }

    let accessToken = tokenData.access_token;
    const tokenExpiry = new Date(tokenData.token_expiry);

    if (tokenExpiry < new Date()) {
      console.log('[main] Token expired, refreshing...');
      accessToken = await refreshAccessToken(tokenData.refresh_token);

      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + 3600);

      await supabase
        .from('user_tokens')
        .update({
          access_token: accessToken,
          token_expiry: newExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    const channelId = await getChannelId(accessToken);
    console.log(`[main] Channel ID: ${channelId}`);

    const shorts = await fetchShorts(accessToken, channelId);
    console.log(`[main] Found ${shorts.length} shorts`);

    if (shorts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No shorts found', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoIds = shorts.map((short: any) => short.id.videoId);
    const videoStats = await getVideoStats(accessToken, videoIds);

    const statsMap = new Map();
    videoStats.forEach((stat: any) => statsMap.set(stat.id, stat));

    for (const short of shorts) {
      const videoId = short.id.videoId;
      const stats = statsMap.get(videoId);
      const retention = await getRetentionData(accessToken, videoId);

      const duration = stats?.contentDetails?.duration
        ? parseDuration(stats.contentDetails.duration)
        : 0;

      const videoData = {
        user_id: userId,
        video_id: videoId,
        title: short.snippet.title,
        views: parseInt(stats?.statistics?.viewCount || '0'),
        likes_count: parseInt(stats?.statistics?.likeCount || '0'),
        comment_count: parseInt(stats?.statistics?.commentCount || '0'),
        retention_percentage: retention.averageViewPercentage,
        average_view_duration: retention.averageViewDuration,
        thumbnail_url: short.snippet.thumbnails?.high?.url || short.snippet.thumbnails?.default?.url,
        published_at: short.snippet.publishedAt,
        duration: duration,
      };

      await supabase
        .from('videos')
        .upsert(videoData, { onConflict: 'user_id,video_id' });
    }

    console.log(`[main] Done. Saved ${shorts.length} videos (no transcripts — fetched on demand during analysis)`);

    return new Response(
      JSON.stringify({ success: true, count: shorts.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[main] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
