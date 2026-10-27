import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';
import { loadVoiceBlock } from '../_shared/voice.ts';
import { loadBrain, brainBlock } from '../_shared/brain.ts';
import { loadCreditStatus, canAfford, spendCredits, CREDIT_COSTS } from '../_shared/credits.ts';

// The words to say, for the teleprompter (iOS app, 2026-10-20). An outline
// tells you what to SHOW in each beat, which is no use to someone filming
// themselves talking to camera: they need the sentences. This turns the
// outline into a word-for-word talking-head script in the creator's own
// register, and keeps it on the idea (competitor_ideas.script, a column that
// had sat unused since full scripts were dropped in August).
const CORS = corsHeaders({ methods: 'POST, OPTIONS' });
const ADMIN_EMAIL = 'reyzostyle@gmail.com';

const SYSTEM = `You write talking-head scripts for vertical Shorts: one creator, on camera, talking straight to the phone.

You get an outline (what each beat is about, sometimes written as what to show), or for an idea with no outline yet just its premise and suggested first line, and what we know about the creator. Write the exact words they will read off a teleprompter.

Rules:
- Spoken words only. No stage directions, no brackets, no "[cut to]", no visual notes, no headings, no emojis.
- If the outline says to show something, turn it into what the creator SAYS while it is on screen, or describe it in words if it must land without visuals.
- The first line is the hook from the outline, tightened so it lands in the first two seconds.
- Short sentences. One idea per line. A line break between lines so it reads well on a prompter.
- About 130-170 words total unless the outline clearly needs more. Shorts reward cutting.
- Sound like this creator talks, not like an ad. Plain words, no hype words.
- End with the call to action from the outline, said naturally.

Return only the script text.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const isAdmin = user.email === ADMIN_EMAIL;

    const { ideaId } = await req.json();
    if (!ideaId) return json({ error: 'ideaId required' }, 400);

    const { data: idea } = await supabase.from('competitor_ideas').select('*').eq('id', ideaId).eq('user_id', user.id).maybeSingle();
    if (!idea) return json({ error: 'Idea not found' }, 404);
    // An idea Chumoku researched (source 'ai') has no video to outline, so its
    // premise and suggested first line stand in for the outline.
    const own = idea.source === 'ai';
    if (!idea.outline && !own) return json({ error: 'Build the outline first.' }, 400);

    const cost = CREDIT_COSTS.competitor_script;
    const status = await loadCreditStatus(supabase, user.id);
    if (!canAfford(status, cost, isAdmin)) return json({ error: 'limit_reached', cost }, 402);

    const [brain, voice] = await Promise.all([loadBrain(supabase, user.id), loadVoiceBlock(supabase, user.id)]);
    const o = idea.outline as { hook: string; sections: { title: string; content: string; duration?: string }[]; cta: string } | null;
    const prompt = [
      brainBlock(brain),
      voice,
      o
        ? [
          idea.adapted_idea ? `THEIR ANGLE\n${idea.adapted_idea}` : '',
          `OUTLINE\nHook: ${o.hook}\n${o.sections.map(s => `${s.title}${s.duration ? ` (${s.duration})` : ''}: ${s.content}`).join('\n')}\nEnd: ${o.cta}`,
        ].filter(Boolean).join('\n\n')
        : [
          `THE IDEA\n${idea.pitch ?? ''}`,
          idea.adapted_idea ? `PREMISE\n${idea.adapted_idea}` : '',
          idea.basis?.hook ? `SUGGESTED FIRST LINE\n${idea.basis.hook}` : '',
          idea.basis?.source ? `BASED ON\n${idea.basis.source}. Use only facts you are sure of; never invent numbers or quotes.` : '',
          'No outline: give it a hook, two or three beats and a light ending (a follow or a question, never a sales line).',
        ].filter(Boolean).join('\n\n'),
    ].filter(Boolean).join('\n\n');

    const script = (await callLLM(prompt, { system: SYSTEM, maxTokens: 1200, tier: 'writer' }))
      .replace(/^```[a-z]*\n?|```$/g, '').trim();
    if (!script) throw new Error('Empty script');

    const { data: updated, error } = await supabase.from('competitor_ideas').update({ script }).eq('id', ideaId).select('*').single();
    if (error) throw error;
    await spendCredits(supabase, user.id, status, cost);
    return json({ success: true, idea: updated });
  } catch (e) {
    console.error('[write-script]', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
