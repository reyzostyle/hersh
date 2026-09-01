import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

// ── Follow-up: there is a review on screen and they are asking about it ──────
const FOLLOWUP_SYSTEM = `You are the senior short-form video editor who just reviewed this creator's Short. You are answering their follow-up questions about that review, in the same voice: peer to peer, direct, specific, no flattery and no filler.

Ground every answer in the analysis below. If they ask about something it does not cover, say what you can see from it and what you cannot, rather than inventing a detail about footage you are not looking at right now.

Keep answers short. Two or three sentences unless they explicitly ask for more. If a fix has a timestamp, give it. Never mention being a model, a tool, or a pipeline.

PUNCTUATION: never use an em-dash or en-dash. Only the regular hyphen.`;

// ── Router: no review on screen yet, so work out what they sent ──────────────
//
// Classifying and answering in one call rather than two. A question is the
// common case and it gets a single round trip; a hook or a script costs this
// one cheap call before the real analysis, which is invisible next to the
// seconds that analysis already takes.
//
// The hard case is not question-versus-script, it is question-versus-hook:
// both are one short line, and "how i made $10k in a month" is a hook while
// "how do i make $10k a month" is a question. The rule that separates them is
// who the line is aimed at - a hook is written AT an audience, a question is
// addressed TO you - so that is the rule the prompt is given, with the near
// misses spelled out rather than left to be inferred.
const ROUTER_SYSTEM = `You are the short-form video specialist inside Hershy, a tool for people who make YouTube Shorts, TikToks and Reels. A creator has sent you a message and nothing has been analysed in this conversation yet.

STEP 1. Decide what the message is. Your first line must be exactly one of:
INTENT: question
INTENT: hook
INTENT: script

- hook  = they are handing you the opening line of a video for you to judge. Written AT an audience. Usually one line. Often has no verb aimed at you at all: "POV: you just quit your job", "how i made $10k in a month", "nobody talks about this".
- script = they are handing you the body of a video: lines to be said on camera, a transcript, a voiceover, a shot list. The test is not length or line breaks, it is whether the text carries the video's payoff and not only its opening. A single paragraph that sets something up AND delivers it, or promises the steps that follow, is a script. A hook stops at the setup.
- question = they are talking TO you. Asking for advice, an opinion, an explanation, a plan, a comparison, what to post, why something flopped, how something works. Also anything conversational, and anything about Hershy itself.

Near misses, decide them this way:
- "how do i write a better hook" -> question. "how i wrote the hook that got me 2M" -> hook.
- "score this: <line>" or "is this hook good: <line>" -> hook. They asked a question, but the thing they want is the line judged.
- "here's my script, thoughts?" followed by the script -> script.
- A question that happens to be long, or written over several lines, is still a question. Length decides nothing on its own.
- A greeting, a one-word message or small talk is a question. Reply in one line and ask what they are working on.
- If it is genuinely ambiguous, choose question. Answering a hook as a question wastes nobody's credits; scoring a question out of 100 makes the product look broken.

STEP 2.
- If the intent is hook or script, output the INTENT line and STOP. Write nothing else.
- If the intent is question, output the INTENT line, then a blank line, then your answer.

ANSWERING. You are not a general assistant and you are not a search engine. You are the person in the room who has watched thousands of Shorts and knows why they hold or lose people.
- Be specific and concrete. Give the actual line, the actual number, the actual edit. Never "consider improving your hook".
- Use the creator's profile below when it is relevant, and do not recite it back at them.
- Short by default: a few sentences, or a tight list if they asked for options. Expand only when the question genuinely needs it.
- If you do not know something, say so. Never invent a statistic, a platform rule or an algorithm detail.
- If the honest answer is that you would need to see the video, say that and tell them to paste the link. Do not pitch the product in any other situation.
- Answer in the language they wrote in, and never remark on which language that is.
- No flattery, no preamble, no "great question", no summary of what they just asked.
- Never mention being a model, a tool, or a pipeline.
- PLAIN TEXT ONLY. This is rendered as raw text, so markdown does not format, it just shows up as punctuation: no asterisks for bold, no hash headings, no backticks. For a list, put each item on its own line starting with "- ". Nothing else.
- If the intent is question you must always write an answer. Never output the INTENT line on its own.

PUNCTUATION: never use an em-dash or en-dash. Only the regular hyphen.`;

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

