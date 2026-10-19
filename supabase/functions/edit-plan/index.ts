import { corsHeaders } from '../_shared/http.ts';
import { callLLM } from '../_shared/llm.ts';
import { parseModelJson } from '../_shared/json.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// Vibe editing, step two: given every word of every raw take (with its index
// and the pauses between), decide which words make the Short. This is the one
// judgement in the editor - which take of a line is the clean one, what is a
// false start, what the creator said to themselves between takes - and it is
// the part Ivan did by hand on every video so far.
//
// Owner only while it is being proven: the same email check as admin-stats,
// verified from the JWT, not from anything the page says.
const CORS = corsHeaders({ methods: 'POST, OPTIONS' });
const OWNER_EMAIL = 'reyzostyle@gmail.com';
const MODEL = 'claude-opus-5-5';

const SYSTEM = `You are a video editor cutting a vertical talking-head Short (TikTok / Reels / YouTube Shorts) from raw camera takes.

You get the transcript of each raw clip as numbered words. "/" marks a pause of 0.7 s or more, which is usually where the creator stopped and restarted a line. You may also get the script they were reading from, and instructions.

Decide which words make the final video, in order.

How to cut:
- With a script: the final video says the script, in script order. Each script line is often recorded several times. For every line pick the best complete take, which is usually the LAST complete one (people re-record because the earlier one was worse). Never keep two takes of the same line.
- Without a script: the creator talked freely and the video should say everything they meant to say. Keep every sentence that carries content, in order, even if it rambles. Remove a sentence only when it is said again later (a retake), abandoned halfway, or talk not meant for the video. Do not cut content to make the video shorter.
- Inside a sentence you keep, cut stutters and doubled words ("from a from a default" -> keep only the second "from a"), "um"/"uh", and restarts ("you can, you can go on"), by splitting the sentence into ranges around them.
- Drop false starts, "wait", "let me do that again", talk to themselves or to someone off camera, and anything after the sign-off.
- Every range starts at the start of a sentence or clause and ends at the end of one. Never begin a range mid-sentence and never end on a dangling word ("So", "and", "but", "because") unless the next range continues that sentence.
- Small slips in an otherwise clean take are fine. Do not drop a good take for one odd word.
- Ranges may come from different clips and may be reordered when the script order needs it (e.g. a hook recorded last but said first).
- Instructions from the creator override all of the above.

Also:
- "fix": the transcript is speech recognition and mishears names and jargon. Where the script shows the correct spelling of a word you are keeping, give the fix. Only real corrections, never stylistic rewrites, one word in, one word out.
- "hot": the words that carry the point and should be highlighted in the captions: numbers, the key noun or verb of a sentence, names. About one per sentence, never filler.
- "note": one short line for the creator on what you cut (e.g. "Used the 3rd take of the hook, dropped 2 false starts").

Answer with JSON only:
{"keep":[{"clip":0,"from":12,"to":40}],"fix":[{"clip":0,"i":13,"text":"Chumoku"}],"hot":[{"clip":0,"i":15}],"note":"..."}
"from" and "to" are inclusive word indices. "keep" is in the order the final video plays.`;

interface ClipIn { words: string[]; pauses: number[] }

function render(clips: ClipIn[]): string {
  return clips.map((c, ci) => {
    const parts: string[] = [];
    const pauses = new Set(c.pauses);
    c.words.forEach((w, i) => {
      if (pauses.has(i)) parts.push('/');
      parts.push(`${i}:${w}`);
    });
    return `CLIP ${ci}\n${parts.join(' ')}`;
  }).join('\n\n');
}

async function callOwnerModel(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
}

// Choosing takes is a judgement over the whole transcript at once, so the
// Gemini writer model gets room to think here: thinkingLevel medium rather
// than the "low" other writer calls use. Measured 2026-10-20 on a 3:20 raw
// talk: low kept dangling half-sentences, medium cut cleanly in ~90 s, high
// ran past the 150 s function limit.
async function callGeminiThinking(prompt: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const model = Deno.env.get('WRITER_MODEL') || 'gemini-3.8-flash';
  if (!apiKey || !/gemini/i.test(model)) throw new Error('no Gemini writer configured');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 24000, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'medium' } },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
}

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
    if (user.email !== OWNER_EMAIL) return json({ error: 'Forbidden' }, 403);

    const { clips, script, instructions } = await req.json() as { clips: ClipIn[]; script?: string; instructions?: string };
    if (!Array.isArray(clips) || clips.length === 0) return json({ error: 'No clips' }, 400);

    const prompt = [
      script?.trim() ? `SCRIPT\n${script.trim()}` : 'No script. Cut by the rules for no script.',
      instructions?.trim() ? `INSTRUCTIONS FROM THE CREATOR\n${instructions.trim()}` : '',
      render(clips),
    ].filter(Boolean).join('\n\n');

    // Opus first, then Gemini thinking hard, then the plain writer call, so a
    // bad day (or an empty balance) at one provider does not take the editor
    // down with it.
    const attempts: [string, () => Promise<string>][] = [
      [MODEL, () => callOwnerModel(prompt)],
      ['gemini-thinking', () => callGeminiThinking(prompt)],
      ['writer', () => callLLM(prompt, { system: SYSTEM, maxTokens: 8000, tier: 'writer' })],
    ];
    let text = '';
    let usedModel = '';
    const errors: string[] = [];
    for (const [name, run] of attempts) {
      try {
        text = await run();
        if (!text.trim()) throw new Error('empty answer');
        usedModel = name;
        break;
      } catch (e) {
        console.error(`[edit-plan] ${name} failed:`, e);
        errors.push(`${name}: ${String(e).slice(0, 300)}`);
      }
    }
    if (!usedModel) throw new Error(errors.join(' | '));
    const plan = parseModelJson(text, 'edit plan');
    return json({ ...plan, model: usedModel });
  } catch (e) {
    console.error('[edit-plan]', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
