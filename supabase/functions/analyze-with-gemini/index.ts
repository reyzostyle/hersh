import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  videoId: string; // YouTube video ID
  videoContext?: string;
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Resilient Gemini call: rotates through models and retries transient errors
// (503 high-demand, 429 rate limit, 5xx) with exponential backoff across
// multiple rounds, so a temporary spike on one model doesn't fail the request.
async function callGeminiWithRetry(body: string, apiKey: string): Promise<Response> {
  let last: Response | null = null;
  const ROUNDS = 3;
  for (let round = 0; round < ROUNDS; round++) {
    for (const model of GEMINI_MODELS) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );
      if (res.ok) { console.log(`[gemini] Success with ${model} (round ${round + 1})`); return res; }
      last = res;
      const transient = res.status === 503 || res.status === 429 || res.status >= 500;
      console.log(`[gemini] ${model} failed (${res.status}), transient=${transient}, round ${round + 1}`);
      if (!transient) return res; // 400/404 etc. won't be fixed by retrying
      await sleep(Math.min(1000 * Math.pow(2, round), 8000)); // 1s, 2s, 4s backoff between rounds
    }
  }
  return last as Response;
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

  const geminiBody = JSON.stringify({
    contents: [{
      parts: [
        { file_data: { mime_type: 'video/mp4', file_uri: youtubeUrl } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });

  const response = await callGeminiWithRetry(geminiBody, geminiApiKey);
  if (!response.ok) {
    throw new Error(`Gemini API error: ${await response.text()}`);
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

async function analyzeWithClaude(
  video: any,
  geminiData: { transcript: string; hook_visual: string; visual_observations: string; overall_energy: string },
  profile: any,
  videoContext?: string,
  supabase?: any,
  creatorLevel?: string,
) {
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
7. You watched this video yourself - write as the reviewer, not as a report on what a tool detected. Never name or hint at any AI model, vendor, or pipeline stage (Gemini, Claude, GPT, "the AI", "the model", "visual analysis confirms", etc.). Just say what's on screen and in the audio, plainly, like you saw it with your own eyes.

OUTPUT (overall_assessment): 3-4 sentences, senior creator to a peer. No fixed template, vary your opening. Cover the main issue, how the hook performs specifically, one structural/visual observation, and end with the single most important fix. Sound like a real person, not a report. Break it into 2-3 short paragraphs separated by a blank line (\\n\\n) so it's easy to read - never one dense block.

PUNCTUATION: never use em-dash (—) or en-dash (–) anywhere. Only the regular hyphen (-).

TONE: peer-to-peer senior creator notes. Zero fluff, direct, specific, opinionated. Like texting a friend a real review.

${knowledgeBaseSection ? `KNOWLEDGE BASE (learned patterns - use as instinct, don't quote, treat as priors not rules):\n${knowledgeBaseSection}\n` : ''}`;

  const dur = video.duration ? `${video.duration}s` : 'N/A';
  const views = video.views != null ? video.views.toLocaleString() : 'N/A — not published yet or no access';
  const likes = video.likes_count != null ? video.likes_count.toLocaleString() : 'N/A';
  const source = 'YouTube URL';

  const hasRetention = video.retention_percentage != null && video.average_view_duration != null;
  const hasDrops = !!video.retention_drops;
  const dropLine = hasDrops
    ? `Biggest viewer drop-offs (from this channel's REAL audience-retention curve): ${video.retention_drops}. Reference these exact timestamps: say what happens on screen there and how to fix the drop.`
    : `Biggest drops: N/A — drop-off curve not available`;
  const retentionSection = hasRetention
    ? `Avg view duration: ${video.average_view_duration}s (${video.retention_percentage}% average view)\n${dropLine}`
    : hasDrops
      ? dropLine
      : `N/A — retention data not available for this video.\nAnalyze based on structure, hook, and content only.`;

  // Don't use channel profile for external videos — they're someone else's content
  const hasProfile = !video.is_external && (profile.channel_niche || profile.channel_description);
  const profileSection = hasProfile
    ? `Niche: ${profile.channel_niche || 'N/A'}\nDescription: ${profile.channel_description || 'N/A'}${profile.channel_context ? `\nAdditional Context: ${profile.channel_context}` : ''}\n\nRELEVANCE RULE: Only tailor the analysis to this niche if THIS video's actual content clearly fits it. If the video is obviously a different topic/niche than described above, IGNORE this profile completely and analyze the video on its own merits - do not force the creator's niche onto unrelated content.`
    : `N/A — channel profile not provided`;

  const prompt = `## Video Stats
Title: ${video.title || 'N/A'}
Duration: ${dur}
Views: ${views}
Likes: ${likes}
Source: ${source}

## Retention Data
${retentionSection}

## Video Analysis
Transcript: ${geminiData.transcript || 'N/A — transcript not available'}
Visual hook (0-3 sec): ${geminiData.hook_visual || 'N/A — visual hook not captured'}
Visual observations: ${geminiData.visual_observations || 'N/A — no visual observations'}
Energy level: ${geminiData.overall_energy || 'N/A'}

## Channel Profile
${profileSection}

## User Context
${videoContext?.trim() || 'N/A — no extra context provided'}

Analyze the hook and overall video performance. Use both the transcript and the visual data above.

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
  ]
}`;

  const content = await callLLM(prompt, { system: systemPrompt, maxTokens: 2500 });

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
      .select('plan, analyses_used, analyses_reset_at, bonus_analyses, channel_niche, channel_description, channel_context, creator_level, access_token, refresh_token, token_expiry')
      .eq('user_id', userId)
      .maybeSingle();

    const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 100 };
    const plan = tokenRow?.plan || 'free';
    let analysesUsed = tokenRow?.analyses_used || 0;
    let bonusAnalyses = tokenRow?.bonus_analyses || 0;

    // Free video analyses are lifetime (3 total). Monthly reset for paid plans only.
    if (plan !== 'free' && tokenRow?.analyses_reset_at) {
      const resetAt = new Date(tokenRow.analyses_reset_at);
      if (new Date() > resetAt) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabase
          .from('user_tokens')
          .update({ analyses_used: 0, analyses_reset_at: newResetAt.toISOString(), bonus_analyses: 0 })
          .eq('user_id', userId);
        analysesUsed = 0;
        bonusAnalyses = 0;
      }
    }

    const analysesLimit = userEmail === 'reyzostyle@gmail.com' ? Infinity : (PLAN_LIMITS[plan] ?? 3) + bonusAnalyses;

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
