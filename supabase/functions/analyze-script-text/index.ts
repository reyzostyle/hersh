import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';
const MAX_SCRIPT_CHARS = 5000;
// Script analysis has its OWN monthly quota — separate from Hook Lab's
// hooks_used, and unrelated to script_used (competitor-script generation in
// generate-competitor-script, a different feature).
const SCRIPT_ANALYSIS_LIMITS: Record<string, number> = { free: 10, pro: 30, agency: 100 };

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

    const { script, context } = await req.json();
    if (!script || typeof script !== 'string' || !script.trim()) {
      return new Response(JSON.stringify({ error: 'script text required' }), { status: 400, headers: corsHeaders });
    }
    if (script.length > MAX_SCRIPT_CHARS) {
      return new Response(JSON.stringify({ error: `Script too long (max ${MAX_SCRIPT_CHARS} chars)` }), { status: 400, headers: corsHeaders });
    }

    // ── Usage / plan (Script analysis has its own monthly quota: script_analyses_used) ─
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan, script_analyses_used, script_analyses_reset_at, bonus_script_analyses, channel_niche, channel_description, creator_level')
      .eq('user_id', userId)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    let scriptAnalysesUsed = tokenRow?.script_analyses_used || 0;
    let bonusScriptAnalyses = tokenRow?.bonus_script_analyses || 0;

    // Quota resets monthly for EVERY plan (incl. free), same as Hook Lab.
    if (tokenRow?.script_analyses_reset_at) {
      const resetAt = new Date(tokenRow.script_analyses_reset_at);
      if (new Date() > resetAt) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabase.from('user_tokens').update({ script_analyses_used: 0, script_analyses_reset_at: newResetAt.toISOString(), bonus_script_analyses: 0 }).eq('user_id', userId);
        scriptAnalysesUsed = 0;
        bonusScriptAnalyses = 0;
      }
    }

    const scriptAnalysesLimit = isAdmin ? Infinity : (SCRIPT_ANALYSIS_LIMITS[plan] ?? 10) + bonusScriptAnalyses;

    if (scriptAnalysesUsed >= scriptAnalysesLimit) {
      const message = plan === 'agency'
        ? "You've hit this month's fair-use limit for script checks. Contact us if you need more."
        : "You've used all your script checks this month. Upgrade for more.";
      return new Response(JSON.stringify({ error: message }), { status: 403, headers: corsHeaders });
    }

    // ── Knowledge base (learned patterns), same as video Analysis ──────────────
    let knowledgeBaseSection = '';
    const { data: kbRecords } = await supabase.from('knowledge_base').select('category, title, content').order('category');
    if (kbRecords && kbRecords.length > 0) {
      knowledgeBaseSection = kbRecords.map((r: any) => `[${r.category}] ${r.title}: ${r.content}`).join('\n');
    }

    // ── Build prompt ──────────────────────────────────────────────────────────
    // Per-script context, when provided, OVERRIDES the channel profile from settings.
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

    const systemPrompt = `You review YouTube Shorts scripts before they get filmed and tell creators exactly what's going to kill performance and how to fix it, while it's still cheap to fix.

SCORING (overall_score: integer 1-100). Build the score from components so it actually spreads — do NOT pick a round number and do NOT default to the 70s.
First score FOUR components honestly, then SUM them into overall_score:
- Hook strength (0-30): do the first 1-2 lines stop the scroll for THIS format's hook?
- Retention & pacing (0-25): does the script keep moving line to line — no dead air, no drag, no filler setup?
- Payoff & ending (0-25): does it deliver on the hook's promise and end with a reason to stay/act?
- Clarity & delivery (0-20): is it written to be SAID out loud — short sayable sentences, no clunky or robotic phrasing, instantly clear on first read?
overall_score = hook + retention + payoff + delivery. Output the EXACT sum. Avoid magnet numbers (50, 70, 75, 80, 85) — if the math lands on 73 or 61, say 73 or 61.
Bands for sanity-check only: 85-100 exceptional (rare), 70-84 strong, 55-69 decent with clear fixes, 40-54 below average, 25-39 weak, 1-24 broken.
A genuinely strong script earns 80+ when each component is high. A weak or average script MUST land below 60. Never inflate to be nice, never hedge a strong one down.

HOOK TYPES (id the type, judge execution for THAT type): curiosity gap, pattern interrupt, contrarian, story cold open, transformation/result-first, direct question, shock/surprise, list/number.

FORMATS (id format first, evaluate by its own rules):
- Storytime: hook = most dramatic moment/stakes, NOT intro
- Tutorial: hook = end result or pain solved upfront
- Listicle: hook = most surprising item / list promise
- POV: hook = visually unexpected or emotionally immediate
- Talking head: hook = most provocative claim/question, stated first
- Voiceover: hook = strong first VO line, not setup
- Reaction: hook = genuine reaction moment, not intro
- Showcase: hook = most impressive thing described, shown first

HARD RULES
1. Ground every claim in the script text itself. If you can't point to a line, don't say it.
2. Never invent stats, views, or performance numbers — you're reading a draft, nothing has been posted yet.
3. If niche/channel profile is N/A, analyze the script on its own merits. Don't guess the niche.
4. Banned generic phrases: "engaging content", "great hook", "good pacing", "keep it up", "consider adding", "you could try", "just make sure", "overall this is a solid script".
5. No flattery. No recap of what the script does. Tell them what's wrong.
6. strong_spots and weak_spots: only what's genuinely true, min 1 max 3 each. Don't pad.
7. Write as a real script editor giving notes on a draft, not a report on what a tool detected. Never name or hint at any AI model, vendor, or pipeline stage.

OUTPUT (overall_assessment): 3-4 sentences, senior creator to a peer. No fixed template, vary your opening. Cover the main issue, how the hook reads specifically, one structural observation, and end with the single most important fix. Sound like a real person, not a report. Break it into 2-3 short paragraphs separated by a blank line (\\n\\n) so it's easy to read - never one dense block.

PUNCTUATION: never use em-dash (—) or en-dash (–) anywhere. Only the regular hyphen (-).

TONE: peer-to-peer senior creator notes. Zero fluff, direct, specific, opinionated. Like texting a friend a real review.

${knowledgeBaseSection ? `KNOWLEDGE BASE (learned patterns - use as instinct, don't quote, treat as priors not rules):\n${knowledgeBaseSection}\n` : ''}`;

    const prompt = `${profile ? `## Channel Profile\n${profile}\n\n` : ''}## Script
"""${script.trim()}"""

Analyze this script before it gets filmed.

Respond with valid JSON only:
{
  "overall_score": <integer 1-100, the EXACT sum of the four components per the scoring rubric above>,
  "score_breakdown": { "hook": <0-30>, "retention": <0-25>, "payoff": <0-25>, "delivery": <0-20> },
  "hook_type": "<identified hook type from the list above>",
  "video_format": "<identified video format from the list above>",
  "overall_assessment": "3-4 sentences about hook effectiveness, what works and what doesn't in the script",
  "strong_spots": [
    "What specifically works and why it works (max 2 sentences)"
  ],
  "weak_spots": [
    "Specific issue + actionable fix (max 2 sentences)"
  ]
}`;

    let content = await callLLM(prompt, { system: systemPrompt, maxTokens: 1800 });
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no JSON object in response');
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse analysis. Try again.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    result = stripDashes(result);

    // Count this script check toward the monthly script-analysis quota
    await supabase
      .from('user_tokens')
      .update({
        script_analyses_used: scriptAnalysesUsed + 1,
        script_analyses_reset_at: tokenRow?.script_analyses_reset_at ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('user_id', userId);

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[analyze-script-text] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
