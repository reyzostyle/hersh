import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { loadChannelScan, channelScanBlock } from '../_shared/channel-scan.ts';
import { loadBrain, brainBlock } from '../_shared/brain.ts';
import { generateOutline } from '../_shared/steal.ts';

const CORS = corsHeaders({ methods: 'GET, POST, PUT, DELETE, OPTIONS' });

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

// Verifies the JWT signature via the auth server (not just decoding it) and
// returns the authenticated user id. Throws on any invalid/forged token.
async function getUserIdFromToken(supabase: any, token: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('invalid token');
  return user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const token = authHeader.replace('Bearer ', '');

    let userId: string;
    try {
      userId = await getUserIdFromToken(supabase, token);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: CORS });
    }

    const { data: { user: authUser }, error: adminError } = await supabase.auth.admin.getUserById(userId);
    if (adminError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const isAdmin = authUser.email === ADMIN_EMAIL;

    // No plan gate. Competitors used to be Plus-only in five separate places,
    // which meant nobody could see the feature before paying for it - and the
    // gate was redundant anyway: the credit pool already is the trial. A free
    // account has 20 credits, one-time, and this costs four of them.
    const { data: profile } = await supabase
      .from('user_tokens')
      .select('channel_niche, channel_description, channel_context, target_audience')
      .eq('user_id', userId).maybeSingle();
    const creditStatus = await loadCreditStatus(supabase, userId);
    const cost = CREDIT_COSTS.competitor_outline;
    if (!canAfford(creditStatus, cost, isAdmin)) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { ideaId } = await req.json();
    if (!ideaId) {
      return new Response(
        JSON.stringify({ error: 'ideaId is required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
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
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[generate-outline] Watching video for idea:', ideaId);
    // The brain if it has been built, the four hand-typed boxes if not. See
    // _shared/brain.ts: an outline written against an empty profile is an
    // outline written for nobody, which is what most of these were.
    const brain = await loadBrain(supabase, userId);
    const profileBlock = brain ? brainBlock(brain) : `## What they told us about their channel
Niche: ${profile?.channel_niche || 'not set'}
Description: ${profile?.channel_description || 'not set'}
Audience: ${profile?.target_audience || 'not set'}
Extra context: ${profile?.channel_context || 'not set'}`;
    const scanBlock = channelScanBlock(await loadChannelScan(supabase, userId));

    const outline = await generateOutline(
      idea.video_id,
      idea.video_title || '',
      idea.adapted_idea || '',
      profileBlock,
      scanBlock,
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
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-outline] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
