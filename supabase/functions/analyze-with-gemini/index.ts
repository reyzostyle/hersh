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
  videoContext?: string,
  supabase?: any,
  creatorLevel?: string,
) {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) throw new Error('Anthropic API key not configured');

  // Fetch knowledge base
  let knowledgeBaseSection = '';
  if (supabase) {
    const { data: kbRecords } = await supabase
      .from('knowledge_base')
      .select('category, title, content')
      .order('category');
    if (kbRecords && kbRecords.length > 0) {
      knowledgeBaseSection = kbRecords
        .map((r: any) => `[${r.category}] ${r.title}: ${r.content}`)
        .join('\n');
    }
  }

  const level = creatorLevel || 'intermediate';

  const systemPrompt = `You analyze YouTube Shorts and tell creators exactly what's killing performance and how to fix it.

CREATOR LEVEL: ${level}
- beginner: explain the "why", avoid jargon, focus on the 1-2 fundamentals that matter most. Encouraging but honest.
- intermediate: skip fundamentals (they know hook/retention/CTA). Focus on execution and what to change specifically.
- advanced: reference advanced concepts (pattern interrupts, retention curves, loop mechanics, cold opens). Challenge assumptions, be opinionated.

SCORING (overall_score: integer 1-100). Build the score from components so it actually spreads — do NOT pick a round number and do NOT default to the 70s.
First score FOUR components honestly, then SUM them into overall_score:
- Hook strength (0-30): does the first 0-3s stop the scroll for THIS format's hook?
- Retention & pacing (0-25): does it hold attention — no dead air, no drag, no filler?
- Payoff & ending (0-25): does it deliver on the hook's promise and end with a reason to stay/act?
- Clarity & delivery (0-20): audio, visuals, energy, comprehension.
overall_score = hook + retention + payoff + delivery. Output the EXACT sum. Avoid magnet numbers (50, 70, 75, 80, 85) — if the math lands on 73 or 61, say 73 or 61.
Bands for sanity-check only: 85-100 exceptional (rare), 70-84 strong, 55-69 decent with clear fixes, 40-54 below average, 25-39 weak, 1-24 broken.
A genuinely strong Short earns 80+ when each component is high. A weak or average video MUST land below 60. Viral views ≠ good hook. Never inflate to be nice, never hedge a strong one down.

HOOK TYPES (id the type, judge execution for THAT type): curiosity gap, pattern interrupt, contrarian, story cold open, transformation/result-first, direct question, shock/surprise, list/number.

FORMATS (id format first, evaluate by its own rules):
- Storytime: hook = most dramatic moment/stakes, NOT intro
- Tutorial: hook = end result or pain solved upfront
- Listicle: hook = most surprising item / list promise
- POV: hook = visually unexpected or emotionally immediate
- Talking head: hook = most provocative claim/question, stated first
- Voiceover: hook = strong first VO line, not setup
- Reaction: hook = genuine reaction moment, not intro
- Showcase: hook = most impressive visual, shown first

STORYTIME (when format=storytime): hook = most dramatic/emotional moment, not info promise. Slow buildup can be intentional - only flag if it kills tension. Flag opening with context instead of conflict. Judge speed of emotional stakes, not speed of info. Never apply tutorial/talking-head logic here.

HARD RULES
1. Ground every claim in the transcript, visuals, or stats. If you can't cite it, don't say it.
2. Never invent retention numbers, views, or stats. If retention is N/A, analyze on structure/hook/content only.
3. If niche/channel profile is N/A, analyze the video on its own merits. Don't guess the niche.
4. Banned generic phrases: "engaging content", "great hook", "good pacing", "keep it up", "consider adding", "you could try", "just make sure", "overall this is a solid video".
5. No flattery. No recap of what the video does. Tell them what's wrong.
6. strong_spots and weak_spots: only what's genuinely true, min 1 max 3 each. Don't pad.

OUTPUT (overall_assessment): 3-4 sentences, senior creator to a peer. No fixed template, vary your opening. Cover the main issue, how the hook performs specifically, one structural/visual observation, and end with the single most important fix. Sound like a real person, not a report.

new_hook_ideas: 3 hooks that are genuinely different angles (different hook types), not rewrites of the same idea. Mix lengths (one punchy 3-5 words, one extended 8-12+ words). Use specificity (numbers, timeframes, concrete outcomes). No generic phrases unless made specific.

PUNCTUATION: never use em-dash (—) or en-dash (–) anywhere. Only the regular hyphen (-).

TONE: peer-to-peer senior creator notes. Zero fluff, direct, specific, opinionated. Like texting a friend a real review.

${knowledgeBaseSection ? `KNOWLEDGE BASE (learned patterns - use as instinct, don't quote, treat as priors not rules):\n${knowledgeBaseSection}\n` : ''}`;

  const dur = video.duration ? `${video.duration}s` : 'N/A';
  const views = video.views != null ? video.views.toLocaleString() : 'N/A — not published yet or no access';
  const likes = video.likes_count != null ? video.likes_count.toLocaleString() : 'N/A';
  const source = 'YouTube URL';

  const hasRetention = video.retention_percentage != null && video.average_view_duration != null;
  const retentionSection = hasRetention
    ? `Avg view duration: ${video.average_view_duration}s (${video.retention_percentage}%)\nBiggest drops: N/A — drop data not available`
    : `N/A — retention data not available for this video.\nAnalyze based on structure, hook, and content only.`;

  // Don't use channel profile for external videos — they're someone else's content
  const hasProfile = !video.is_external && (profile.channel_niche || profile.channel_description);
  const profileSection = hasProfile
    ? `Niche: ${profile.channel_niche || 'N/A'}\nDescription: ${profile.channel_description || 'N/A'}${profile.channel_context ? `\nAdditional Context: ${profile.channel_context}` : ''}`
    : `N/A — channel profile not provided`;

  const prompt = `## Video Stats
Title: ${video.title || 'N/A'}
Duration: ${dur}
Views: ${views}
Likes: ${likes}
Source: ${source}

## Retention Data
${retentionSection}

## Video Analysis (from Gemini)
Transcript: ${geminiData.transcript || 'N/A — transcript not available'}
Visual hook (0-3 sec): ${geminiData.hook_visual || 'N/A — visual hook not captured'}
Visual observations: ${geminiData.visual_observations || 'N/A — no visual observations'}
Energy level: ${geminiData.overall_energy || 'N/A'}

## Channel Profile
${profileSection}

## User Context
${videoContext?.trim() || 'N/A — no extra context provided'}

Analyze the hook and overall video performance. Use both the transcript AND visual data from Gemini.

Respond with valid JSON only:
{
  "overall_score": <integer 1-100, the EXACT sum of the four components per the scoring rubric above>,
  "score_breakdown": { "hook": <0-30>, "retention": <0-25>, "payoff": <0-25>, "delivery": <0-20> },
  "hook_type": "<identified hook type from the list above>",
  "video_format": "<identified video format from the list above>",
  "overall_assessment": "3-4 sentences about hook effectiveness, what works and what doesn't, referencing both audio/transcript and visuals",
  "strong_spots": [
    "What specifically works and why it works (max 2 sentences)"
  ],
  "weak_spots": [
    "Specific issue + actionable fix (max 2 sentences)"
  ],
  "new_hook_ideas": [
    {"hook": "exact hook text ready to use", "reasoning": "why this works for this channel"}
  ]
}`;

  const claudeBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
      body: claudeBody,
    });
    if (response.ok || response.status !== 529) break;
  }

  if (!response || !response.ok) {
    const errText = await response?.text() ?? 'No response';
    throw new Error(`Claude API error: ${errText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  const stripDashes = (s: any): any => {
    if (typeof s === 'string') return s.replace(/[—–]/g, '-');
    if (Array.isArray(s)) return s.map(stripDashes);
    if (s && typeof s === 'object') {
      const out: any = {};
      for (const k of Object.keys(s)) out[k] = stripDashes(s[k]);
      return out;
    }
    return s;
  };

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return stripDashes(JSON.parse(jsonMatch[0]));
    throw new Error('No JSON in Claude response');
  } catch {
    return {
      overall_assessment: content.substring(0, 500).replace(/[—–]/g, '-'),
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
      .select('plan, analyses_used, analyses_reset_at, channel_niche, channel_description, channel_context, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 100 };
    const plan = tokenRow?.plan || 'free';
    let analysesUsed = tokenRow?.analyses_used || 0;
    const analysesLimit = userEmail === 'reyzostyle@gmail.com' ? Infinity : (PLAN_LIMITS[plan] ?? 3);

    // Free video analyses are lifetime (3 total). Monthly reset for paid plans only.
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
      creator_level: tokenRow?.creator_level || 'intermediate',
    };

    // Step 2: Claude analyzes everything
    console.log('[analyze-with-gemini] Calling Claude...');
    const analysis = await analyzeWithClaude(video, geminiData, profile, videoContext, supabase, profile.creator_level);

    // Save analysis
    const { data: analysisData, error: analysisError } = await supabase
      .from('analyses')
      .insert({
        user_id: userId,
        video_ids: [videoId],
        hook_analysis: { overall_assessment: analysis.overall_assessment, overall_score: analysis.overall_score, title: video.title || null, source: 'youtube' },
        strong_spots: analysis.strong_spots || [],
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
