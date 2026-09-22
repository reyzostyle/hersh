import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLMWithTools } from '../_shared/llm.ts';
import { parseImages } from '../_shared/images.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';
import { CREATOR_TOOLS, runCreatorTool } from '../_shared/creator-tools.ts';
import { SYSTEM, looksLikeAWriteRequest } from '../_shared/chat-prompt.ts';
import { scoreHook, scoreScript, MAX_HOOK_CHARS, MAX_SCRIPT_CHARS } from '../_shared/text-scoring.ts';
import { type ToolSpec } from '../_shared/llm.ts';
import { loadBrain, brainLine } from '../_shared/brain.ts';

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

// The chat endpoint. The slug still says "followup" because that is what it
// was when Analyze first became a conversation, and the deployed name is what
// the client, the dashboard and the logs all key on; renaming it to match what
// it grew into would buy a caption and cost a deployment.
//
// What it does now is two jobs:
//
//   1. Answer a follow-up about a review already in the thread. Unchanged.
//   2. Decide what an unprompted message even IS, and answer it if it is a
//      question.
//
// (2) is new because the client had no router at all: anything without a link
// went to analyze-hook-text or analyze-script-text on nothing more than "is it
// longer than 200 characters". Ask "why did my last short flop?" and it came
// back scored out of 100 as though the question were a hook. That is the one
// behaviour that makes the product feel broken rather than early.

// One prompt, one call, every message. There is no longer a branch that
// decides what a message is before asking - the model classifies and answers in
// the same call, whether or not a review is already on screen.
//
// What that replaced: three places where the code guessed. A message arriving
// after a review was assumed to be a question about it, so a hook typed at that
// point got chatted about instead of scored. Text riding along with a link was
// only treated as a question if it contained a question mark. And a link to a
// video already in the thread was assumed to be a reference rather than a
// request. Each guess was cheap and each one was wrong often enough to make the
// product feel unreliable, which costs more than the credit it saved.
//
// Classifying and answering together keeps a question at one round trip; a hook
// or a script pays this one cheap call before the real analysis, which is
// invisible next to the seconds that analysis takes.
//
// The hard case is not question-versus-script, it is question-versus-hook: both
// are one short line, and "how i made $10k in a month" is a hook while "how do
// i make $10k a month" is a question. The rule that separates them is who the
// line is aimed at - a hook is written AT an audience, a question is addressed
// TO you - so that is the rule the prompt is given, with the near misses spelled
// out rather than left to be inferred.

interface ProfileRow {
  channel_niche?: string | null;
  channel_description?: string | null;
  target_audience?: string | null;
  creator_level?: string | null;
}

const profileBlock = (p: ProfileRow | null) =>
  [
    p?.channel_niche && `Niche: ${p.channel_niche}`,
    p?.channel_description && `Channel: ${p.channel_description}`,
    p?.target_audience && `Audience: ${p.target_audience}`,
    p?.creator_level && `Level: ${p.creator_level}`,
  ].filter(Boolean).join('\n');

