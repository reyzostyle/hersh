import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callLLM } from '../_shared/llm.ts';

// A voice note boiled to one line (iOS app, 2026-10-20). Notes are ideas the
// creator had themselves, spoken in a rush; the gist is what they scan later.
// One cheap bulk call and free: charging credits for remembering your own
// idea would put a price on the habit the app is trying to build.
const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

const SYSTEM = `You turn a rambling spoken note from a video creator into one short line that names the video idea.
Rules: at most 12 words, no quotes, no emojis, no full stop at the end, written as the idea itself (e.g. "Filming the same Short three ways to test hooks"). Keep the creator's language. Return only the line.`;

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
    const { text } = await req.json();
    if (typeof text !== 'string' || !text.trim()) return json({ error: 'text required' }, 400);
    const gist = (await callLLM(text.slice(0, 4000), { system: SYSTEM, maxTokens: 60, tier: 'bulk' }))
      .split('\n')[0].replace(/^["'\s]+|["'.\s]+$/g, '');
    return json({ gist });
  } catch (e) {
    console.error('[note-gist]', e);
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});
