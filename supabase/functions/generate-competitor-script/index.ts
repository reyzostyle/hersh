import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';

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

function stripDashes(s: string): string {
  return s.replace(/[—–]/g, '-');
}

async function generateScript(
  videoTitle: string,
  adaptedIdea: string,
  outline: { hook: string; sections: Array<{ title: string; content: string; duration: string }>; cta: string },
  channelContext?: string
): Promise<string> {
  const outlineText = [
    `Hook (first 3s): ${outline.hook}`,
    ...outline.sections.map(s => `${s.title} (${s.duration}): ${s.content}`),
    `CTA: ${outline.cta}`,
  ].join('\n');

  const contextSection = channelContext?.trim()
    ? `\nCreator's channel context (use this to match their style and pacing):\n${channelContext.trim()}\n`
    : '';

  const prompt = `You are a YouTube Shorts scriptwriter. Write a complete word-for-word script for a Short based on this outline.

Adapted idea: ${adaptedIdea}
Inspired by: "${videoTitle}"
${contextSection}
Outline:
${outlineText}

Write the full script as the creator would actually say it. Target length: 20-30 seconds when spoken aloud. That means roughly 50-80 words total - be ruthless about cutting anything that doesn't add value.

Rules:
- Word-for-word, as if the creator is speaking directly to the viewer
- Start immediately with the hook text - no intro, no "hey guys"
- Short punchy sentences only - if a sentence takes more than 2 seconds to say, split it
- Cut every filler word, every transition, every unnecessary setup
- End with the CTA integrated naturally in one short line
- No em-dash or en-dash, only regular hyphen (-)
- No stage directions or brackets - just the spoken words
- Do not add section headers or labels
- If the creator's context mentions their pacing style, match it exactly

Write the script now:`;

  const content = await callLLM(prompt, { maxTokens: 1500 });
  return stripDashes(content.trim());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Plan check — scripts are Pro only
    const { data: planRow } = await supabase
      .from('user_tokens').select('plan, script_used, script_reset_at').eq('user_id', userId).maybeSingle();
    const userPlan = planRow?.plan || 'free';
    if (userPlan !== 'pro' && userPlan !== 'agency') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'pro' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hidden monthly limit — Plus(pro): 30, Pro(agency): 50.
    const ADMIN_EMAIL = 'reyzostyle@gmail.com';
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
    const isAdmin = authUser?.email === ADMIN_EMAIL;
    const SCRIPT_LIMITS: Record<string, number> = { pro: 30, agency: 50 };
    const scriptLimit = SCRIPT_LIMITS[userPlan] ?? 30;
    let scriptUsed = planRow?.script_used || 0;
    // Monthly reset.
    if (planRow?.script_reset_at) {
      if (new Date() > new Date(planRow.script_reset_at)) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabase.from('user_tokens')
          .update({ script_used: 0, script_reset_at: newResetAt.toISOString() })
          .eq('user_id', userId);
        scriptUsed = 0;
      }
    } else {
      // First-ever script: start the monthly window.
      const newResetAt = new Date();
      newResetAt.setDate(newResetAt.getDate() + 30);
      await supabase.from('user_tokens')
        .update({ script_reset_at: newResetAt.toISOString() })
        .eq('user_id', userId);
    }
    if (!isAdmin && scriptUsed >= scriptLimit) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ideaId } = await req.json();
    if (!ideaId) {
      return new Response(
        JSON.stringify({ error: 'ideaId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: idea, error: ideaError } = await supabase
      .from('competitor_ideas')
      .select('*')
      .eq('id', ideaId)
      .eq('user_id', userId)
      .single();

    if (ideaError || !idea) {
      return new Response(
        JSON.stringify({ error: 'Idea not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!idea.outline) {
      return new Response(
        JSON.stringify({ error: 'Generate an outline first before writing the script' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load user's channel context for style matching
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('channel_context')
      .eq('user_id', userId)
      .maybeSingle();

    console.log('[generate-competitor-script] Generating script for idea:', ideaId);
    const script = await generateScript(
      idea.video_title || '',
      idea.adapted_idea || '',
      idea.outline as { hook: string; sections: Array<{ title: string; content: string; duration: string }>; cta: string },
      tokenRow?.channel_context || ''
    );

    const { data: updated, error: updateError } = await supabase
      .from('competitor_ideas')
      .update({ script })
      .eq('id', ideaId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabase.from('user_tokens')
      .update({ script_used: scriptUsed + 1 })
      .eq('user_id', userId);

    return new Response(
      JSON.stringify({ success: true, idea: updated }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-competitor-script] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
