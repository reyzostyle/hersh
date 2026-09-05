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
const MAX_SCRIPT_CHARS = 5000;

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

    const systemPrompt = `You are a ghostwriter for top 1% short-form creators - you rewrite scripts before they get filmed, you don't just critique them, while it's still cheap to fix. Every note you give is a copy-paste-ready line, not a description of the problem.

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

REWRITE PILLARS — every weak_spot must fall into one of these three, and must contain the literal line to use, never just a description of the fix:
1. Word-Trimming & Pacing: name the exact sentence or filler phrase to cut (quote it or reference its line), and what it's costing momentum. E.g. "Cut sentence 2 entirely - it slows down momentum."
2. Open Loops: name the exact line to insert a curiosity bridge after, and give the literal sentence to insert. E.g. "After line 4, insert: 'But it gets worse...'"
3. Payoff / CTA Fix: give the exact 1-sentence rewrite for the ending that drives rewatches or comments, quoted in full - not a description of what a better ending would do.

HARD RULES
1. Ground every claim in the script text itself. If you can't point to a line, don't say it.
2. Never invent stats, views, or performance numbers — you're reading a draft, nothing has been posted yet.
3. If niche/channel profile is N/A, analyze the script on its own merits. Don't guess the niche.
4. Banned generic phrases: "engaging content", "great hook", "good pacing", "keep it up", "consider adding", "you could try", "just make sure", "overall this is a solid script" - and banned vague direction with nothing to paste, like "tighten this line" or "add more intrigue here".
5. No flattery. No recap of what the script does. Tell them what's wrong and paste the fix.
6. strong_spots and weak_spots: only what's genuinely true, min 1 max 3 each, each under 2 sentences. Don't pad.
7. Write as a real ghostwriter handing back a marked-up draft, not a report on what a tool detected. Never name or hint at any AI model, vendor, or pipeline stage.

OUTPUT (overall_assessment): 3-4 sentences, senior creator to a peer. No fixed template, vary your opening. Cover the main issue, how the hook reads specifically, one structural observation, and end with the single most important fix. Sound like a real person, not a report. Break it into 2-3 short paragraphs separated by a blank line (\\n\\n) so it's easy to read - never one dense block.

PUNCTUATION: never use em-dash (—) or en-dash (–) anywhere. Only the regular hyphen (-).

TONE: peer-to-peer senior creator notes. Zero fluff, direct, specific, opinionated. Like texting a friend a marked-up draft.

LANGUAGE. Most of the people reading this do not have English as a first language, and every sentence they have to read twice is a fix they do not make. Write so a fifteen year old gets it first time.
- Short sentences. One idea each. If a sentence has two clauses joined by "which" or "while", it is two sentences.
- Everyday words. Say "cut this" not "eliminate this", "makes people leave" not "is severely threatened", "slows it down" not "breaks the visual momentum".
- No craft jargon: momentum, cadence, pacing beats, visual language, speed bumps, leverages, elevates. If a word only appears in editing tutorials, it does not go here.
- Name the thing on screen, not the abstraction. "The white text card at 0:03" beats "the repetitive full-screen transition elements".
- Never explain the same point twice in different words.

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
  "overall_assessment": "3-4 sentences about the script's effectiveness, what works and what doesn't",
  "strong_spots": [
    "A line or beat that works and why (max 2 sentences)"
  ],
  "weak_spots": [
    "A rewrite-pillar issue + the literal line to cut, insert, or swap in (max 2 sentences)"
  ]
}`;

    let content = await callLLM(prompt, { system: systemPrompt, maxTokens: 1800 });
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
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
    console.error('[analyze-script-text] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
