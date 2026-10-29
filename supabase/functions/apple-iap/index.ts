import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { applyTransaction, verifyTransaction } from '../_shared/apple.ts';

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });

// The iOS app reports a purchase here right after StoreKit completes it, and
// again for anything Transaction.updates or a restore turns up. The body is
// the transaction exactly as Apple signed it ({ jws }); nothing the app says
// about it is trusted, only what the signature covers.
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

    const { jws } = await req.json().catch(() => ({}));
    if (typeof jws !== 'string' || !jws) return json({ error: 'Missing transaction' }, 400);

    let t;
    try {
      t = await verifyTransaction(jws);
    } catch (e) {
      console.error('[apple-iap] verify', e);
      return json({ error: 'Could not verify that purchase with Apple.' }, 400);
    }

    const r = await applyTransaction(supabase, t, user.id);
    if (!r.ok) return json({ error: r.error }, r.status);
    console.log(`[apple-iap] user=${user.id} product=${t.productId} tx=${t.transactionId} plan=${r.plan ?? '-'} credits=${r.credits ?? 0}`);
    return json(r);
  } catch (e) {
    console.error('[apple-iap]', e);
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
});
