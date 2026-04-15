import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

async function uploadToGeminiFileApi(fileBytes: Uint8Array, mimeType: string, displayName: string): Promise<{ uri: string; name: string }> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  const fileSize = fileBytes.length;
  console.log(`[gemini-file] Starting upload, size=${fileSize}, mime=${mimeType}`);

  // Initiate resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );

  if (!initRes.ok) throw new Error(`Gemini File API init failed: ${await initRes.text()}`);

  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL from Gemini File API');
  console.log('[gemini-file] Got upload URL');

  // Upload bytes
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileBytes,
  });

  if (!uploadRes.ok) throw new Error(`Gemini file upload failed: ${await uploadRes.text()}`);

  const uploadData = await uploadRes.json();
  const geminiFileName = uploadData.file?.name;
  if (!geminiFileName) throw new Error('No file name from Gemini File API');

  console.log(`[gemini-file] Uploaded: ${geminiFileName}, state: ${uploadData.file?.state}`);

  // Poll until ACTIVE
  for (let i = 0; i < 30; i++) {
    const stateRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiApiKey}`
    );
    if (!stateRes.ok) throw new Error(`Poll failed: ${await stateRes.text()}`);
    const stateData = await stateRes.json();
    console.log(`[gemini-file] Poll ${i + 1}: state=${stateData.state}`);

    if (stateData.state === 'ACTIVE') return { uri: stateData.uri, name: geminiFileName };
    if (stateData.state === 'FAILED') throw new Error('Gemini file processing failed');
    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error('Gemini file processing timed out');
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
  profile: { channel_niche: string; channel_description: string; channel_context: string },
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

  const systemPrompt = `You are a world-class content director who has studied thousands of viral YouTube Shorts.
You think like a viewer, not like a checklist.

You have deep knowledge of what makes Shorts go viral — hooks, retention, loops, emotional triggers, pacing.

${knowledgeBaseSection ? `Knowledge base:\n${knowledgeBaseSection}\n` : ''}
When you analyze a Short, think like this:
- Would a real viewer stop scrolling? Why or why not?
- Where would they lose interest and why?
- What is the one thing that will make or break this video?

Give your analysis as a content director talking to a creator — direct, specific, opinionated. Lead with the most important insight first. Maximum 3 key points. Be brutally honest but constructive.`;

  const profileSection = [
    profile.channel_niche && `Channel Niche: ${profile.channel_niche}`,
    profile.channel_description && `Channel Description: ${profile.channel_description}`,
    profile.channel_context && `Additional Context: ${profile.channel_context}`,
  ].filter(Boolean).join('\n');

  const prompt = `## Video
Title: ${videoTitle}
Note: This is an unpublished video uploaded for pre-publish analysis.

## Gemini Video Analysis
Transcript: ${geminiData.transcript || 'Not available'}
Visual Hook (first 3-5 sec): ${geminiData.hook_visual || 'Not available'}
Visual Observations: ${geminiData.visual_observations || 'Not available'}
Overall Energy: ${geminiData.overall_energy}

${profileSection ? `## Channel Profile\n${profileSection}\n` : ''}
${videoContext?.trim() ? `## Additional Context\n${videoContext}\n` : ''}

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

    // Expect JSON body with storagePath
    const { storagePath, videoContext, fileName } = await req.json();
    if (!storagePath) {
      return new Response(JSON.stringify({ error: 'storagePath required' }), { status: 400, headers: corsHeaders });
    }

    console.log(`[analyze-upload] user=${userId}, path=${storagePath}`);

    // Check plan — Pro (agency) required
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, analyses_used, analyses_reset_at, channel_niche, channel_description, channel_context')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    const isAdmin = user.email === ADMIN_EMAIL;

    if (!isAdmin && plan !== 'agency') {
      // Cleanup storage
      await supabase.storage.from('video-upload').remove([storagePath]);
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
      await supabase.storage.from('video-upload').remove([storagePath]);
      return new Response(
        JSON.stringify({ error: 'Analysis limit reached. Please upgrade your plan.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download file from Supabase Storage
    console.log('[analyze-upload] Downloading from storage...');
    const { data: fileBlob, error: dlError } = await supabase.storage.from('video-upload').download(storagePath);
    if (dlError || !fileBlob) throw new Error(`Storage download failed: ${dlError?.message}`);

    const fileBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const mimeType = fileBlob.type || 'video/mp4';
    console.log(`[analyze-upload] Downloaded ${fileBytes.length} bytes`);

    // Cleanup storage right away
    supabase.storage.from('video-upload').remove([storagePath]).catch(e => console.log('[analyze-upload] Storage cleanup error:', e));

    let geminiFileName = '';
    try {
      // Upload to Gemini File API
      console.log('[analyze-upload] Uploading to Gemini...');
      const { uri: geminiFileUri, name } = await uploadToGeminiFileApi(fileBytes, mimeType, fileName || 'video');
      geminiFileName = name;
      console.log('[analyze-upload] Gemini ready:', geminiFileUri);

      // Analyze with Gemini
      const geminiData = await analyzeVideoWithGeminiFile(geminiFileUri, mimeType);
      console.log('[analyze-upload] Gemini analysis done');

      const profile = {
        channel_niche: tokenRow?.channel_niche || '',
        channel_description: tokenRow?.channel_description || '',
        channel_context: tokenRow?.channel_context || '',
      };

      // Analyze with Claude
      const videoTitle = (fileName || 'video').replace(/\.[^.]+$/, '');
      const analysis = await analyzeWithClaude(videoTitle, geminiData, profile, videoContext, supabase);

      // Save analysis
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
      // Always delete Gemini file
      if (geminiFileName) {
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
        if (geminiApiKey) {
          fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${geminiApiKey}`, { method: 'DELETE' })
            .catch(e => console.log('[analyze-upload] Gemini cleanup error:', e));
        }
      }
    }
  } catch (error) {
    console.error('[analyze-upload] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
