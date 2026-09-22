import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { scoreScript, MAX_SCRIPT_CHARS } from '../_shared/text-scoring.ts';

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify the JWT signature via the auth server (never trust a decoded-only token)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const userId = user.id;
    const isAdmin = (user.email || '') === ADMIN_EMAIL;

    const { script, context } = await req.json();
    if (!script || typeof script !== 'string' || !script.trim()) {
      return new Response(JSON.stringify({ error: 'script text required' }), { status: 400, headers: CORS });
    }
    if (script.length > MAX_SCRIPT_CHARS) {
      return new Response(JSON.stringify({ error: `Script too long (max ${MAX_SCRIPT_CHARS} chars)` }), { status: 400, headers: CORS });
    }

    // ── Usage / plan (shared credit pool — see _shared/credits.ts) ────────────
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, channel_niche, channel_description, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const creditStatus = await loadCreditStatus(supabase, userId);
    const cost = CREDIT_COSTS.script_check;

    if (!canAfford(creditStatus, cost, isAdmin)) {
      const message = creditStatus.plan === 'agency'
        ? "You've hit this month's fair-use credit limit. Contact us if you need more."
        : "You've used all your credits this month. Upgrade for more.";
      return new Response(JSON.stringify({ error: message }), { status: 403, headers: CORS });
    }

    let result;
    try {
      result = await scoreScript(supabase, userId, script, context);
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Could not parse analysis. Try again.' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    await spendCredits(supabase, userId, creditStatus, cost);

    return new Response(JSON.stringify(result), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[analyze-script-text] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
