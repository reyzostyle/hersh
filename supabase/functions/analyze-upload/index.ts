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

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'];
  const body = JSON.stringify({
    contents: [{ parts: [
      { file_data: { mime_type: mimeType, file_uri: fileUri } },
      { text: prompt },
    ]}],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  });

  let response: Response | null = null;
  let lastError = '';
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      );
      if (response.ok) break;
      lastError = await response.text();
      if ((response.status === 503 || response.status === 429) && attempt < 2) await new Promise(r => setTimeout(r, 4000));
      else break;
    }
    if (response?.ok) break;
  }

  if (!response?.ok) throw new Error(`Gemini API error: ${lastError}`);

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

  const levelInstructions: Record<string, string> = {
    beginner: 'The creator is a beginner — explain concepts clearly, avoid jargon, be encouraging but honest. Focus on the 1-2 most impactful fundamentals.',
    intermediate: 'The creator knows the basics — skip fundamentals, focus on execution details and what separates okay videos from great ones.',
    advanced: 'The creator is experienced — be nuanced, reference advanced concepts (pattern interrupts, retention curves, loop mechanics). Challenge their assumptions.',
  };
  const levelNote = levelInstructions[profile.creator_level || 'intermediate'] || levelInstructions.intermediate;

  const systemPrompt = `You are a world-class content director who has studied thousands of viral YouTube Shorts.
You think like a viewer, not like a checklist.

You have deep knowledge of what makes Shorts go viral — hooks, retention, loops, emotional triggers, pacing.

Creator level: ${levelNote}

${knowledgeBaseSection ? `Knowledge base:\n${knowledgeBaseSection}\n` : ''}
When you analyze a Short, think like this:
- Would a real viewer stop scrolling? Why or why not?
- Where would they lose interest and why?
- What is the one thing that will make or break this video?

Give your analysis as a content director talking to a creator — direct, specific, opinionated. Lead with the most important insight first. Maximum 3 key points. Be brutally honest but constructive.`;

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
  "overall_score": 6,
  "overall_assessment": "3-4 sentences about hook effectiveness",
  "weak_spots": ["issue + fix", "issue + fix", "issue + fix"],
  "new_hook_ideas": [
    {"hook": "exact hook text", "reasoning": "why this works"},
    {"hook": "exact hook text", "reasoning": "why this works"},
    {"hook": "exact hook text", "reasoning": "why this works"}
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 2500, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${await response.text()}`);

  const data = await response.json();
  const content = data.content[0].text;
  try {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('No JSON in Claude response');
  } catch {
    return { overall_assessment: content.substring(0, 500), weak_spots: [], new_hook_ideas: [] };
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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

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
    const isAdmin = user.email === ADMIN_EMAIL;

    if (!isAdmin && plan !== 'agency') {
      deleteGeminiFile(geminiFileName);
      return new Response(
        JSON.stringify({ error: 'Video file upload requires the Pro plan.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 50 };
    let analysesUsed = tokenRow?.analyses_used || 0;
    const analysesLimit = isAdmin ? Infinity : (PLAN_LIMITS[plan] ?? 3);

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
          hook_analysis: { overall_assessment: analysis.overall_assessment, overall_score: analysis.overall_score },
          weak_spots: analysis.weak_spots,
          new_hook_ideas: analysis.new_hook_ideas,
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
