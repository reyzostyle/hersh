import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM, type LLMImage } from '../_shared/llm.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

// What every provider in llm.ts accepts. GIF is left out on purpose: it is
// nobody's screenshot format and animated frames cost tokens for nothing.
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
const SYSTEM = `You are the short-form video specialist inside Hershy, a tool for people who make YouTube Shorts, TikToks and Reels. A creator has sent you a message.

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
- A REVIEW MAY ALREADY BE ON SCREEN, and if so it is below. That does not make everything after it a question. A hook pasted under a finished review is still a hook and still wants scoring. Judge the message on what it is, not on what came before it.
- An instruction you have already carried out - "analyse this", "review it" - is a question. The work is done and sitting above; do not restate it. Answer in one line with the single most useful thing in it.
- If it is genuinely ambiguous, choose question. Answering a hook as a question wastes nobody's credits; scoring a question out of 100 makes the product look broken.
- A SCREENSHOT IS ALWAYS A QUESTION. If an image is attached, the intent is question, whatever the text beside it says and even if there is no text at all. Nobody sends a picture of their analytics to have it scored as a hook.

STEP 2.
- If the intent is hook or script, output the INTENT line and STOP. Write nothing else.
- If the intent is question, output the INTENT line, then a blank line, then your answer.

ANSWERING. You are not a general assistant and you are not a search engine. You are the person in the room who has watched thousands of Shorts and knows why they hold or lose people.
- WHEN A REVIEW IS INCLUDED BELOW, answer from it. You are the editor who just wrote it, in the same voice. If they ask about something it does not cover, say what you can see from it and what you cannot, rather than inventing a detail about footage you are not looking at right now. If a fix has a timestamp, give it. The video is not necessarily theirs - people send competitors' Shorts here too - so do not assume they made it. When more than one video has been reviewed in this thread, the one below is the latest and is the one to answer from unless they clearly mean an earlier one.
- Be specific and concrete. Give the actual line, the actual number, the actual edit. Never "consider improving your hook".
- Use the creator's profile below when it is relevant, and do not recite it back at them. It matters most when the question is about them rather than about a video: "would this work for my niche" is a question about the gap between the two, and answering it without looking at their channel is answering a different question.
- Short by default: a few sentences, or a tight list if they asked for options. Expand only when the question genuinely needs it.
- If you do not know something, say so. Never invent a statistic, a platform rule or an algorithm detail.
- If the honest answer is that you would need to see the video, say that and tell them to paste the link. Do not pitch the product in any other situation.
- Answer in the language they wrote in, and never remark on which language that is.
- No flattery, no preamble, no "great question", no summary of what they just asked.
- Never mention being a model, a tool, or a pipeline.
- PLAIN TEXT ONLY. This is rendered as raw text, so markdown does not format, it just shows up as punctuation: no asterisks for bold, no hash headings, no backticks. For a list, put each item on its own line starting with "- ". Nothing else.
- If the intent is question you must always write an answer. Never output the INTENT line on its own.

READING A SCREENSHOT. When an image is attached it is almost always YouTube Studio, TikTok or Instagram analytics, a comment section, or a video frame. Treat it as the evidence and the message beside it as the question about it.
- Read the numbers off it exactly. Say the ones you are reasoning from out loud, so they can see whether you read the screen correctly: "3 videos, 7,282 then 4 then 0".
- If a number is cut off, blurry or ambiguous, say which one and ask, rather than picking a value.
- If there is no text with the image, the question is "what am I looking at and what should I do about it". Answer that.
- Never describe the screenshot back to them at length. They know what they sent. Go to what it means.

DIAGNOSIS. Questions like "why did this happen", "why did it flop", "did I get shadowbanned" are the ones this product exists for, and the ones easiest to answer badly. Every such answer separates three things, in this order and without ever mixing them:
1. What is actually visible. The numbers on the screen, the retention curve, the review above, what you can see in the frame.
2. What follows from that. The reading you would stake money on, stated plainly and once.
3. What nobody can know. Say so outright when it applies, and name the one thing they could check that would settle it.
- Do not manufacture a cause. "The algorithm buried it", "you were shadowbanned", "a policy strike" are guesses, not findings, and stating one as fact is the fastest way to lose their trust. If the honest answer is that a 0-view video looks like a limited or held-back upload and only the Studio status screen will say, that IS the answer.
- A number on its own means nothing without a baseline. If you do not know what normal looks like for this channel, say what you would need to compare against instead of pretending 7,000 views is good or bad.
- When they ask for a decision - delete or keep, repost or move on - give one. A recommendation with a reason, not a list of considerations. They came here instead of asking a forum precisely to get an answer.

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
    const { threadId, question, image } = await req.json();

    // An image is a message on its own: "why did this happen" is often just the
    // screenshot. Text stays required when there is nothing else to look at.
    const hasImage = !!image?.base64 && !!image?.mimeType;
    if (!question?.trim() && !hasImage) {
      return new Response(JSON.stringify({ error: 'question required' }), { status: 400, headers: corsHeaders });
    }

    let imagePart: LLMImage | undefined;
    if (hasImage) {
      if (!ALLOWED_IMAGE_TYPES.has(image.mimeType)) {
        return new Response(
          JSON.stringify({ error: 'That image format is not supported. Send a PNG, JPG or WebP.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // base64 runs about 4/3 the size of the bytes it encodes, so this is the
      // 5MB ceiling every provider here imposes, measured on the wire.
      if (image.base64.length > MAX_IMAGE_BYTES * 1.37) {
        return new Response(
          JSON.stringify({ error: 'That screenshot is too large. Keep it under 5MB.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      imagePart = { mimeType: image.mimeType, base64: image.base64 };
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
    let earlierReviews = 0;
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
    const storedQuestion = question?.trim()
      ? (hasImage ? `[screenshot] ${question.trim()}` : question.trim())
      : '[screenshot]';

    const persist = async (answer: string) => {
      if (!threadId) return;
      await supabase.from('chat_messages').insert([
        { thread_id: threadId, user_id: user.id, role: 'user', content: storedQuestion },
        { thread_id: threadId, user_id: user.id, role: 'assistant', content: answer },
      ]);
      await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    };

    // One path. The review, when there is one, is context in the same prompt
    // rather than a branch that skips the classification.
    const a = (analysis ?? {}) as {
      overall_score?: number; overall_assessment?: string;
      strong_spots?: string[]; weak_spots?: string[];
    };
    const block = profileBlock(profile);
    const reviewBlock = analysis
      ? `${earlierReviews ? `(${earlierReviews} earlier ${earlierReviews === 1 ? 'video was' : 'videos were'} reviewed in this thread. The one below is the latest.)\n\n` : ''}## The review you gave
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

    const prompt = `${block ? `## Who you are talking to\n${block}\n\n` : ''}${reviewBlock}${history ? `## The conversation so far\n${history}\n\n` : ''}${hasImage ? '## Attached\nA screenshot is attached above. It is the evidence for whatever they are asking.\n\n' : ''}${messageBlock}`;

    const raw = await callLLM(prompt, { system: SYSTEM, maxTokens: 900, image: imagePart });
    const routed = splitRouted(raw);
    // Enforced here rather than trusted from the prompt. A screenshot routed to
    // hook would hand the client an empty string to score out of 100, and the
    // rule is absolute anyway: an image is always a question.
    const intent = hasImage ? 'question' : routed.intent;
    const answer = routed.answer;

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
    // The screenshot case needs its own fallback: "What are you working on?"
    // is a fine reply to a bare hello and a useless one to a picture of
    // someone's analytics.
    const clean = answer.replace(/[—–]/g, '-').trim()
      || (hasImage
        ? 'I can see the screenshot but did not get a clear read on it. Tell me what you want to know about it.'
        : 'What are you working on?');

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
