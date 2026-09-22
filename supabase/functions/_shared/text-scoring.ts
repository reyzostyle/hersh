// Scoring a hook and scoring a script, in one place.
//
// These two prompts were written inside analyze-hook-text and
// analyze-script-text, which were only ever reachable as their own endpoints.
// The chat now scores from inside its own answer - it decides to score the way
// it decides to look something up - so the same prompt has two callers and
// must not exist twice. The endpoints stay: the "read that as a hook" chip and
// anything that wants a score without a conversation still use them.
//
// Credits are NOT spent here. Each caller knows what it is charging for and
// charges it, because the chat replaces the message fee with the scoring fee
// rather than taking both.

import { callLLM } from './llm.ts';
import { parseModelJson } from './json.ts';
import { loadBrain, brainLine } from './brain.ts';

export const MAX_HOOK_CHARS = 600;
export const MAX_SCRIPT_CHARS = 5000;

export interface HookScore {
  score: number;
  verdict: string;
  issues: string[];
  rewrites: { hook: string; why: string }[];
}

export interface ScriptScore {
  overall_score: number;
  overall_assessment: string;
  strong_spots: string[];
  weak_spots: string[];
}

const stripDashes = (s: unknown): unknown => {
  if (typeof s === 'string') return s.replace(/[\u2014\u2013]/g, '-');
  if (Array.isArray(s)) return s.map(stripDashes);
  if (s && typeof s === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) o[k] = stripDashes(v);
    return o;
  }
  return s;
};

// The creator behind the text. A `context` passed with the request overrides
// the stored profile, which is how the old per-check context box worked.
// deno-lint-ignore no-explicit-any
async function profileBlock(supabase: any, userId: string, context?: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from('user_tokens')
    .select('plan, channel_niche, channel_description, creator_level')
    .eq('user_id', userId)
    .maybeSingle();

  const hasContext = !!context?.trim();
  const brainText = hasContext ? '' : brainLine(await loadBrain(supabase, userId));
  return (hasContext
    ? [
        `Creator context: ${context!.trim()}`,
        tokenRow?.creator_level && `Creator level: ${tokenRow.creator_level}`,
      ]
    : [
        brainText,
        !brainText && tokenRow?.channel_niche && `Channel niche: ${tokenRow.channel_niche}`,
        !brainText && tokenRow?.channel_description && `Channel description: ${tokenRow.channel_description}`,
        tokenRow?.creator_level && `Creator level: ${tokenRow.creator_level}`,
      ]
  ).filter(Boolean).join('\n');
}

function parse(content: string, what: string): Record<string, unknown> {
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return stripDashes(parseModelJson(clean)) as Record<string, unknown>;
  } catch {
    throw new Error(`Could not read the ${what} score back. Try again.`);
  }
}

// deno-lint-ignore no-explicit-any
export async function scoreHook(supabase: any, userId: string, hook: string, context?: string): Promise<HookScore> {
  const profile = await profileBlock(supabase, userId, context);
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
- LANGUAGE: most readers do not have English as a first language. Short sentences, one idea each, everyday words. Say "cut this" not "eliminate this". No craft jargon (momentum, cadence, speed bumps, leverages). Name what is on screen or on the page, not the abstraction.
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
  return parse(await callLLM(prompt, { maxTokens: 1200 }), 'hook') as unknown as HookScore;
}

// deno-lint-ignore no-explicit-any
export async function scoreScript(supabase: any, userId: string, script: string, context?: string): Promise<ScriptScore> {
  const profile = await profileBlock(supabase, userId, context);

  // Learned patterns, the same ones the video analysis reads.
  let knowledgeBaseSection = '';
  const { data: kbRecords } = await supabase.from('knowledge_base').select('category, title, content').order('category');
  if (kbRecords?.length) {
    // deno-lint-ignore no-explicit-any
    knowledgeBaseSection = kbRecords.map((r: any) => `[${r.category}] ${r.title}: ${r.content}`).join('\n');
  }

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
  return parse(await callLLM(prompt, { system: systemPrompt, maxTokens: 1800 }), 'script') as unknown as ScriptScore;
}
