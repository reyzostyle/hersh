import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';
// Hook Lab has its OWN monthly quota (separate from video analyses).
// Free = 10 hook checks / month (resets monthly).
const HOOK_LIMITS: Record<string, number> = { free: 10, pro: 50, agency: 200 };

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

    // ── Usage / plan (Hook Lab has its own monthly quota: hooks_used) ─────────
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, hooks_used, hooks_reset_at, channel_niche, channel_description, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    let hooksUsed = tokenRow?.hooks_used || 0;
    const hooksLimit = isAdmin ? Infinity : (HOOK_LIMITS[plan] ?? 10);

    // Hook quota resets monthly for EVERY plan (incl. free).
    if (tokenRow?.hooks_reset_at) {
      const resetAt = new Date(tokenRow.hooks_reset_at);
      if (new Date() > resetAt) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabase.from('user_tokens').update({ hooks_used: 0, hooks_reset_at: newResetAt.toISOString() }).eq('user_id', userId);
        hooksUsed = 0;
      }
    }

    if (hooksUsed >= hooksLimit) {
      return new Response(JSON.stringify({ error: "You've used all your hook checks this month. Upgrade for more." }), { status: 403, headers: corsHeaders });
    }

    // ── Build prompt ──────────────────────────────────────────────────────────
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) throw new Error('Anthropic API key not configured');

    const profile = [
      tokenRow?.channel_niche && `Channel niche: ${tokenRow.channel_niche}`,
      tokenRow?.channel_description && `Channel description: ${tokenRow.channel_description}`,
      tokenRow?.creator_level && `Creator level: ${tokenRow.creator_level}`,
      context && `Extra context: ${context}`,
    ].filter(Boolean).join('\n');

    const prompt = `You are a ruthless short-form hook critic. Score the HOOK below — the opening line(s) of a YouTube Short / TikTok / Reel — on how well it stops the scroll in the first 2 seconds.

${profile ? `CREATOR CONTEXT:\n${profile}\n\n` : ''}HOOK TO ANALYZE:
"""${hook.trim()}"""

SCORING (1.0-10.0, 0.5 steps) — use the FULL range in BOTH directions and reward genuinely strong hooks. Do NOT cap at 7. Anchors:
- 9.0-10.0: exceptional. Instantly stops the scroll — strong curiosity gap, bold stakes, or specificity that forces the watch. Rare, but give it when earned.
- 8.0-8.5: strong. Would perform well; clear tension/specificity, little to fix. Most hooks that genuinely nail it land here.
- 6.5-7.5: solid. Works, but has one fixable weakness.
- 4.5-6.0: mediocre/middle — generic, slow, or scrollable.
- 1.0-4.0: weak — tells instead of hooks, no tension, no reason to stay.
Calibrate fairly: a really good hook deserves an 8 or 9 — say so. But never inflate a weak or generic hook just to be nice.
- Be specific and concrete. No generic praise. Banned phrases: "engaging", "great hook", "good", "consider", "you could try", "make sure".
- issues: 1-3 concrete reasons it loses the viewer (or why it works). Be blunt.
- rewrites: EXACTLY 3 stronger versions, ready to paste, in the creator's likely voice. Each must use a different angle (e.g. curiosity gap, bold claim, pattern interrupt, specific number, stakes).

Return ONLY valid JSON, no markdown:
{
  "score": 6.5,
  "verdict": "one punchy sentence on the hook overall",
  "issues": ["...", "..."],
  "rewrites": [
    {"hook": "exact rewrite ready to use", "why": "one sentence why it's stronger"},
    {"hook": "...", "why": "..."},
    {"hook": "...", "why": "..."}
  ]
}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Claude error (${aiRes.status}): ${errText}`);
    }

    const aiData = await aiRes.json();
    let content = aiData.content?.[0]?.text || '';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse analysis. Try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    result = stripDashes(result);

    // Count this hook check toward the monthly hook quota
    await supabase
      .from('user_tokens')
      .update({
        hooks_used: hooksUsed + 1,
        hooks_reset_at: tokenRow?.hooks_reset_at ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('user_id', userId);

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[analyze-hook-text] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
