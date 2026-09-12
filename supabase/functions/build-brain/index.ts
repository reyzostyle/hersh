import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { buildBrain, loadBrain } from '../_shared/brain.ts';

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

// Builds (or rebuilds) the channel brain for the signed-in account.
//
// Called at three moments, all of them ones where the user is already waiting
// on something: finishing onboarding, saving the profile, and pressing rebuild
// in Settings. Nothing else builds it - see _shared/brain.ts for why an
// analysis must never quietly trigger a second model call.
//
// Free. It is one small call, and charging for the step that makes every other
// step better is a good way to have nobody take it.

const COOLDOWN_MS = 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { force } = await req.json().catch(() => ({ force: false }));

    const { data: row } = await supabase
      .from('user_tokens').select('brain_at').eq('user_id', user.id).maybeSingle();
    const builtAt = row?.brain_at ? new Date(row.brain_at).getTime() : 0;

    // Two rebuilds a minute apart say more about a stuck button than about a
    // channel that changed, and the second one costs the same as the first.
    if (!force && Date.now() - builtAt < COOLDOWN_MS) {
      return json({ brain: await loadBrain(supabase, user.id), cached: true });
    }

    const brain = await buildBrain(supabase, user.id);

    // Nothing typed and nothing connected is not an error, it is an account
    // that has not told us anything yet - the screen says so.
    if (!brain) return json({ brain: null, reason: 'nothing_to_read' });

    return json({ brain });
  } catch (e) {
    console.error('[build-brain]', e);
    return json({ error: e instanceof Error ? e.message : 'Could not build the profile' }, 500);
  }
});
