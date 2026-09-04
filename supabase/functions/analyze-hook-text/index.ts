import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { parseModelJson } from '../_shared/json.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

const stripDashes = (s: unknown): unknown => {
  if (typeof s === 'string') return s.replace(/[—–]/g, '-');
  if (Array.isArray(s)) return s.map(stripDashes);
  if (s && typeof s === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) o[k] = stripDashes(v);
    return o;
  }
  return s;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify the JWT signature via the auth server (never trust a decoded-only token)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;
    const isAdmin = (user.email || '') === ADMIN_EMAIL;

    const { hook, context } = await req.json();
    if (!hook || typeof hook !== 'string' || !hook.trim()) {
      return new Response(JSON.stringify({ error: 'hook text required' }), { status: 400, headers: corsHeaders });
    }
    if (hook.length > 600) {
      return new Response(JSON.stringify({ error: 'Hook too long (max 600 chars)' }), { status: 400, headers: corsHeaders });
    }

    // ── Usage / plan (shared credit pool — see _shared/credits.ts) ────────────
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, channel_niche, channel_description, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const creditStatus = await loadCreditStatus(supabase, userId);
    const cost = CREDIT_COSTS.hook_check;

    if (!canAfford(creditStatus, cost, isAdmin)) {
      const message = creditStatus.plan === 'agency'
        ? "You've hit this month's fair-use credit limit. Contact us if you need more."
        : "You've used all your credits this month. Upgrade for more.";
      return new Response(JSON.stringify({ error: message }), { status: 403, headers: corsHeaders });
    }

    // ── Build prompt ──────────────────────────────────────────────────────────
    // Per-hook context, when provided, OVERRIDES the channel profile from settings.
    const hasContext = context && typeof context === 'string' && context.trim();
    const profile = (hasContext
      ? [
          `Creator context: ${context.trim()}`,
          tokenRow?.creator_level && `Creator level: ${tokenRow.creator_level}`,
        ]
      : [
          tokenRow?.channel_niche && `Channel niche: ${tokenRow.channel_niche}`,
          tokenRow?.channel_description && `Channel description: ${tokenRow.channel_description}`,
          tokenRow?.creator_level && `Creator level: ${tokenRow.creator_level}`,
        ]
    ).filter(Boolean).join('\n');

    const prompt = `You are a viral short-form copywriter - you rewrite weak hooks into ones that stop the scroll, you don't just critique them. Score the HOOK below - the opening line(s) of a YouTube Short / TikTok / Reel - on how well it stops the scroll in the first 2 seconds, then hand back copy-paste-ready fixes.

${profile ? `CREATOR CONTEXT:\n${profile}\n\n` : ''}HOOK TO ANALYZE:
"""${hook.trim()}"""

SCORING (score: integer 1-100). Build it from FOUR components, then SUM - do NOT pick a round number or default to the 70s:
- Scroll-stop (0-30): does it grab attention in the first 2 seconds?
- Curiosity (0-30): open loop, tension or intrigue that forces the watch?
- Clarity (0-20): instantly understandable, zero confusion?
- Specificity (0-20): concrete and specific, relevant to this creator's audience?
score = scrollstop + curiosity + clarity + specificity. Output the EXACT sum, avoid magnet numbers (50, 70, 75, 80).
Bands (sanity-check only): 85-100 exceptional (rare), 70-84 strong, 55-69 decent, 40-54 mediocre, 25-39 weak, 1-24 broken.
A genuinely strong hook earns 80+; a generic or scrollable one MUST land below 60. Never inflate to be nice.
- issues: 1-3 concrete, fixable problems - never abstract criticism like "lacks curiosity" on its own. Where the fix is a word swap, give it directly: 'Replace "make money" with "print cash"' - not "use stronger words". Be blunt.
- rewrites: EXACTLY 3 hooks, each finished and copy-paste-ready as-is (not a direction to adapt), one per angle below, in this order:
  1. Negative/Risk: leads with a cost of inaction or a mistake to avoid (e.g. "Stop doing X if you want Y").
  2. Curiosity Gap / Shock Stat: an open loop or surprising number that forces the watch (e.g. "How X made $100k using this 1 secret").
  3. Contrarian / Pattern Interrupt: challenges what the audience already believes (e.g. "Everything you know about X is wrong").
  Each rewrite must use the actual topic/specifics of the hook above, not a generic template with blanks filled in. In "why", name the angle and the one thing that makes THIS version pull harder than the original.
- PUNCTUATION: never use em-dash (—) or en-dash (–) anywhere, only the regular hyphen (-).

Return ONLY valid JSON, no markdown:
{
  "score": <integer 1-100, the EXACT sum of the four components>,
  "score_breakdown": { "scrollstop": <0-30>, "curiosity": <0-30>, "clarity": <0-20>, "specificity": <0-20> },
  "verdict": "one punchy sentence on the hook overall",
  "issues": ["...", "..."],
  "rewrites": [
    {"hook": "finished Negative/Risk hook, ready to use as-is", "why": "one sentence: the angle + why it pulls harder"},
    {"hook": "finished Curiosity Gap / Shock Stat hook, ready to use as-is", "why": "..."},
    {"hook": "finished Contrarian / Pattern Interrupt hook, ready to use as-is", "why": "..."}
  ]
}`;

    let content = await callLLM(prompt, { maxTokens: 1200 });
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Extract the JSON object rather than parsing the string outright — Claude
    // reliably returns bare JSON for this prompt, but that's a per-model habit,
    // not a guarantee, and other providers can preface it with a sentence.
    let result;
    try {
      result = parseModelJson(content);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse analysis. Try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    result = stripDashes(result);

    await spendCredits(supabase, userId, creditStatus, cost);

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[analyze-hook-text] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
