// deno-lint-ignore-file no-explicit-any
// In-app purchases from the iOS app: what each product grants, how a signed
// transaction from Apple is checked, and how it lands on user_tokens.
// Shared by apple-iap (the app reports a purchase) and apple-notifications
// (Apple reports renewals, expiries and refunds on its own).
import {
  SignedDataVerifier,
  Environment,
  type JWSTransactionDecodedPayload,
} from 'npm:@apple/app-store-server-library@1.6.0';
import { Buffer } from 'node:buffer';

export const BUNDLE_ID = 'co.chumoku.app';

// Product ids as created in App Store Connect and in ios/Chumoku.storekit.
// Plans use the database names: 'pro' is Plus, 'agency' is Pro.
export const SUBSCRIPTIONS: Record<string, string> = {
  'co.chumoku.app.plus.monthly': 'pro',
  'co.chumoku.app.plus.yearly': 'pro',
  'co.chumoku.app.pro.monthly': 'agency',
  'co.chumoku.app.pro.yearly': 'agency',
};
export const TOPUPS: Record<string, number> = {
  'co.chumoku.app.credits50': 50,
};

// Apple Root CA - G3, from apple.com/certificateauthority (SHA-256
// 63:34:3A:BF:...:91:79). Every App Store signature chains up to it.
const APPLE_ROOT_G3 = 'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';

function verifiers(): SignedDataVerifier[] {
  const roots = [Buffer.from(APPLE_ROOT_G3, 'base64')];
  const list: SignedDataVerifier[] = [];
  // Production needs the app's numeric Apple ID (App Store Connect → App
  // Information). Until it is set, only sandbox and TestFlight purchases pass.
  const appAppleId = Number(Deno.env.get('APPLE_APP_ID') || 0);
  if (appAppleId) list.push(new SignedDataVerifier(roots, true, Environment.PRODUCTION, BUNDLE_ID, appAppleId));
  list.push(new SignedDataVerifier(roots, true, Environment.SANDBOX, BUNDLE_ID));
  // Purchases made in the simulator against ios/Chumoku.storekit are signed by
  // Xcode, not Apple, so they prove nothing. Only for local testing.
  if (Deno.env.get('APPLE_IAP_ALLOW_XCODE') === '1') list.push(new SignedDataVerifier(roots, false, Environment.XCODE, BUNDLE_ID));
  return list;
}

export async function verifyTransaction(jws: string): Promise<JWSTransactionDecodedPayload> {
  let last: unknown;
  for (const v of verifiers()) {
    try { return await v.verifyAndDecodeTransaction(jws); } catch (e) { last = e; }
  }
  throw last ?? new Error('No verifier');
}

export async function verifyNotification(signedPayload: string) {
  let last: unknown;
  for (const v of verifiers()) {
    try { return await v.verifyAndDecodeNotification(signedPayload); } catch (e) { last = e; }
  }
  throw last ?? new Error('No verifier');
}

export type Applied =
  | { ok: true; plan?: string; credits?: number }
  | { ok: false; error: string; status: number };

