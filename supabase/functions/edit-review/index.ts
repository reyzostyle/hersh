import { corsHeaders } from '../_shared/http.ts';
import { watchVideo } from '../_shared/analyze-video.ts';
import { parseModelJson } from '../_shared/json.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// The last look before posting. The iOS editor renders the finished Short,
// uploads a small copy straight to Gemini (get-upload-url), and this function
// has the model watch it with sound, the way a viewer scrolling past would,
// and say whether it is ready and what to fix first.
//
// It judges the edit, not the idea: the idea was chosen earlier, and a creator
// about to post needs "your first second is dead air", not a new concept.
//
// Owner only, like edit-plan, while the editor is being proven.
const CORS = corsHeaders({ methods: 'POST, OPTIONS' });
const OWNER_EMAIL = 'reyzostyle@gmail.com';

const PROMPT = (facts: string) => `You are the editor a top short-form creator trusts. You are watching their finished vertical video (TikTok / Reels / YouTube Shorts) one last time before they post it. Watch it with the sound on, as someone scrolling would, then judge the EDIT: what they could still change in the app before posting.

What you know about it:
${facts}

Judge, in this order of importance:
1. Hook: do the first 1-2 seconds give a reason to stay? A slow start, a greeting, dead air or a mumbled first word loses most viewers.
2. Pacing: dead air, a sentence said twice, a part that drags, a stumble that was left in.
3. Sound: can the voice be understood clearly, is there hum, echo, background noise or clipping, is it too quiet?
4. Captions and text: readable at a glance, in sync with the voice, not covering the face, not sitting where the app's own buttons go (the bottom 23% and the right 13% of the frame are covered by the feed's text and buttons), no misspelled words.
5. Picture: is the face lit and visible, framing, anything distracting.
6. Ending: does it end on the payoff or trail off; would it loop well.

Rules:
- Be blunt and specific, like a friend who edits for a living. Point at the exact moment with a timestamp in seconds when there is one.
- At most 5 notes, most important first. Include at most one "good" note, only if something is genuinely strong.
- Each note says what is wrong AND what to do about it in the app, in one or two short sentences, no jargon.
- If a fix is one of these, name it in "fix": "clean_audio" (remove background noise), "tighter" (cut pauses shorter), "faster" (speed up to 1.2x), "captions_up" (move captions higher, out of the covered area), "captions_bigger" (bigger captions), "trim_start" (cut the first words before the real start, give "at" as the second the real start begins). Otherwise "fix" is null.
- "verdict": "post" when it is ready (small notes are fine), "fix" when something should be changed first and it can be fixed in the edit, "reshoot" only when the problem is in the filming itself (unusable sound, face not visible, the hook needs to be said differently).
- "headline": one short sentence, the overall call, in plain words.
- "score": 1-10, how likely this edit is to hold a viewer past the first 3 seconds and to the end. Be honest, most first edits are 4-7.
- Plain English. No em dashes.

Answer with JSON only:
{"verdict":"fix","score":6,"headline":"...","notes":[{"area":"hook","good":false,"at":0.0,"text":"...","fix":"trim_start"}]}
"area" is one of: hook, pacing, sound, captions, picture, ending.`;

const AREAS = new Set(['hook', 'pacing', 'sound', 'captions', 'picture', 'ending']);
const FIXES = new Set(['clean_audio', 'tighter', 'faster', 'captions_up', 'captions_bigger', 'trim_start']);

// deno-lint-ignore no-explicit-any
function normalize(raw: any) {
  const verdict = ['post', 'fix', 'reshoot'].includes(raw?.verdict) ? raw.verdict : 'fix';
  const score = Math.max(1, Math.min(10, Math.round(Number(raw?.score) || 5)));
  // deno-lint-ignore no-explicit-any
  const notes = (Array.isArray(raw?.notes) ? raw.notes : []).slice(0, 6).map((n: any) => ({
    area: AREAS.has(n?.area) ? n.area : 'pacing',
    good: n?.good === true,
    at: Number.isFinite(Number(n?.at)) && n?.at !== null && n?.at !== '' ? Number(n.at) : null,
    text: String(n?.text ?? '').trim(),
    fix: FIXES.has(n?.fix) ? n.fix : null,
  })).filter((n: { text: string }) => n.text);
  return { verdict, score, headline: String(raw?.headline ?? '').trim(), notes };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  let fileName = '';
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (user.email !== OWNER_EMAIL) return json({ error: 'Forbidden' }, 403);
    if (!apiKey) throw new Error('Gemini API key not configured');

    const body = await req.json() as {
      geminiFileName?: string; transcript?: string; script?: string; duration?: number; facts?: string[];
    };
    fileName = String(body.geminiFileName ?? '');
    if (!/^files\/[a-z0-9-]+$/i.test(fileName)) return json({ error: 'No video' }, 400);

    // Gemini processes an upload before it can be watched; a short clip takes
    // a few seconds.
    let uri = '';
    let mimeType = 'video/mp4';
    for (let i = 0; i < 40 && !uri; i++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
      if (!r.ok) throw new Error(`file poll ${r.status}: ${await r.text()}`);
      const f = await r.json();
      if (f.state === 'ACTIVE') { uri = f.uri; mimeType = f.mimeType || mimeType; break; }
      if (f.state === 'FAILED') throw new Error('Gemini could not process the video');
      await new Promise(res => setTimeout(res, 1500));
    }
    if (!uri) throw new Error('The video took too long to process');

    const facts = [
      `Length: ${Math.round(Number(body.duration) || 0)} seconds.`,
      ...(Array.isArray(body.facts) ? body.facts.map(String).slice(0, 12) : []),
      body.script?.trim() ? `The script they meant to say:\n${body.script.trim().slice(0, 4000)}` : 'No script; they talked freely.',
      body.transcript?.trim() ? `What is said, with the second each phrase starts (from speech recognition, may have small errors):\n${body.transcript.trim().slice(0, 6000)}` : '',
    ].filter(Boolean).join('\n');

    const text = await watchVideo({ fileUri: uri, mimeType }, PROMPT(facts), { maxTokens: 3000 });
    const review = normalize(parseModelJson(text, 'edit review'));
    console.log(`[edit-review] ${review.verdict} ${review.score}/10, ${review.notes.length} notes`);
    return json(review);
  } catch (e) {
    console.error('[edit-review]', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  } finally {
    // The upload is only for this one look; do not leave it on Google's side.
    if (apiKey && /^files\/[a-z0-9-]+$/i.test(fileName)) {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});
    }
  }
});
