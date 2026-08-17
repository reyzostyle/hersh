import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

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

async function generateOutline(
  videoTitle: string,
  adaptedIdea: string
): Promise<{ hook: string; sections: Array<{ title: string; content: string; duration: string }>; cta: string }> {
  const prompt = `You are a YouTube Shorts expert. Generate a concise video outline for a Short based on this adapted idea.

Video idea: ${adaptedIdea}
Inspired by competitor video: "${videoTitle}"

Create a Short outline for a 45-90 second video. Follow this exact JSON format:

{
  "hook": "exact hook text spoken in first 3 seconds - make it punchy and attention-grabbing",
  "sections": [
    { "title": "Section name", "content": "what to say or show in this section", "duration": "10s" },
    { "title": "Section name", "content": "what to say or show in this section", "duration": "15s" },
    { "title": "Section name", "content": "what to say or show in this section", "duration": "20s" }
  ],
  "cta": "closing line that drives engagement or follow"
}

Rules:
- 3 to 4 sections total
- Hook must be the first thing said, not an intro
- Sections should build logically toward a payoff
- CTA should feel natural, not forced
- No em-dash or en-dash, only regular hyphen (-)
- Respond with JSON only, no markdown`;

  const content = await callLLM(prompt, { maxTokens: 1000 });

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return stripDashes(JSON.parse(jsonMatch[0])) as { hook: string; sections: Array<{ title: string; content: string; duration: string }>; cta: string };
    }
    throw new Error('No JSON in response');
  } catch {
    throw new Error('Failed to parse outline from Claude response');
  }
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

    const { data: { user: authUser }, error: adminError } = await supabase.auth.admin.getUserById(userId);
    if (adminError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const isAdmin = authUser.email === ADMIN_EMAIL;

    // Outlines are Plus+ (same gate as the rest of Competitors) and spend
    // from the shared credit pool — this used to have no plan/usage check at
    // all, see _shared/credits.ts.
    const { data: planRow } = await supabase.from('user_tokens').select('plan').eq('user_id', userId).maybeSingle();
    if ((planRow?.plan || 'free') === 'free') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'plus' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const creditStatus = await loadCreditStatus(supabase, userId);
    const cost = CREDIT_COSTS.competitor_outline;
    if (!canAfford(creditStatus, cost, isAdmin)) {
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

    console.log('[generate-outline] Generating outline for idea:', ideaId);
    const outline = await generateOutline(
      idea.video_title || '',
      idea.adapted_idea || ''
    );

    const { data: updated, error: updateError } = await supabase
      .from('competitor_ideas')
      .update({ outline })
      .eq('id', ideaId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    await spendCredits(supabase, userId, creditStatus, cost);

    return new Response(
      JSON.stringify({ success: true, idea: updated }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-outline] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
