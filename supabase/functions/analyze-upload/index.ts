import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

function deleteGeminiFile(geminiFileName: string) {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (geminiApiKey && geminiFileName) {
    fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiApiKey}`, { method: 'DELETE' })
      .catch(e => console.log('[analyze-upload] Gemini cleanup error:', e));
  }
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Resilient Gemini call: rotates models and retries transient errors
// (503/429/5xx) with exponential backoff across multiple rounds.
async function callGeminiWithRetry(body: string, apiKey: string): Promise<Response> {
  let last: Response | null = null;
  const ROUNDS = 3;
  for (let round = 0; round < ROUNDS; round++) {
    for (const model of GEMINI_MODELS) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );
      if (res.ok) return res;
      last = res;
      const transient = res.status === 503 || res.status === 429 || res.status >= 500;
      if (!transient) return res;
      await sleep(Math.min(1000 * Math.pow(2, round), 8000));
    }
  }
  return last as Response;
}

async function analyzeVideoWithGeminiFile(fileUri: string, mimeType: string): Promise<{
  transcript: string; hook_visual: string; visual_observations: string; overall_energy: string;
}> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  const prompt = `Analyze this video carefully. Watch it fully and provide:

1. TRANSCRIPT: Full word-for-word transcript of everything spoken/said
2. HOOK_VISUAL: What happens visually in the first 3-5 seconds
3. VISUAL_OBSERVATIONS: Editing style, pacing, text overlays, engagement tactics
4. OVERALL_ENERGY: "low", "medium", or "high"

Respond ONLY with valid JSON:
{
  "transcript": "...",
  "hook_visual": "...",
  "visual_observations": "...",
  "overall_energy": "low|medium|high"
}`;

  const body = JSON.stringify({
    contents: [{ parts: [
      { file_data: { mime_type: mimeType, file_uri: fileUri } },
      { text: prompt },
    ]}],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });

  const response = await callGeminiWithRetry(body, geminiApiKey);
  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty Gemini response');

  try {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('No JSON in Gemini response');
  } catch {
    return { transcript: content, hook_visual: '', visual_observations: '', overall_energy: 'medium' };
  }
}

async function analyzeWithClaude(
  videoTitle: string,
  geminiData: { transcript: string; hook_visual: string; visual_observations: string; overall_energy: string },
  profile: { channel_niche: string; channel_description: string; channel_context: string; creator_level?: string },
  videoContext?: string,
  supabase?: any
) {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) throw new Error('Anthropic API key not configured');

  let knowledgeBaseSection = '';
  if (supabase) {
    const { data: kbRecords } = await supabase.from('knowledge_base').select('category, title, content').order('category');
    if (kbRecords?.length) {
      knowledgeBaseSection = kbRecords.map((r: any) => `[${r.category}] ${r.title}: ${r.content}`).join('\n');
    }
  }

  const level = profile.creator_level || 'intermediate';

  const systemPrompt = `You analyze YouTube Shorts and tell creators exactly what's killing performance and how to fix it.

CREATOR LEVEL: ${level}
- beginner: explain the "why", avoid jargon, focus on the 1-2 fundamentals that matter most. Encouraging but honest.
- intermediate: skip fundamentals (they know hook/retention/CTA). Focus on execution and what to change specifically.
- advanced: reference advanced concepts (pattern interrupts, retention curves, loop mechanics, cold opens). Challenge assumptions, be opinionated.

HARD RULES
1. Ground every claim in the transcript, visuals, or stats. If you can't cite it, don't say it.
2. Never invent retention numbers, views, or stats. If retention is N/A, analyze on structure/hook/content only.
3. If niche/channel profile is N/A, analyze the video on its own merits. Don't guess the niche.
4. Banned generic phrases: "engaging content", "great hook", "good pacing", "keep it up", "consider adding", "you could try", "just make sure", "overall this is a solid video".
5. No flattery. No recap of what the video does. Tell them what's wrong.
6. strong_spots and weak_spots: only what's genuinely true, min 1 max 3 each. Don't pad.

SCORING (overall_score: integer 1-100). Build it from components so it spreads — do NOT pick a round number or default to the 70s.
Score FOUR components, then SUM into overall_score:
- Hook strength (0-30): does the first 0-3s stop the scroll for THIS format's hook?
- Retention & pacing (0-25): does it hold attention — no dead air, no drag, no filler?
- Payoff & ending (0-25): does it deliver on the hook's promise and end with a reason to stay/act?
- Clarity & delivery (0-20): audio, visuals, energy, comprehension.
overall_score = hook + retention + payoff + delivery. Output the EXACT sum, avoid magnet numbers (50, 70, 75, 80).
Bands (sanity-check only): 85-100 exceptional (rare), 70-84 strong, 55-69 decent with clear fixes, 40-54 below average, 25-39 weak, 1-24 broken.
A strong Short earns 80+; a weak or average one MUST land below 60. Never inflate to be nice.

OUTPUT (overall_assessment): 3-4 sentences, senior creator to a peer. No fixed template, vary your opening. Cover the main issue, how the hook performs specifically, one structural/visual observation, and end with the single most important fix. Sound like a real person, not a report. Break it into 2-3 short paragraphs separated by a blank line (\\n\\n) so it's easy to read - never one dense block.

PUNCTUATION: never use em-dash (—) or en-dash (–) anywhere. Only the regular hyphen (-).

TONE: peer-to-peer senior creator notes. Zero fluff, direct, specific, opinionated. Like texting a friend a real review.

${knowledgeBaseSection ? `Knowledge base (use as instinct, don't quote):\n${knowledgeBaseSection}\n` : ''}`;

  const hasProfile = profile.channel_niche || profile.channel_description;
  const profileSection = hasProfile
    ? `Niche: ${profile.channel_niche || 'N/A'}\nDescription: ${profile.channel_description || 'N/A'}${profile.channel_context ? `\nAdditional Context: ${profile.channel_context}` : ''}`
    : `N/A — channel profile not provided`;

  const prompt = `## Video Stats
Title: ${videoTitle || 'N/A'}
Duration: N/A — not yet available
Views: N/A — not published yet
Likes: N/A — not published yet
Source: Uploaded file

## Retention Data
N/A — retention data not available for this video.
Analyze based on structure, hook, and content only.

## Video Analysis (from Gemini)
Transcript: ${geminiData.transcript || 'N/A — transcript not available'}
Visual hook (0-3 sec): ${geminiData.hook_visual || 'N/A — visual hook not captured'}
Visual observations: ${geminiData.visual_observations || 'N/A — no visual observations'}
Energy level: ${geminiData.overall_energy || 'N/A'}

## Channel Profile
${profileSection}

## User Context
${videoContext?.trim() || 'N/A — no extra context provided'}

Respond with valid JSON only:
{
  "overall_score": <integer 1-100, the EXACT sum of the four scoring components above>,
  "score_breakdown": { "hook": <0-30>, "retention": <0-25>, "payoff": <0-25>, "delivery": <0-20> },
  "overall_assessment": "3-4 sentences about hook effectiveness, what works and what doesn't",
  "strong_spots": ["what specifically works and why (1-3 items, only real ones)"],
  "weak_spots": ["issue + actionable fix (1-3 items, only real ones)"]
}`;

  const claudeBody = JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, system: systemPrompt, messages: [{ role: 'user', content: prompt }] });

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

  if (!response || !response.ok) throw new Error(`Claude API error: ${await response?.text() ?? 'No response'}`);

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
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return stripDashes(JSON.parse(m[0]));
    throw new Error('No JSON in Claude response');
  } catch {
    return { overall_assessment: content.substring(0, 500).replace(/[—–]/g, '-'), weak_spots: [], new_hook_ideas: [] };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

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

    // Verify the JWT signature via the auth server, then read id/email from the
    // VERIFIED user. Never trust raw token claims — the signature isn't checked
    // by the gateway, so a decoded-only token could be forged (e.g. admin email).
    let userId: string;
    let userEmail: string;
    try {
      const { data: { user: u }, error } = await supabase.auth.getUser(token);
      if (error || !u) throw new Error('invalid token');
      userId = u.id;
      userEmail = u.email || '';
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { geminiFileName, videoContext, fileName, mimeType } = await req.json();
    if (!geminiFileName) {
      return new Response(JSON.stringify({ error: 'geminiFileName required' }), { status: 400, headers: corsHeaders });
    }

    console.log(`[analyze-upload] user=${userId}, geminiFileName=${geminiFileName}`);

    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, analyses_used, analyses_reset_at, channel_niche, channel_description, channel_context, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    const isAdmin = userEmail === ADMIN_EMAIL;

    // Video upload available on all plans
    const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 100 };
    let analysesUsed = tokenRow?.analyses_used || 0;
    const analysesLimit = isAdmin ? Infinity : (PLAN_LIMITS[plan] ?? 3);

    // Free video analyses are lifetime (3 total). Monthly reset for paid plans only.
    if (plan !== 'free' && tokenRow?.analyses_reset_at) {
      const resetAt = new Date(tokenRow.analyses_reset_at);
      if (new Date() > resetAt) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabase.from('user_tokens').update({ analyses_used: 0, analyses_reset_at: newResetAt.toISOString() }).eq('user_id', userId);
        analysesUsed = 0;
      }
    }

    if (analysesUsed >= analysesLimit) {
      deleteGeminiFile(geminiFileName);
      return new Response(
        JSON.stringify({ error: 'Analysis limit reached. Please upgrade your plan.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiApiKey) throw new Error('Gemini API key not configured');

      // Poll until Gemini file is ACTIVE
      console.log('[analyze-upload] Polling for ACTIVE state...');
      let geminiFileUri = '';
      let fileMimeType = mimeType || 'video/mp4';

      for (let i = 0; i < 30; i++) {
        const stateRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiApiKey}`
        );
        if (!stateRes.ok) throw new Error(`Poll failed: ${await stateRes.text()}`);
        const stateData = await stateRes.json();
        console.log(`[analyze-upload] Poll ${i + 1}: state=${stateData.state}`);

        if (stateData.state === 'ACTIVE') {
          geminiFileUri = stateData.uri;
          fileMimeType = stateData.mimeType || fileMimeType;
          break;
        }
        if (stateData.state === 'FAILED') throw new Error('Gemini file processing failed');
        await new Promise(r => setTimeout(r, 3000));
      }

      if (!geminiFileUri) throw new Error('Gemini file processing timed out');
      console.log('[analyze-upload] File ACTIVE, analyzing...');

      const geminiData = await analyzeVideoWithGeminiFile(geminiFileUri, fileMimeType);
      console.log('[analyze-upload] Gemini analysis done');

      const profile = {
        channel_niche: tokenRow?.channel_niche || '',
        channel_description: tokenRow?.channel_description || '',
        channel_context: tokenRow?.channel_context || '',
        creator_level: tokenRow?.creator_level || 'intermediate',
      };

      const videoTitle = (fileName || 'video').replace(/\.[^.]+$/, '');
      const analysis = await analyzeWithClaude(videoTitle, geminiData, profile, videoContext, supabase);

      const { data: analysisData, error: analysisError } = await supabase
        .from('analyses')
        .insert({
          user_id: userId,
          video_ids: [],
          hook_analysis: { overall_assessment: analysis.overall_assessment, overall_score: analysis.overall_score, score_breakdown: analysis.score_breakdown || null, title: videoTitle || null, source: 'upload' },
          strong_spots: analysis.strong_spots || [],
          weak_spots: analysis.weak_spots,
          new_hook_ideas: [],
          analysis_type: 'advanced',
        })
        .select()
        .single();

      if (analysisError) throw analysisError;

      await supabase.from('user_tokens').update({ analyses_used: analysesUsed + 1 }).eq('user_id', userId);

      return new Response(
        JSON.stringify({ success: true, analysis: analysisData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      deleteGeminiFile(geminiFileName);
    }
  } catch (error) {
    console.error('[analyze-upload] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
