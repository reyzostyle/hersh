import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function parseDuration(iso: string): number {
  // Parse ISO 8601 duration like PT45S, PT1M, PT1M30S
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDateYMD(date: Date): string {
  return date.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the JWT signature via the auth server — never trust a decoded-only token.
    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user: authedUser }, error: authErr } = await authClient.auth.getUser(token);
    if (authErr || !authedUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = authedUser.id;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse days param
    let days = 30;
    try {
      const body = await req.json();
      if (body.days && typeof body.days === 'number') days = Math.min(Math.max(body.days, 7), 90);
    } catch { /* no body */ }

    // Plan check — Analytics is Pro only
    const { data: planRow } = await supabase
      .from('user_tokens').select('plan').eq('user_id', userId).maybeSingle();
    const plan = planRow?.plan || 'free';
    if (plan !== 'pro' && plan !== 'agency') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'pro' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Get user's YouTube tokens
    const { data: tokenRow, error: tokenError } = await supabase
      .from('user_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenRow?.access_token) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = tokenRow.access_token;

    // 2. Refresh access_token if expired
    const now = Date.now();
    const expiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : 0;
    if (expiry < now + 60_000) {
      const clientId = Deno.env.get('YOUTUBE_CLIENT_ID')!;
      const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET')!;
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        const newExpiry = new Date(now + (refreshData.expires_in || 3600) * 1000).toISOString();
        // 3. Update tokens in DB
        await supabase
          .from('user_tokens')
          .update({ access_token: accessToken, token_expiry: newExpiry })
          .eq('user_id', userId);
      }
    }

    // 4. Get channel info
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const channelData = await channelRes.json();
    const channelItem = channelData.items?.[0];
    if (!channelItem) {
      return new Response(JSON.stringify({ error: 'not_connected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const channelId = channelItem.id;
    const channel = {
      name: channelItem.snippet?.title || '',
      thumbnail: channelItem.snippet?.thumbnails?.default?.url || '',
      subscribers: parseInt(channelItem.statistics?.subscriberCount || '0'),
      totalViews: parseInt(channelItem.statistics?.viewCount || '0'),
    };

    // Auto-update user_tokens with channel name/thumbnail (self-heal)
    if (channel.name) {
      await supabase
        .from('user_tokens')
        .update({
          youtube_channel_name: channel.name,
          youtube_channel_thumbnail: channel.thumbnail,
        })
        .eq('user_id', userId);
    }

    // 5. Get videos via uploads playlist (more reliable than search.list)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();
    const uploadsPlaylistId = channelItem.contentDetails?.relatedPlaylists?.uploads;

    let videoIds: string[] = [];
    if (uploadsPlaylistId) {
      const playlistRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const playlistData = await playlistRes.json();
      videoIds = (playlistData.items || [])
        .filter((it: any) => {
          const publishedAt = it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt;
          if (!publishedAt) return false;
          const pubDate = new Date(publishedAt);
          return pubDate >= startDate && pubDate <= endDate;
        })
        .map((it: any) => it.contentDetails?.videoId || it.snippet?.resourceId?.videoId)
        .filter(Boolean);
    }

    if (videoIds.length === 0) {
      return new Response(JSON.stringify({
        channel,
        videos: [],
        insights: [`No videos found in the last ${days} days. Start posting to see your analytics here.`],
        period: `${days} days`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Get video details
    const detailsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const detailsData = await detailsRes.json();

    // 7. Filter to Shorts (duration <= 60 seconds)
    const shorts = (detailsData.items || []).filter((v: any) => {
      const dur = parseDuration(v.contentDetails?.duration || '');
      return dur > 0 && dur <= 60;
    });

    if (shorts.length === 0) {
      return new Response(JSON.stringify({
        channel,
        videos: [],
        insights: [`No Shorts found in the last ${days} days. Only videos 60 seconds or under count as Shorts.`],
        period: `${days} days`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shortsIds = shorts.map((v: any) => v.id);

    // Build a map of basic stats from Data API
    const basicStatsMap: Record<string, any> = {};
    for (const v of shorts) {
      basicStatsMap[v.id] = {
        id: v.id,
        title: v.snippet?.title || '',
        thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
        publishedAt: v.snippet?.publishedAt || '',
        duration: parseDuration(v.contentDetails?.duration || ''),
        views: parseInt(v.statistics?.viewCount || '0'),
        likes: parseInt(v.statistics?.likeCount || '0'),
        avgViewDuration: 0,
        avgViewPercentage: 0,
        shares: 0,
      };
    }

    // 8. Get analytics from YouTube Analytics API
    const analyticsMap: Record<string, any> = {};
    let analyticsError: string | null = null;
    try {
      // Use a wider date range for analytics (analytics has 1-2 day delay for fresh videos)
      const analyticsStartDate = new Date();
      analyticsStartDate.setDate(analyticsStartDate.getDate() - Math.max(days, 90));
      const analyticsEndDate = new Date();
      analyticsEndDate.setDate(analyticsEndDate.getDate() - 1); // yesterday to avoid empty today data

      const analyticsUrl = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${formatDateYMD(analyticsStartDate)}&endDate=${formatDateYMD(analyticsEndDate)}&metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,shares&dimensions=video&sort=-views`;
      console.log('[analytics] URL:', analyticsUrl);
      const analyticsRes = await fetch(analyticsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const analyticsData = await analyticsRes.json();
      console.log('[analytics] status:', analyticsRes.status, 'rows:', analyticsData.rows?.length, 'error:', analyticsData.error?.message);

      if (!analyticsRes.ok) {
        analyticsError = analyticsData.error?.message || `HTTP ${analyticsRes.status}`;
      }

      if (analyticsData.rows) {
        // columnHeaders: video, views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage, likes, shares
        const headers: string[] = (analyticsData.columnHeaders || []).map((h: any) => h.name);
        const videoIdx = headers.indexOf('video');
        const viewsIdx = headers.indexOf('views');
        const avgDurIdx = headers.indexOf('averageViewDuration');
        const avgPctIdx = headers.indexOf('averageViewPercentage');
        const likesIdx = headers.indexOf('likes');
        const sharesIdx = headers.indexOf('shares');

        for (const row of analyticsData.rows) {
          const vid = row[videoIdx];
          if (shortsIds.includes(vid)) {
            analyticsMap[vid] = {
              views: viewsIdx >= 0 ? Math.round(row[viewsIdx]) : 0,
              avgViewDuration: avgDurIdx >= 0 ? Math.round(row[avgDurIdx]) : 0,
              avgViewPercentage: avgPctIdx >= 0 ? Math.round(row[avgPctIdx] * 10) / 10 : 0,
              likes: likesIdx >= 0 ? Math.round(row[likesIdx]) : 0,
              shares: sharesIdx >= 0 ? Math.round(row[sharesIdx]) : 0,
            };
          }
        }
      }
    } catch (e) {
      console.error('[analytics] Analytics API error:', e instanceof Error ? e.message : String(e));
    }

    // 9. Merge video details with analytics data
    const videos = shortsIds.map((id: string) => {
      const base = basicStatsMap[id];
      const analytics = analyticsMap[id];
      return {
        ...base,
        views: analytics?.views ?? base.views,
        likes: analytics?.likes ?? base.likes,
        avgViewDuration: analytics?.avgViewDuration ?? null,
        avgViewPercentage: analytics?.avgViewPercentage ?? null,
        shares: analytics?.shares ?? 0,
        hasAnalytics: !!analytics,
      };
    }).sort((a: any, b: any) => b.views - a.views);

    // 10. Generate AI insights with Claude
    let insights: string[] = [];
    try {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;
      const fmt = (v: any) => {
        const ret = v.avgViewPercentage !== null && v.avgViewPercentage !== undefined ? `${v.avgViewPercentage}% retention` : 'retention N/A';
        return `"${v.title}" - ${v.views} views, ${ret}, ${v.likes} likes`;
      };
      const topVideos = videos.slice(0, 5).map(fmt);
      const bottomVideos = videos.slice(-3).map(fmt);

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `You're analyzing YouTube Shorts performance data for a creator. Give 3-5 bullet point insights about what's working, what isn't, and patterns between top and bottom performers.

CRITICAL RULES:
- Video titles shown below are just labels for identification, NOT the actual hook of the video. Do NOT analyze the title as if it were the hook or content.
- You don't have transcripts or visual data - only performance numbers. Do NOT speculate about content, hooks, editing style, or what's inside the video.
- Focus ONLY on patterns you can actually see: view counts, retention %, like counts, posting frequency, ratios between metrics.
- If there are only 1-2 videos, just say there's not enough data for patterns and suggest posting more.
- Peer-to-peer tone, direct, no fluff. No em dashes. 3-5 short sentences total across all bullets.

Top performers:
${topVideos.join('\n')}

Bottom performers:
${bottomVideos.join('\n')}

Total Shorts this period: ${videos.length}
Channel subscribers: ${channel.subscribers.toLocaleString()}

Return ONLY a JSON array of strings (no markdown), e.g. ["insight 1", "insight 2", "insight 3"]`,
          }],
        }),
      });
      const claudeData = await claudeRes.json();
      const raw = claudeData.content?.[0]?.text || '[]';
      // Strip em dashes just in case
      const cleaned = raw.replace(/—/g, '-').replace(/–/g, '-');
      insights = JSON.parse(cleaned);
    } catch (e) {
      console.error('[analytics] Claude error:', e instanceof Error ? e.message : String(e));
      insights = ['Could not generate insights at this time.'];
    }

    return new Response(JSON.stringify({
      channel,
      videos,
      insights,
      period: `${days} days`,
      analyticsError,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    console.error('[fetch-channel-analytics] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
