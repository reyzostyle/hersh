import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders } from '../_shared/http.ts';
import { syncUserEmbeddings } from '../_shared/embeddings.ts';

// Keeps this account's work searchable by meaning.
//
// Called fire-and-forget by the client. Nothing waits on it and nothing breaks
// without it: the chat's lookup tools fall back to matching on words, so a slow
// or failed sync costs recall and never an answer.
//
// Free, and deliberately. The credit ledger prices what a creator asked for; an
// index that has to exist before the thing they asked for works well is
// housekeeping, and charging for housekeeping is how you end up with an account
// that quietly gets worse at answering because its owner is being careful with
// credits. It is also genuinely cheap - one small embedding call per new row,
// once, and never again for that row.
//
// The ceiling is the guard instead. A batch is bounded, the sync is
// re-runnable, and a backlog drains over several calls rather than in one long
// request that times out halfway.

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

// Sized to finish inside a comfortable request rather than to finish the job.
// An account with a real backlog drains it over a few visits.
const BATCH = 40;

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

    // The signed-in user's own id, never a parameter. Same rule as the lookup
    // tools: there is no way to ask this to index somebody else's account.
    const indexed = await syncUserEmbeddings(supabase, user.id, BATCH);
    return json({ indexed, more: indexed >= BATCH });
  } catch (e) {
    console.error('[sync-embeddings]', e);
    // A 200 with the reason, not a 500. The caller is a fire-and-forget from
    // the client that does nothing with either, and this failing is not a
    // failure of anything the creator asked for.
    return json({ indexed: 0, error: e instanceof Error ? e.message : 'sync failed' });
  }
});