// Puts one verified transaction on the account. Safe to call any number of
// times with the same transaction: apple_transactions makes each one count once.
// `userId` is who the caller says it is for (the signed-in user in apple-iap);
// without it the owner comes from the purchase's appAccountToken, which the app
// sets to the user's id, or from the account that already holds the
// subscription.
export async function applyTransaction(supabase: any, t: JWSTransactionDecodedPayload, userId?: string): Promise<Applied> {
  if (t.bundleId !== BUNDLE_ID) return { ok: false, error: 'Wrong app', status: 400 };
  const productId = t.productId ?? '';
  const txId = t.transactionId!;
  const originalId = t.originalTransactionId ?? txId;
  const token = t.appAccountToken?.toLowerCase();

  if (userId && token && token !== userId) {
    return { ok: false, error: 'This purchase belongs to another Chumoku account.', status: 403 };
  }
  let owner = userId ?? token;
  if (!owner) {
    const { data } = await supabase.from('user_tokens').select('user_id')
      .eq('apple_original_transaction_id', originalId).maybeSingle();
    owner = data?.user_id;
  }
  if (!owner) return { ok: false, error: 'No account for this purchase', status: 404 };

  const revoked = !!t.revocationDate;
  const { data: seen } = await supabase.from('apple_transactions').select('revoked').eq('transaction_id', txId).maybeSingle();
  if (!seen) {
    await supabase.from('apple_transactions').insert({
      transaction_id: txId, original_transaction_id: originalId, user_id: owner,
      product_id: productId, environment: t.environment ?? null, revoked,
    });
  } else if (revoked && !seen.revoked) {
    await supabase.from('apple_transactions').update({ revoked: true }).eq('transaction_id', txId);
  }

  // Credits top-up: added once, taken back once if Apple refunds it.
  if (productId in TOPUPS) {
    const amount = TOPUPS[productId];
    const { data: row } = await supabase.from('user_tokens').select('bonus_credits').eq('user_id', owner).maybeSingle();
    const bonus = row?.bonus_credits ?? 0;
    if (!seen && !revoked) {
      await supabase.from('user_tokens').update({ bonus_credits: bonus + amount }).eq('user_id', owner);
      return { ok: true, credits: amount };
    }
    if (revoked && !seen?.revoked && seen) {
      await supabase.from('user_tokens').update({ bonus_credits: Math.max(0, bonus - amount) }).eq('user_id', owner);
    }
    return { ok: true };
  }

  const plan = SUBSCRIPTIONS[productId];
  if (!plan) return { ok: false, error: 'Unknown product', status: 400 };

  // Someone else's account already has this Apple subscription.
  const { data: holder } = await supabase.from('user_tokens').select('user_id')
    .eq('apple_original_transaction_id', originalId).maybeSingle();
  if (holder && holder.user_id !== owner) {
    return { ok: false, error: 'This App Store subscription is already used by another Chumoku account.', status: 409 };
  }

  const expires = t.expiresDate ? new Date(t.expiresDate) : null;
  const active = !revoked && !!expires && expires > new Date();
  if (active) {
    const patch: Record<string, unknown> = {
      plan,
      apple_original_transaction_id: originalId,
      apple_product_id: productId,
      apple_expires_at: expires!.toISOString(),
    };
    // A new period (first purchase, renewal, upgrade) starts the month's
    // credits over, as a paid Stripe invoice does.
    if (!seen) {
      const resetAt = new Date();
      resetAt.setDate(resetAt.getDate() + 30);
      patch.credits_used = 0;
      patch.credits_reset_at = resetAt.toISOString();
    }
    await supabase.from('user_tokens').update(patch).eq('user_id', owner);
    if (!seen && txId === originalId) {
      await supabase.from('plan_events').insert({
        user_id: owner, plan, event_type: 'subscribed',
        amount_cents: t.currency === 'USD' && t.price ? Math.round(t.price / 10) : null,
      });
    }
    return { ok: true, plan };
  }

  // Lapsed or refunded: back to free, unless the plan now comes from Stripe.
  const { data: row } = await supabase.from('user_tokens')
    .select('plan, apple_original_transaction_id, apple_expires_at, stripe_subscription_id').eq('user_id', owner).maybeSingle();
  // Only if nothing newer is running: an old period expiring or being
  // refunded after a renewal or an upgrade must not end the current one.
  const stored = row?.apple_expires_at ? new Date(row.apple_expires_at) : null;
  const stillCurrent = row?.apple_original_transaction_id === originalId && (
    revoked ? !stored || !expires || expires >= stored : !stored || stored <= new Date()
  );
  if (stillCurrent && !row.stripe_subscription_id && row.plan !== 'free') {
    await supabase.from('user_tokens').update({ plan: 'free', apple_expires_at: expires?.toISOString() ?? null }).eq('user_id', owner);
    await supabase.from('plan_events').insert({ user_id: owner, plan: row.plan, event_type: 'cancelled' });
    return { ok: true, plan: 'free' };
  }
  return { ok: true, plan: row?.plan ?? 'free' };
}
