// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from '../_shared/http.ts';
import Stripe from 'npm:stripe@14.21.0';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });
const OWNER_EMAIL = 'reyzostyle@gmail.com';
const IMAGES_BUCKET = 'chat-images';

// Deletes the caller's account and everything in it (2026-10-28). The App
// Store requires that an app which lets people sign up also lets them delete
// the account from inside it (guideline 5.1.1(v)).
//
// What goes, in this order, and why the order:
// 1. A paid subscription is cancelled now, not at period end: nobody should be
//    charged again for an account that no longer exists. If Stripe fails,
//    nothing is deleted and the caller is told, so we never delete a person
//    and keep billing them.
// 2. Their chat images in storage (`<user id>/<thread>/<file>`): storage rows
//    have no foreign key to the user, so nothing else would remove them.
// 3. The auth user. Every table holding their data references auth.users with
//    ON DELETE CASCADE (checked 2026-10-28: user_tokens, ideas, channels,
//    chats, analyses, videos, projects, embeddings, emails, notion...), and
//    the two referral tables SET NULL, so one delete takes all of it.
//
// The body must say {"confirm": "DELETE"}, so a stray call cannot do this.
// The owner account cannot be deleted here at all.
// Sign in with Apple: an app that offers it must also revoke the user's Apple
// tokens when the account is deleted (App Store 5.1.1(v)). The app asks Apple
// for a fresh authorization code just before calling here; it is exchanged
// for a refresh token, and that token is revoked. Needs a Sign in with Apple
// key from the developer account (APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID,
// APPLE_SIGNIN_PRIVATE_KEY = the .p8 file's contents). Without them, or if
// Apple refuses, the account is deleted anyway: the person asked for that.
const APPLE_CLIENT_ID = 'co.chumoku.app';

async function revokeApple(code: string): Promise<void> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_SIGNIN_KEY_ID');
  const pem = Deno.env.get('APPLE_SIGNIN_PRIVATE_KEY');
  if (!teamId || !keyId || !pem) { console.warn('[delete-account] apple revoke skipped: no key'); return; }
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256');
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId).setIssuedAt().setExpirationTime('5m')
    .setAudience('https://appleid.apple.com').setSubject(APPLE_CLIENT_ID)
    .sign(key);
  const form = (o: Record<string, string>) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(o),
  });
  const tokenRes = await fetch('https://appleid.apple.com/auth/token', form({
    client_id: APPLE_CLIENT_ID, client_secret: secret, code, grant_type: 'authorization_code',
  }));
  const tokens = await tokenRes.json().catch(() => ({}));
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) { console.warn('[delete-account] apple token exchange failed', tokenRes.status, tokens.error); return; }
  const revoke = await fetch('https://appleid.apple.com/auth/revoke', form({
    client_id: APPLE_CLIENT_ID, client_secret: secret, token,
    token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
  }));
  console.log(`[delete-account] apple revoke ${revoke.status}`);
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

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'DELETE') return json({ error: 'Not confirmed' }, 400);
    if (user.email === OWNER_EMAIL) return json({ error: "The owner account can't be deleted from the app." }, 403);

    // 1. Billing.
    const { data: row } = await supabase
      .from('user_tokens').select('stripe_subscription_id, plan').eq('user_id', user.id).maybeSingle();
    if (row?.stripe_subscription_id && row.plan && row.plan !== 'free') {
      try {
        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
        const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        if (sub.status !== 'canceled') await stripe.subscriptions.cancel(row.stripe_subscription_id);
      } catch (e) {
        console.error('[delete-account] stripe', e);
        return json({ error: 'Could not cancel your subscription, so nothing was deleted. Try again, or write to us on Discord.' }, 502);
      }
    }

    // 2. Stored files.
    try {
      const bucket = supabase.storage.from(IMAGES_BUCKET);
      const paths: string[] = [];
      const { data: threads } = await bucket.list(user.id, { limit: 1000 });
      for (const t of threads ?? []) {
        // A folder has no id; a file directly under the user's folder does.
        if (t.id) { paths.push(`${user.id}/${t.name}`); continue; }
        const { data: files } = await bucket.list(`${user.id}/${t.name}`, { limit: 1000 });
        for (const f of files ?? []) paths.push(`${user.id}/${t.name}/${f.name}`);
      }
      for (let i = 0; i < paths.length; i += 100) await bucket.remove(paths.slice(i, i + 100));
    } catch (e) {
      // Not worth keeping the account over: log it and carry on.
      console.error('[delete-account] storage', e);
    }

    // 3. Their Sign in with Apple grant, if the app sent a code for it.
    if (typeof body.appleAuthorizationCode === 'string' && body.appleAuthorizationCode) {
      try { await revokeApple(body.appleAuthorizationCode); } catch (e) { console.error('[delete-account] apple revoke', e); }
    }

    // 4. The user, and with it every row that is theirs.
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
    console.log(`[delete-account] deleted ${user.id}`);
    return json({ success: true });
  } catch (e) {
    console.error('[delete-account]', e);
    return json({ error: 'Could not delete the account. Try again in a minute.' }, 500);
  }
});
