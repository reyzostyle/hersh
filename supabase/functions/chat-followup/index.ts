import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Follow-ups run on the analysis that is already in the thread. The model does
// not watch the video again: it costs a fraction of a full run, and re-watching
// would produce a second, slightly different reading of the same footage, which
// is worse than answering from the one already on screen.
const SYSTEM = `You are the senior short-form video editor who just reviewed this creator's Short. You are answering their follow-up questions about that review, in the same voice: peer to peer, direct, specific, no flattery and no filler.

Ground every answer in the analysis below. If they ask about something it does not cover, say what you can see from it and what you cannot, rather than inventing a detail about footage you are not looking at right now.

Keep answers short. Two or three sentences unless they explicitly ask for more. If a fix has a timestamp, give it. Never mention being a model, a tool, or a pipeline.

PUNCTUATION: never use an em-dash or en-dash. Only the regular hyphen.`;

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

    const { threadId, question } = await req.json();
    if (!threadId || !question?.trim()) {
      return new Response(JSON.stringify({ error: 'threadId and question required' }), { status: 400, headers: corsHeaders });
    }

    const isAdmin = user.email === 'reyzostyle@gmail.com';
    const creditStatus = await loadCreditStatus(supabase, user.id);
    if (!canAfford(creditStatus, CREDIT_COSTS.chat_followup, isAdmin)) {
      return new Response(
        JSON.stringify({ error: 'Your credits are used up. Upgrade to keep going.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // The thread is scoped to its owner here rather than trusted from the body.
    const { data: thread } = await supabase
      .from('chat_threads').select('id, user_id').eq('id', threadId).eq('user_id', user.id).maybeSingle();
    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404, headers: corsHeaders });
    }

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('role, content, analysis')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    const rows = messages ?? [];
    const analysis = rows.find(m => m.analysis)?.analysis;
    if (!analysis) {
      return new Response(JSON.stringify({ error: 'This thread has no analysis to answer from yet.' }), { status: 400, headers: corsHeaders });
    }

    // Only the tail of the conversation: the analysis is the context that
    // matters, and a long thread would otherwise push it out of the window.
    const history = rows
      .filter(m => !m.analysis)
      .slice(-8)
      .map(m => `${m.role === 'user' ? 'Creator' : 'You'}: ${m.content}`)
      .join('\n');

    const prompt = `## The review you gave
Score: ${analysis.overall_score ?? 'n/a'} out of 100
${analysis.overall_assessment ?? ''}

What works:
${(analysis.strong_spots ?? []).map((s: string) => `- ${s}`).join('\n') || '- none noted'}

What to fix:
${(analysis.weak_spots ?? []).map((s: string) => `- ${s}`).join('\n') || '- none noted'}

${history ? `## The conversation so far\n${history}\n` : ''}
## Their question
${question.trim()}`;

    const answer = (await callLLM(prompt, { system: SYSTEM, maxTokens: 700 })).replace(/[—–]/g, '-').trim();

    await supabase.from('chat_messages').insert([
      { thread_id: threadId, user_id: user.id, role: 'user', content: question.trim() },
      { thread_id: threadId, user_id: user.id, role: 'assistant', content: answer },
    ]);
    await supabase.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
    await spendCredits(supabase, user.id, creditStatus, CREDIT_COSTS.chat_followup);

    return new Response(JSON.stringify({ answer }), {
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
