import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Verifies the JWT signature via the auth server (not just decoding it) and
// returns the authenticated user id. Throws on any invalid/forged token.
async function getUserIdFromToken(supabase: any, token: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('invalid token');
  return user.id;
}

function stripDashes(s: unknown): unknown {
  if (typeof s === 'string') return s.replace(/[—–]/g, '-');
  if (Array.isArray(s)) return s.map(stripDashes);
  if (s && typeof s === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(s as object)) out[k] = stripDashes((s as Record<string, unknown>)[k]);
    return out;
  }
  return s;
}

async function fetchChannelVideos(channelId: string, ytApiKey: string): Promise<Array<{
  videoId: string;
  title: string;
  thumbnail: string;
  views: number;
  publishedAt: string;
}>> {
  // Fetch videos from last 14 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const publishedAfter = cutoff.toISOString();

  // Get uploads playlist for channel
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=contentDetails&key=${ytApiKey}`
  );
  if (!channelRes.ok) throw new Error(`YouTube channels API error: ${await channelRes.text()}`);
  const channelData = await channelRes.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return [];

  // Fetch recent playlist items
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${uploadsPlaylistId}&part=snippet,contentDetails&maxResults=10&key=${ytApiKey}`
  );
  if (!playlistRes.ok) throw new Error(`YouTube playlistItems API error: ${await playlistRes.text()}`);
  const playlistData = await playlistRes.json();
  const items = playlistData.items || [];

  // Filter to last 14 days and get video IDs
  const recentItems = items.filter((item: any) => {
    const publishedAt = item.snippet?.publishedAt;
    return publishedAt && new Date(publishedAt) >= cutoff;
  }).slice(0, 5);

  if (recentItems.length === 0) return [];

  const videoIds = recentItems.map((item: any) => item.contentDetails?.videoId).filter(Boolean);

  // Fetch stats for these videos
  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.join(',')}&part=snippet,statistics&key=${ytApiKey}`
  );
  if (!statsRes.ok) throw new Error(`YouTube videos API error: ${await statsRes.text()}`);
  const statsData = await statsRes.json();

  return (statsData.items || []).map((item: any) => ({
    videoId: item.id,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
    views: parseInt(item.statistics?.viewCount || '0', 10),
    publishedAt: item.snippet.publishedAt,
  }));
}

async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const events = data.events || [];
    const text = events
      .filter((e: any) => e.segs)
      .map((e: any) => e.segs.map((s: any) => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  } catch {
    return '';
  }
}

async function extractConceptAndAdapt(
  title: string,
  views: number,
  transcript: string,
  niche: string,
  description: string,
  anthropicApiKey: string
): Promise<{ concept: string; adapted_idea: string }> {
  const prompt = `You analyze competitor YouTube Shorts and extract the core concept, then adapt it for a different creator.

User's channel profile:
Niche: ${niche || 'N/A'}
Description: ${description || 'N/A'}

Competitor video:
Title: ${title}
Views: ${views.toLocaleString()}
Transcript: ${transcript || 'N/A - transcript not available'}

Extract:
1. CONCEPT: The core idea/topic of this video in 2-3 sentences. What's the angle? Why does it work for their audience?
2. ADAPTED_IDEA: How a creator in "${niche || 'this niche'}" could use this same concept. Different angle, same proven format. 2-3 sentences.

Rules:
- Never use em-dash or en-dash. Only regular hyphen (-).
- Respond with JSON only.

{
  "concept": "...",
  "adapted_idea": "..."
}`;

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (response.ok || response.status !== 529) break;
  }

  if (!response?.ok) {
    const errText = await response?.text() ?? 'No response';
    throw new Error(`Claude API error: ${errText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        concept: String(stripDashes(parsed.concept) || ''),
        adapted_idea: String(stripDashes(parsed.adapted_idea) || ''),
      };
    }
    throw new Error('No JSON in response');
  } catch {
    return {
      concept: content.substring(0, 300).replace(/[—–]/g, '-'),
      adapted_idea: '',
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ytApiKey = Deno.env.get('YOUTUBE_API_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ytApiKey) throw new Error('YouTube API key not configured');
    if (!anthropicApiKey) throw new Error('Anthropic API key not configured');

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');

    let userId: string;
    try {
      userId = await getUserIdFromToken(supabase, token);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders });
    }

    const { data: { user: authUser }, error: adminError } = await supabase.auth.admin.getUserById(userId);
    if (adminError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Plan check — Competitors is Plus+
    const { data: planCheck } = await supabase
      .from('user_tokens').select('plan, channel_niche, channel_description').eq('user_id', userId).maybeSingle();
    if ((planCheck?.plan || 'free') === 'free') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'plus' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load user profile for niche/description
    const tokenRow = planCheck;

    const niche = tokenRow?.channel_niche || '';
    const description = tokenRow?.channel_description || '';

    // Load competitor channels
    const { data: channels, error: channelsError } = await supabase
      .from('competitor_channels')
      .select('*')
      .eq('user_id', userId);

    if (channelsError) throw channelsError;
    if (!channels || channels.length === 0) {
      return new Response(
        JSON.stringify({ success: true, ideas: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load already-processed video IDs
    const { data: existingIdeas } = await supabase
      .from('competitor_ideas')
      .select('video_id')
      .eq('user_id', userId);

    const processedVideoIds = new Set((existingIdeas || []).map((r: any) => r.video_id));

    // Fetch and process new videos for each channel
    for (const channel of channels) {
      console.log(`[fetch-competitor-ideas] Processing channel: ${channel.channel_name} (${channel.channel_id})`);
      let videos: Array<{ videoId: string; title: string; thumbnail: string; views: number; publishedAt: string }>;
      try {
        videos = await fetchChannelVideos(channel.channel_id, ytApiKey);
      } catch (e) {
        console.error(`[fetch-competitor-ideas] Failed to fetch videos for ${channel.channel_id}:`, e);
        continue;
      }

      for (const video of videos) {
        if (processedVideoIds.has(video.videoId)) continue;

        console.log(`[fetch-competitor-ideas] Processing video: ${video.title}`);

        const transcript = await fetchTranscript(video.videoId);

        let concept = '';
        let adapted_idea = '';
        try {
          const result = await extractConceptAndAdapt(
            video.title, video.views, transcript, niche, description, anthropicApiKey
          );
          concept = result.concept;
          adapted_idea = result.adapted_idea;
        } catch (e) {
          console.error(`[fetch-competitor-ideas] Claude error for ${video.videoId}:`, e);
        }

        const { error: insertError } = await supabase
          .from('competitor_ideas')
          .upsert({
            user_id: userId,
            channel_id: channel.channel_id,
            channel_name: channel.channel_name,
            video_id: video.videoId,
            video_title: video.title,
            video_thumbnail: video.thumbnail,
            video_views: video.views,
            video_published_at: video.publishedAt,
            concept,
            adapted_idea,
          }, { onConflict: 'user_id,video_id' });

        if (insertError) {
          console.error(`[fetch-competitor-ideas] Insert error for ${video.videoId}:`, insertError);
        } else {
          processedVideoIds.add(video.videoId);
        }
      }
    }

    // Return all ideas for this user, newest first
    const { data: ideas, error: ideasError } = await supabase
      .from('competitor_ideas')
      .select('*')
      .eq('user_id', userId)
      .order('video_published_at', { ascending: false });

    if (ideasError) throw ideasError;

    return new Response(
      JSON.stringify({ success: true, ideas: ideas || [] }),
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
