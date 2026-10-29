import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { applyTransaction, verifyNotification, verifyTransaction } from '../_shared/apple.ts';

// App Store Server Notifications V2. Set this function's URL as both the
// production and the sandbox notification URL in App Store Connect (App →
// App Information → App Store Server Notifications). Apple calls it for
// renewals, expiries, refunds and plan changes, including while the app is
// closed for months, so this is what keeps the plan honest; apple-iap only
// covers the moment of purchase. Deployed with --no-verify-jwt: Apple sends no
// Supabase token, the signed payload is the authentication.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok');
  try {
    const { signedPayload } = await req.json().catch(() => ({}));
    if (!signedPayload) return new Response('missing payload', { status: 400 });

    let n;
    try {
      n = await verifyNotification(signedPayload);
    } catch (e) {
      console.error('[apple-notifications] verify', e);
      return new Response('bad signature', { status: 400 });
    }
    console.log(`[apple-notifications] ${n.notificationType}/${n.subtype ?? '-'}`);

    const signedTx = n.data?.signedTransactionInfo;
    if (!signedTx) return new Response('ok');
    const t = await verifyTransaction(signedTx);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const r = await applyTransaction(supabase, t);
    if (!r.ok) console.warn(`[apple-notifications] ${t.transactionId}: ${r.error}`);
    // Anything but 200 makes Apple retry for days; a purchase with no account
    // will not grow one by being retried.
    return new Response('ok');
  } catch (e) {
    console.error('[apple-notifications]', e);
    return new Response('error', { status: 500 });
  }
});
