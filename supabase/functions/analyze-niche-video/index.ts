import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  videoId: string;
  userStyle: string;
  videoTitle: string;
  channelName: string;
}

async function analyzeWithGemini(videoId: string): Promise<{
  about: string;
  hook: string;
  why_it_worked: string;
  what_to_keep: string;
}> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log('[analyze-niche-video] Gemini analyzing:', youtubeUrl);

  const prompt = `Watch this YouTube Short from a competitor channel. Your job is to help a creator understand it and adapt it for their own channel.

Provide:
1. ABOUT: What this video is about (1-2 sentences, no filler)
2. HOOK: The exact opening hook text or phrase used in the first 3-5 seconds
3. WHY_IT_WORKED: Why this video performs well — 2-3 specific reasons (pacing, topic relevance, hook structure, emotional trigger, etc.)
4. WHAT_TO_KEEP: What elements to preserve when adapting this video — 2-3 concrete points

Respond ONLY with valid JSON, no markdown:
{
  "about": "...",
  "hook": "...",
  "why_it_worked": "...",
  "what_to_keep": "..."
}`;

  const geminiBody = JSON.stringify({
    contents: [{
      parts: [
        { file_data: { mime_type: 'video/mp4', file_uri: youtubeUrl } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  });

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'];
  let response: Response | null = null;
  let lastError = '';

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
      );
      if (response.ok) break;
      lastError = await response.text();
      if ((response.status === 503 || response.status === 429) && attempt < 2) {
        await new Promise(r => setTimeout(r, 4000));
      } else break;
    }
    if (response?.ok) break;
  }

  if (!response?.ok) throw new Error(`Gemini API error: ${lastError}`);

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('No JSON in Gemini response');
  } catch {
    return { about: content.substring(0, 300), hook: '', why_it_worked: '', what_to_keep: '' };
  }
}

async function generateScripts(
  analysis: { about: string; hook: string; why_it_worked: string; what_to_keep: string },
  userStyle: string,
  videoTitle: string,
  channelName: string,
): Promise<Array<{ hookVariant: string; script: string; firstFrame: string }>> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  const styleSection = userStyle?.trim()
    ? `Creator's style and channel:\n${userStyle}`
    : 'Creator style: not specified. Write in a neutral, direct tone.';

  const prompt = `You are a YouTube Shorts scriptwriter. Based on a competitor video analysis, generate 3 distinct script variants for a Short adaptation.

Source video: "${videoTitle}" by ${channelName}

Video analysis:
- About: ${analysis.about}
- Original hook: ${analysis.hook}
- Why it worked: ${analysis.why_it_worked}
- What to keep when adapting: ${analysis.what_to_keep}

${styleSection}

Generate 3 DISTINCT script variants. Each must have:
- hookVariant: A unique opening hook (1-2 punchy sentences, max 15 words)
- script: Full Short script adapted to the creator's style (200-350 words). Include hook, main content, and a call to action. Format as a shooting script the creator can read directly.
- firstFrame: One sentence describing exactly what should appear on screen in the first frame (text overlay, visual, setting)

Rules:
- Each variant must use a different hook approach (question, bold statement, pattern interrupt)
- Adapt tone and style to match the creator's description
- Keep the core value/topic from the analysis but make it original
- No em-dashes, no filler phrases like "Hey guys" or "Don't forget to like"
- Write scripts in the same language as the creator's style description (Russian if Russian, English if English)

Respond ONLY with valid JSON:
{
  "variants": [
    {
      "hookVariant": "...",
      "script": "...",
      "firstFrame": "..."
    },
    {
      "hookVariant": "...",
      "script": "...",
      "firstFrame": "..."
    },
    {
      "hookVariant": "...",
      "script": "...",
      "firstFrame": "..."
    }
  ]
}`;

  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 3000 },
  });

  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'];
  let response: Response | null = null;
  let lastError = '';

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiBody }
      );
      if (response.ok) break;
      lastError = await response.text();
      if ((response.status === 503 || response.status === 429) && attempt < 2) {
        await new Promise(r => setTimeout(r, 4000));
      } else break;
    }
    if (response?.ok) break;
  }

  if (!response?.ok) throw new Error(`Gemini script generation error: ${lastError}`);

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty script response from Gemini');

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.variants || [];
    }
    throw new Error('No JSON in script response');
  } catch {
    return [];
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

    const { videoId, userStyle, videoTitle, channelName }: RequestBody = await req.json();
    if (!videoId) {
      return new Response(JSON.stringify({ error: 'videoId is required' }), { status: 400, headers: corsHeaders });
    }

    console.log(`[analyze-niche-video] user=${user.id}, videoId=${videoId}`);

    const analysis = await analyzeWithGemini(videoId);
    console.log('[analyze-niche-video] Analysis done');

    const scripts = await generateScripts(analysis, userStyle, videoTitle || videoId, channelName || 'competitor');
    console.log(`[analyze-niche-video] Generated ${scripts.length} script variants`);

    return new Response(
      JSON.stringify({ analysis, scripts }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[analyze-niche-video] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