// The first line is a contract, so read it as one and do not pattern-match the
// body: a question whose ANSWER discusses hooks would otherwise re-route
// itself into a hook score.
function splitRouted(raw: string): { intent: 'question' | 'hook' | 'script'; answer: string } {
  const text = raw.trim();
  const match = text.match(/^INTENT:\s*(question|hook|script)\s*/i);
  if (!match) {
    // The model ignored the format. It still wrote something, and something is
    // an answer - far better than scoring their sentence out of 100.
    return { intent: 'question', answer: text };
  }
  return {
    intent: match[1].toLowerCase() as 'question' | 'hook' | 'script',
    answer: text.slice(match[0].length).trim(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // threadId is optional now: the first message of a conversation can be a
    // question, and there is no thread until something is worth keeping.
    const { threadId, question } = await req.json();
    if (!question?.trim()) {
      return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: corsHeaders });
    }

    const isAdmin = user.email === ADMIN_EMAIL;
    const creditStatus = await loadCreditStatus(supabase, user.id);
    // Checked before the routing call, not only before the answer: routing
    // costs a model call, and an account at zero should not get those for free
    // just because its message might turn out to be a hook.
    if (!canAfford(creditStatus, CREDIT_COSTS.chat_followup, isAdmin)) {
      return new Response(
        JSON.stringify({ error: 'Your credits are used up. Upgrade to keep going.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await supabase
      .from('user_tokens')
      .select('channel_niche, channel_description, target_audience, creator_level')
      .eq('user_id', user.id)
      .maybeSingle();

    // ── Load the thread, if there is one ─────────────────────────────────────
    // Scoped to its owner here rather than trusted from the body.
    let analysis: Record<string, unknown> | null = null;
    let history = '';
    if (threadId) {
      const { data: thread } = await supabase
        .from('chat_threads').select('id').eq('id', threadId).eq('user_id', user.id).maybeSingle();
      if (!thread) {
        return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404, headers: corsHeaders });
      }
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('role, content, analysis')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      const rows = messages ?? [];
      analysis = rows.find(m => m.analysis)?.analysis ?? null;
      // Only the tail: on a thread with a review, that review is the context
      // that matters and a long history would push it out of the window.
      history = rows
        .filter(m => !m.analysis)
        .slice(-8)
        .map(m => `${m.role === 'user' ? 'Creator' : 'You'}: ${m.content}`)
        .join('\n');
    }

    const persist = async (answer: string) => {
      if (!threadId) return;
      await supabase.from('chat_messages').insert([
        { thread_id: threadId, user_id: user.id, role: 'user', content: question.trim() },
        { thread_id: threadId, user_id: user.id, role: 'assistant', content: answer },
      ]);
      await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    };

    // ── Path 1: a review is on screen, so this is a follow-up about it ───────
    // No routing here. Once there is something to point at, everything typed
    // after it is a question about it, which was already the rule and is still
    // the right one.
    if (analysis) {
      const a = analysis as {
        overall_score?: number; overall_assessment?: string;
        strong_spots?: string[]; weak_spots?: string[];
      };
      const prompt = `## The review you gave
Score: ${a.overall_score ?? 'n/a'} out of 100
${a.overall_assessment ?? ''}

What works:
${(a.strong_spots ?? []).map(s => `- ${s}`).join('\n') || '- none noted'}

What to fix:
${(a.weak_spots ?? []).map(s => `- ${s}`).join('\n') || '- none noted'}

${history ? `## The conversation so far\n${history}\n` : ''}
## Their question
${question.trim()}`;

      const answer = (await callLLM(prompt, { system: FOLLOWUP_SYSTEM, maxTokens: 700 })).replace(/[—–]/g, '-').trim();
      await persist(answer);
      await spendCredits(supabase, user.id, creditStatus, CREDIT_COSTS.chat_followup);
      return new Response(JSON.stringify({ intent: 'question', answer }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Path 2: nothing analysed yet, so work out what they sent ─────────────
    const block = profileBlock(profile);
    const routerPrompt = `${block ? `## Who you are talking to\n${block}\n\n` : ''}${history ? `## The conversation so far\n${history}\n\n` : ''}## Their message
"""
${question.trim()}
"""`;

    const raw = await callLLM(routerPrompt, { system: ROUTER_SYSTEM, maxTokens: 900 });
    const { intent, answer } = splitRouted(raw);

    // A hook or a script is not answered here and is not charged here. The
    // client runs the real analysis next, which charges its own price - being
    // billed twice for one message would be indefensible.
    if (intent !== 'question') {
      return new Response(JSON.stringify({ intent }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The model routed to question and then wrote nothing, which it does on a
    // bare "hey". An error notice for saying hello is worse than a plain
    // opening line, and this is cheap enough not to be worth a second call.
    const clean = answer.replace(/[—–]/g, '-').trim() || 'What are you working on?';

    await persist(clean);
    await spendCredits(supabase, user.id, creditStatus, CREDIT_COSTS.chat_followup);
    return new Response(JSON.stringify({ intent: 'question', answer: clean }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[chat-followup]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
