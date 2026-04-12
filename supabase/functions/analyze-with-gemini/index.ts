import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  videoId: string; // YouTube video ID
  videoContext?: string;
}

async function analyzeVideoWithGemini(videoId: string): Promise<{
  transcript: string;
  hook_visual: string;
  visual_observations: string;
  overall_energy: string;
}> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('[gemini] Analyzing video:', youtubeUrl);

  const prompt = `Analyze this YouTube Short video carefully. Watch it fully and provide:

1. TRANSCRIPT: Full word-for-word transcript of everything spoken/said in the video
2. HOOK_VISUAL: Describe exactly what happens visually in the first 3-5 seconds (text on screen, visuals, energy, what grabs attention)
3. VISUAL_OBSERVATIONS: Key observations about editing style, pacing, text overlays, engagement tactics, call to action
4. OVERALL_ENERGY: Rate as "low", "medium", or "high"

Respond ONLY with valid JSON, no markdown:
{
  "transcript": "full transcript here",
  "hook_visual": "detailed description of visual hook in first 3-5 seconds",
  "visual_observations": "editing style, pacing, text overlays, engagement tactics",
  "overall_energy": "low|medium|high"
}`;

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'];
  const geminiBody = JSON.stringify({
    contents: [{
      parts: [
        { file_data: { mime_type: 'video/mp4', file_uri: youtubeUrl } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });

  let response: Response | null = null;
  let lastError = '';

  for (const model of models) {
    console.log(`[gemini] Trying model: ${model}`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
      );
      if (response.ok) { console.log(`[gemini] Success with ${model}`); break; }
      const status = response.status;
      lastError = await response.text();
      if ((status === 503 || status === 429) && attempt < 2) {
        console.log(`[gemini] ${model} attempt ${attempt} failed (${status}), retrying in 4s...`);
        await new Promise(r => setTimeout(r, 4000));
      } else break;
    }
    if (response?.ok) break;
    console.log(`[gemini] ${model} unavailable, trying next...`);
  }

  if (!response?.ok) {
    throw new Error(`Gemini API error: ${lastError}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) throw new Error('Empty response from Gemini');

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('No JSON in Gemini response');
  } catch {
    // Fallback if JSON parse fails
    return {
      transcript: content,
      hook_visual: '',
      visual_observations: '',
      overall_energy: 'medium',
    };
  }
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

async function analyzeWithClaude(
  video: any,
  geminiData: { transcript: string; hook_visual: string; visual_observations: string; overall_energy: string },
  profile: any,
  videoContext?: string
) {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) throw new Error('Anthropic API key not configured');

  const profileSection = [
    profile.channel_niche && `Channel Niche: ${profile.channel_niche}`,
    profile.channel_description && `Channel Description: ${profile.channel_description}`,
    profile.channel_context && `Additional Context: ${profile.channel_context}`,
  ].filter(Boolean).join('\n');

  const hasStats = video.views != null;
  const hasRetention = video.retention_percentage != null;
  const prompt = `You are analyzing a YouTube Short for hook effectiveness and improvement opportunities.

## Video Stats
Title: ${video.title}
${hasStats ? `Views: ${video.views?.toLocaleString()}
Likes: ${video.likes_count?.toLocaleString()}
Duration: ${video.duration}s
${hasRetention ? `Retention: ${video.retention_percentage}%\nAvg View Duration: ${video.average_view_duration}s` : `Retention: N/A (external video)`}` : `Stats: Not available (external video — focus analysis on content and visuals only)`}

## Gemini Video Analysis
Transcript: ${geminiData.transcript || 'Not available'}

Visual Hook (first 3-5 sec): ${geminiData.hook_visual || 'Not available'}

Visual Observations: ${geminiData.visual_observations || 'Not available'}

Overall Energy: ${geminiData.overall_energy}

${profileSection ? `## Channel Profile\n${profileSection}\n` : ''}
${videoContext?.trim() ? `## Additional Context\n${videoContext}\n` : ''}

Analyze the hook and overall video performance. Use both the transcript AND visual data from Gemini.

Respond with valid JSON only:
{
  "overall_assessment": "3-4 sentences about hook effectiveness, what works and what doesn't, referencing both audio/transcript and visuals",
  "weak_spots": [
    "Specific issue + actionable fix (max 2 sentences)",
    "Specific issue + actionable fix (max 2 sentences)",
    "Specific issue + actionable fix (max 2 sentences)"
  ],
  "new_hook_ideas": [
    {"hook": "exact hook text ready to use", "reasoning": "why this works for this channel"},
    {"hook": "exact hook text ready to use", "reasoning": "why this works for this channel"},
    {"hook": "exact hook text ready to use", "reasoning": "why this works for this channel"}
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error: ${errText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('No JSON in Claude response');
  } catch {
    return {
      overall_assessment: content.substring(0, 500),
      weak_spots: [],
      new_hook_ideas: [],
    };
  }
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
    const userId = user.id;

    const { videoId, videoContext }: RequestBody = await req.json();
    console.log(`[analyze-with-gemini] user=${userId}, videoId=${videoId}`);

    // Check plan limits
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, analyses_used, analyses_reset_at, channel_niche, channel_description, channel_context')
      .eq('user_id', userId)
      .maybeSingle();

    const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 200 };
    const plan = tokenRow?.plan || 'free';
    let analysesUsed = tokenRow?.analyses_used || 0;
    const analysesLimit = PLAN_LIMITS[plan] ?? 3;

    if (plan !== 'free' && tokenRow?.analyses_reset_at) {
      const resetAt = new Date(tokenRow.analyses_reset_at);
      if (new Date() > resetAt) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabase
          .from('user_tokens')
          .update({ analyses_used: 0, analyses_reset_at: newResetAt.toISOString() })
          .eq('user_id', userId);
        analysesUsed = 0;
      }
    }

    if (analysesUsed >= analysesLimit) {
      return new Response(
        JSON.stringify({ error: 'Analysis limit reached. Please upgrade your plan.' }),
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

    // Step 1: Gemini watches the video
    console.log('[analyze-with-gemini] Calling Gemini...');
    const geminiData = await analyzeVideoWithGemini(videoId);
    console.log('[analyze-with-gemini] Gemini done, transcript length:', geminiData.transcript?.length);

    // Save transcript only for own videos
    if (geminiData.transcript && !video.is_external) {
      await supabase
        .from('videos')
        .update({ transcript: geminiData.transcript })
        .eq('user_id', userId)
        .eq('video_id', videoId);
    }

    const profile = {
      channel_niche: tokenRow?.channel_niche || '',
      channel_description: tokenRow?.channel_description || '',
      channel_context: tokenRow?.channel_context || '',
    };

    // Step 2: Claude analyzes everything
    console.log('[analyze-with-gemini] Calling Claude...');
    const analysis = await analyzeWithClaude(video, geminiData, profile, videoContext);

    // Save analysis
    const { data: analysisData, error: analysisError } = await supabase
      .from('analyses')
      .insert({
        user_id: userId,
        video_ids: [videoId],
        hook_analysis: { overall_assessment: analysis.overall_assessment },
        weak_spots: analysis.weak_spots,
        new_hook_ideas: analysis.new_hook_ideas,
        analysis_type: 'advanced',
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    await supabase
      .from('user_tokens')
      .update({ analyses_used: analysesUsed + 1 })
      .eq('user_id', userId);

    return new Response(
      JSON.stringify({ success: true, analysis: analysisData, gemini: geminiData }),
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
