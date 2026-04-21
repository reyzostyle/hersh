import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  channelUrls: string[];
  daysBack: number;
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || '0') * 3600 + parseInt(match[2] || '0') * 60 + parseInt(match[3] || '0');
}

function extractChannelInfo(url: string): { type: 'handle' | 'id' | 'custom'; value: string } {
  const trimmed = url.trim();

  // @handle or full URL with @handle
  const handleMatch = trimmed.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (handleMatch) return { type: 'handle', value: handleMatch[1] };

  // /channel/UCxxxxxx
  const channelIdMatch = trimmed.match(/channel\/(UC[\w-]+)/);
  if (channelIdMatch) return { type: 'id', value: channelIdMatch[1] };

  // Bare UC... ID
  if (/^UC[\w-]{20,}$/.test(trimmed)) return { type: 'id', value: trimmed };

  // /c/CustomName or /CustomName — try as handle
  const customMatch = trimmed.match(/youtube\.com\/(?:c\/)?([^/?&\s]+)/);
  if (customMatch) return { type: 'handle', value: customMatch[1] };

  // Fallback: treat the whole string as a handle
  return { type: 'handle', value: trimmed.replace(/^@/, '') };
}

async function resolveChannelId(channelInfo: { type: string; value: string }, apiKey: string): Promise<{ channelId: string; channelName: string; handle: string } | null> {
  let url: string;

  if (channelInfo.type === 'id') {
    url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelInfo.value)}&key=${apiKey}`;
  } else {
    url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent('@' + channelInfo.value)}&key=${apiKey}`;
  }

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`[fetch-niche-shorts] Channel resolve failed: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  if (!data.items?.length) {
    // Try as forUsername fallback
    if (channelInfo.type === 'handle') {
      const fallbackUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forUsername=${encodeURIComponent(channelInfo.value)}&key=${apiKey}`;
      const fallbackRes = await fetch(fallbackUrl);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.items?.length) {
          const ch = fallbackData.items[0];
          return { channelId: ch.id, channelName: ch.snippet.title, handle: ch.snippet.customUrl || channelInfo.value };
        }
      }
    }
    return null;
  }

  const ch = data.items[0];
  return { channelId: ch.id, channelName: ch.snippet.title, handle: ch.snippet.customUrl || channelInfo.value };
}

async function fetchChannelShorts(channelId: string, channelName: string, publishedAfter: string, apiKey: string) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&videoDuration=short&maxResults=25&order=date&publishedAfter=${publishedAfter}&key=${apiKey}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    console.log(`[fetch-niche-shorts] Search failed for ${channelId}: ${await searchRes.text()}`);
    return [];
  }

  const searchData = await searchRes.json();
  const items = searchData.items || [];
  if (!items.length) return [];

  const videoIds = items.map((i: any) => i.id.videoId).join(',');
  const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${apiKey}`;
  const statsRes = await fetch(statsUrl);
  if (!statsRes.ok) {
    console.log(`[fetch-niche-shorts] Stats failed for ${channelId}: ${await statsRes.text()}`);
    return [];
  }

  const statsData = await statsRes.json();
  const statsMap: Record<string, any> = {};
  for (const item of (statsData.items || [])) {
    statsMap[item.id] = item;
  }

  const videos = [];
  for (const item of items) {
    const videoId = item.id.videoId;
    const stats = statsMap[videoId];
    if (!stats) continue;

    const duration = parseDuration(stats.contentDetails?.duration || 'PT0S');
    if (duration > 180) continue; // skip anything over 3 min (definitely not a Short)

    const views = parseInt(stats.statistics?.viewCount || '0');
    const likes = parseInt(stats.statistics?.likeCount || '0');

    videos.push({
      videoId,
      channelId,
      channelName,
      title: item.snippet.title,
      thumbnailUrl:
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      views,
      likes,
      publishedAt: item.snippet.publishedAt,
      duration,
    });
  }

  return videos;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
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

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'YouTube API key not configured' }), { status: 500, headers: corsHeaders });
    }

    const { channelUrls, daysBack }: RequestBody = await req.json();

    if (!channelUrls?.length) {
      return new Response(JSON.stringify({ videos: [], channels: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const publishedAfter = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    const channels: { channelId: string; channelName: string; handle: string }[] = [];
    for (const url of channelUrls.slice(0, 5)) {
      if (!url.trim()) continue;
      const info = extractChannelInfo(url);
      const resolved = await resolveChannelId(info, apiKey);
      if (resolved) {
        channels.push(resolved);
      } else {
        console.log(`[fetch-niche-shorts] Could not resolve: ${url}`);
      }
    }

    const allVideos: any[] = [];
    for (const ch of channels) {
      const vids = await fetchChannelShorts(ch.channelId, ch.channelName, publishedAfter, apiKey);
      allVideos.push(...vids);
    }

    // Compute normalized score (engagement rate * 1000, normalized 0-100)
    const rawScores = allVideos.map(v => (v.views > 0 ? (v.likes / v.views) * 1000 : 0));
    const maxScore = Math.max(...rawScores, 1);
    const minScore = Math.min(...rawScores, 0);
    const range = maxScore - minScore || 1;

    const videos = allVideos.map((v, i) => ({
      ...v,
      score: Math.round(((rawScores[i] - minScore) / range) * 100),
    }));

    return new Response(
      JSON.stringify({ videos, channels }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[fetch-niche-shorts] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