// The two things the chat can DO, next to the six it can look up.
//
// They live here rather than in creator-tools.ts on purpose: everything in
// that file is read-only and free, and these spend the creator's credits. A
// tool that costs money belongs beside the code that charges for it.
const SCORING_TOOLS: ToolSpec[] = [
  {
    name: 'score_hook',
    description:
      'Score a hook the creator handed you - the opening line of a video, written at an audience - out of 100, with the concrete problems and three finished rewrites. Costs the creator credits. Only for text they wrote FOR a video, never for a message they wrote to you and never for something you wrote yourself.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Their hook, exactly as they wrote it, with nothing added or cleaned up.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'score_script',
    description:
      'Score a script the creator handed you - the body of a video, a transcript, a voiceover or a shot list - out of 100, with what works, what to cut and the lines to paste in. Costs the creator credits. Only for text they wrote FOR a video, never for a message they wrote to you and never for something you wrote yourself.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Their script, exactly as they wrote it.' },
      },
      required: ['text'],
    },
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }

    // threadId is optional now: the first message of a conversation can be a
    // question, and there is no thread until something is worth keeping.
    const { threadId, question, image, images: rawImages } = await req.json();

    // `image` is still read so a client from before the array shipped keeps
    // working across the gap between the two deploys.
    const { images, error: imageError } = parseImages(rawImages ?? image);
    if (imageError) {
      return new Response(
        JSON.stringify({ error: imageError }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // A screenshot is a message on its own: "why did this happen" is often just
    // the picture. Text stays required when there is nothing else to look at.
    const hasImage = images.length > 0;
    if (!question?.trim() && !hasImage) {
      return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: CORS });
    }

    const isAdmin = user.email === ADMIN_EMAIL;
    const creditStatus = await loadCreditStatus(supabase, user.id);
    // Checked before the routing call, not only before the answer: routing
    // costs a model call, and an account at zero should not get those for free
    // just because its message might turn out to be a hook.
    if (!canAfford(creditStatus, CREDIT_COSTS.chat_followup, isAdmin)) {
      return new Response(
        JSON.stringify({ error: 'Your credits are used up. Upgrade to keep going.' }),
        { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await supabase
      .from('user_tokens')
      .select('channel_niche, channel_description, target_audience, creator_level')
      .eq('user_id', user.id)
      .maybeSingle();
    // The brain in its short form - four lines, not the whole block. A
    // follow-up runs on under a thousand tokens of input by design.
    const brain = await loadBrain(supabase, user.id);

    // ── Load the thread, if there is one ─────────────────────────────────────
    // Scoped to its owner here rather than trusted from the body.
    let analysis: Record<string, unknown> | null = null;
    let earlierReviews = 0;
    let history = '';
    if (threadId) {
      const { data: thread } = await supabase
        .from('chat_threads').select('id').eq('id', threadId).eq('user_id', user.id).maybeSingle();
      if (!thread) {
        return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404, headers: CORS });
      }
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, content, analysis')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      const rows = messages ?? [];
      // The LAST review, not the first. A thread can hold more than one now -
      // paste a second link and it gets scored in place - and grounding the
      // answer in the oldest one would have it confidently describing a video
      // that scrolled off the screen two reviews ago.
      const reviewed = rows.filter(m => m.analysis);
      analysis = reviewed.length ? reviewed[reviewed.length - 1].analysis : null;
      earlierReviews = Math.max(0, reviewed.length - 1);
      // Only the tail: on a thread with a review, that review is the context
      // that matters and a long history would push it out of the window.
      history = rows
        .filter(m => !m.analysis)
        .slice(-8)
        .map(m => `${m.role === 'user' ? 'Creator' : 'You'}: ${m.content}`)
        .join('\n');
    }

    // The screenshot itself is not stored anywhere - there is no bucket for it
    // yet - so the transcript keeps the fact that there was one. Reopening the
    // thread later shows the question and the answer without the image.
    const shotTag = images.length > 1 ? `[${images.length} screenshots]` : '[screenshot]';
    const storedQuestion = question?.trim()
      ? (hasImage ? `${shotTag} ${question.trim()}` : question.trim())
      : shotTag;

    // `scored` rides along in the analysis column, normalised into the one
    // shape the chat draws cards from - so a scored hook is still there when
    // the conversation is reopened, instead of a reply referring to a card
    // that was never stored.
    const persist = async (answer: string, scored: { kind: 'hook' | 'script'; result: Record<string, unknown> } | null) => {
      if (!threadId) return;
      const card = !scored ? null : scored.kind === 'hook'
        ? {
            overall_score: scored.result.score,
            overall_assessment: scored.result.verdict,
            strong_spots: [],
            weak_spots: scored.result.issues ?? [],
            rewrites: scored.result.rewrites ?? [],
          }
        : {
            overall_score: scored.result.overall_score,
            overall_assessment: scored.result.overall_assessment,
            strong_spots: scored.result.strong_spots ?? [],
            weak_spots: scored.result.weak_spots ?? [],
          };
      await supabase.from('chat_messages').insert([
        { thread_id: threadId, user_id: user.id, role: 'user', content: storedQuestion },
        { thread_id: threadId, user_id: user.id, role: 'assistant', content: answer, ...(card ? { analysis: card } : {}) },
      ]);
      await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    };

    // One path. The review, when there is one, is context in the same prompt
    // rather than a branch that skips the classification.
    const a = (analysis ?? {}) as {
      overall_score?: number; overall_assessment?: string;
      strong_spots?: string[]; weak_spots?: string[];
      ownership?: 'mine' | 'theirs' | 'unknown';
    };

    // Whose video the review is about, stated as a fact.
    //
    // The prompt used to carry a caution - "not necessarily theirs, do not
    // assume they made it" - with nothing behind it, so the model guessed, and
    // it guesses "yours". Asked how to adapt someone else's Short, it
    // congratulated the creator on a 91 they had not earned, for a video they
    // had never made. The signal to settle it has been computed and written to
    // the analyses row since the ownership check was built; nothing ever read
    // it back.
    //
    // Reviews written before this shipped have no ownership field, and that is
    // honestly 'unknown' rather than a reason to guess.
    const OWNERSHIP_LINE: Record<string, string> = {
      mine: `This video IS theirs - it is on the channel connected to this account. Talk about it as their own work: their numbers, their footage, their next upload.`,
      theirs: `This video is NOT theirs. It is on someone else's channel and they are studying it. Never congratulate them on its score or call it their video. What they want from it is what to take and what will not transfer to their channel.`,
      unknown: `WHOSE VIDEO THIS IS IS UNKNOWN - the check could not run, usually because no YouTube account is connected. Do not state or imply either way. Write the answer so it holds whoever made it, and if the answer genuinely turns on it, say in one line that connecting their YouTube in Settings is what settles it.`,
    };
    const ownershipLine = OWNERSHIP_LINE[a.ownership ?? 'unknown'];
    const level = profile?.creator_level ? `Level: ${profile.creator_level}` : '';
    const block = brain
      ? [brainLine(brain), level].filter(Boolean).join('\n')
      : profileBlock(profile);
    const reviewBlock = analysis
      ? `${earlierReviews ? `(${earlierReviews} earlier ${earlierReviews === 1 ? 'video was' : 'videos were'} reviewed in this thread. The one below is the latest.)\n\n` : ''}## Whose video this is
${ownershipLine}

## The review you gave
Score: ${a.overall_score ?? 'n/a'} out of 100
${a.overall_assessment ?? ''}

What works:
${(a.strong_spots ?? []).map(s => `- ${s}`).join('\n') || '- none noted'}

What to fix:
${(a.weak_spots ?? []).map(s => `- ${s}`).join('\n') || '- none noted'}

`
      : '';

    const messageBlock = question?.trim()
      ? `## Their message\n"""\n${question.trim()}\n"""`
      : '## Their message\nThey sent the screenshot with no text.';

    const prompt = `${block ? `## Who you are talking to\n${block}\n\n` : ''}${reviewBlock}${history ? `## The conversation so far\n${history}\n\n` : ''}${hasImage ? `## Attached\n${images.length === 1 ? 'A screenshot is' : `${images.length} screenshots are`} attached above. They are the evidence for whatever they are asking.\n\n` : ''}${messageBlock}`;

    // One call, tools on it, and the model decides what the message needs.
    //
    // A lookup pays for a second round trip only when the answer depends on
    // something only this account knows; a score runs the same prompt the
    // Hook Lab endpoint runs, from inside the answer. Both are decisions the
    // model makes in the open rather than a branch a classifier picked.
    const toolsUsed: string[] = [];

    // What a scoring tool produced, kept so the client can draw the card the
    // creator already knows - the same shape the video review uses.
    let scored: { kind: 'hook' | 'script'; result: Record<string, unknown> } | null = null;
    let scoringCost = 0;

    // The one thing the model is not allowed to decide: scoring a message that
    // is plainly a request to write something. The prompt says so twice and it
    // still did it, and it is the misroute that spends credits to review a
    // sentence the creator wrote to us. See looksLikeAWriteRequest.
    const askedForWriting = looksLikeAWriteRequest(question ?? '');

    const runScoring = async (kind: 'hook' | 'script', text: string): Promise<unknown> => {
      const t = (text ?? '').trim();
      if (!t) return { error: 'No text was passed. Score only what the creator actually handed you.' };
      if (hasImage) {
        return { error: 'A screenshot is not text to score. Read it and answer in words.' };
      }
      if (askedForWriting && t.slice(0, 120) === (question ?? '').trim().slice(0, 120)) {
        return {
          error: 'That message is a request for you to write something, not a text to judge. Do not score it. Write what they asked for instead.',
        };
      }
      if (scored) {
        return { error: `Already scored one ${scored.kind} in this reply. Do not score again.` };
      }
      const cap = kind === 'hook' ? MAX_HOOK_CHARS : MAX_SCRIPT_CHARS;
      if (t.length > cap) {
        return { error: `Too long to score as a ${kind} (max ${cap} characters). Say so and answer in words.` };
      }
      const cost = kind === 'hook' ? CREDIT_COSTS.hook_check : CREDIT_COSTS.script_check;
      if (!canAfford(creditStatus, cost, isAdmin)) {
        return { error: 'They do not have enough credits left to score this. Tell them plainly and answer in words instead.' };
      }
      try {
        const result = kind === 'hook'
          ? await scoreHook(supabase, user.id, t)
          : await scoreScript(supabase, user.id, t);
        scored = { kind, result: result as unknown as Record<string, unknown> };
        scoringCost = cost;
        return result;
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'The score could not be read back.' };
      }
    };

    const answer = await callLLMWithTools(prompt, {
      system: SYSTEM,
      // Roomier than a follow-up needs, because the same call has to be able
      // to return a finished script. 900 was sized for "a few sentences" and
      // would have truncated one mid-line.
      maxTokens: 2000,
      images,
      tools: [...CREATOR_TOOLS, ...SCORING_TOOLS],
      onToolUsed: c => toolsUsed.push(c.name),
      run: c => (c.name === 'score_hook' || c.name === 'score_script')
        ? runScoring(c.name === 'score_hook' ? 'hook' : 'script', String(c.args?.text ?? ''))
        : runCreatorTool(supabase, user.id, c),
    });
    if (toolsUsed.length) console.log(`[chat-followup] tools: ${toolsUsed.join(', ')}`);

    // The model wrote nothing, which it does on a bare "hey" and sometimes
    // after a score, where the card says everything. An error notice for
    // saying hello is worse than a plain opening line.
    const clean = answer.replace(/[\u2014\u2013]/g, '-').trim()
      || (scored
        ? ''
        : hasImage
          ? 'I can see the screenshot but did not get a clear read on it. Tell me what you want to know about it.'
          : 'What are you working on?');

    // A score replaces the message fee rather than being added to it: one
    // message, one price, and it is the price of the expensive thing that
    // happened. Without this a scored hook cost 3 where the old two-step cost
    // 2, and the refactor would have quietly raised the price.
    await persist(clean, scored);
    await spendCredits(supabase, user.id, creditStatus, scoringCost || CREDIT_COSTS.chat_followup);
    return new Response(JSON.stringify({
      // Kept for clients from before this shipped: they branch on it, and
      // "question" is the only branch that renders an answer.
      intent: 'question',
      answer: clean,
      scored: scored ?? undefined,
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[chat-followup]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
