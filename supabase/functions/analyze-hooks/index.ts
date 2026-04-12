import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  videoIds?: string[];
  script?: string;
  videoContext?: string;
}

interface UserProfile {
  channel_niche: string;
  channel_description: string;
  target_audience: string;
  channel_context: string;
}

async function analyzeWithClaude(videos: any[], profile: UserProfile, videoContext?: string) {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) throw new Error('Anthropic API key not configured');

  const videosData = videos.map(v => ({
    title: v.title,
    views: v.views,
    retention: v.retention_percentage,
    avgViewDuration: v.average_view_duration,
    ...(v.script ? { script: v.script } : {}),
  }));

  const profileSection = [
    profile.channel_niche && `Channel Niche: ${profile.channel_niche}`,
    profile.channel_description && `Channel Description: ${profile.channel_description}`,
    profile.target_audience && `Target Audience: ${profile.target_audience}`,
    profile.channel_context && `Additional Context: ${profile.channel_context}`,
  ].filter(Boolean).join('\n');

  const profileBlock = profileSection ? `\n## Channel Profile\n${profileSection}\n` : '';
  const videoContextBlock = videoContext?.trim() ? `\nVideo-specific context: ${videoContext.trim()}\n` : '';
  const hasScripts = videos.some(v => v.script);

  const prompt = `Analyze these YouTube Shorts videos to identify hook patterns, weak spots, and generate new hook ideas.${profileBlock}${videoContextBlock}
## Videos
${JSON.stringify(videosData, null, 2)}

Analyze based on:
- Video titles and how their structure/style correlates with views and retention
- Retention % and average view duration as signals of hook effectiveness
${hasScripts ? '- Video scripts where provided — examine the actual opening lines as the hook' : ''}
${profileSection ? '- Channel profile above to tailor all recommendations to this creator\'s specific niche and audience' : ''}
${videoContext?.trim() ? '- Video-specific context above to make recommendations hyper-relevant to this particular video' : ''}

Provide a JSON response with this exact structure (ALL fields required):
{
  "overall_assessment": "3-4 sentences summarizing hook patterns and what is/isn't working",
  "weak_spots": [
    "Max 2 sentences. One specific issue + one actionable fix.",
    "Max 2 sentences. One specific issue + one actionable fix.",
    "Max 2 sentences. One specific issue + one actionable fix."
  ],
  "new_hook_ideas": [
    {"hook": "exact hook text ready to use", "reasoning": "one sentence why this works for this channel"},
    {"hook": "exact hook text ready to use", "reasoning": "one sentence why this works for this channel"},
    {"hook": "exact hook text ready to use", "reasoning": "one sentence why this works for this channel"}
  ]
}

Rules:
- weak_spots: EXACTLY 3 items, max 2 sentences each, be specific and actionable
- new_hook_ideas: EXACTLY 3 items, hooks should feel native to this creator's voice
- Respond with valid JSON only, no markdown fences`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('No JSON in response');
  } catch {
    return {
      overall_assessment: content.substring(0, 300),
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

    const { videoIds, script, videoContext }: RequestBody = await req.json();
    console.log(`[analyze] user=${userId}, videoIds=${videoIds?.join(',')}, hasScript=${!!script?.trim()}`);

    const { data: tokenRow, error: tokenError } = await supabase
      .from('user_tokens')
      .select('plan, analyses_used, analyses_reset_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError) throw tokenError;

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

    let query = supabase
      .from('videos')
      .select('video_id, title, views, retention_percentage, average_view_duration, script')
      .eq('user_id', userId);

    if (videoIds && videoIds.length > 0) {
      query = query.in('video_id', videoIds);
    }

    const [videosResult, profileResult] = await Promise.all([
      query.order('published_at', { ascending: false }),
      supabase
        .from('user_tokens')
        .select('channel_niche, channel_description, target_audience, channel_context')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (videosResult.error) throw videosResult.error;
    if (!videosResult.data || videosResult.data.length === 0) {
      throw new Error('No videos found to analyze');
    }

    const profile: UserProfile = {
      channel_niche: profileResult.data?.channel_niche || '',
      channel_description: profileResult.data?.channel_description || '',
      target_audience: profileResult.data?.target_audience || '',
      channel_context: profileResult.data?.channel_context || '',
    };

    const videosWithScript = videosResult.data.map((v: any, idx: number) =>
      idx === 0 && script?.trim() ? { ...v, script: script.trim() } : v
    );
    const analysisType = script?.trim() ? 'advanced' : 'basic';

    console.log(`[analyze] Running Claude on ${videosWithScript.length} videos, type=${analysisType}`);
    const analysis = await analyzeWithClaude(videosWithScript, profile, videoContext);

    const { data: analysisData, error: analysisError } = await supabase
      .from('analyses')
      .insert({
        user_id: userId,
        video_ids: videosResult.data.map((v: any) => v.video_id),
        hook_analysis: { overall_assessment: analysis.overall_assessment },
        weak_spots: analysis.weak_spots,
        new_hook_ideas: analysis.new_hook_ideas,
        analysis_type: analysisType,
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    await supabase
      .from('user_tokens')
      .update({ analyses_used: analysesUsed + 1 })
      .eq('user_id', userId);

    return new Response(
      JSON.stringify({ success: true, analysis: analysisData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[analyze] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
