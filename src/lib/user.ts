import type { User } from '@supabase/supabase-js';

// What to call someone.
//
// Three sources, in the order of how much they mean. A name typed in Settings
// is a choice. A name Google handed over at sign-in is a fact nobody chose but
// nobody minds either. The part of an email before the @ is a fallback, and it
// is the reason the hub used to greet people as "kirill.dev2024".
//
// Kept here rather than inlined at the greeting, because the same answer has to
// come out on every screen that says a name.
export function displayNameOf(user: User | null | undefined): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const picked = [meta.display_name, meta.full_name, meta.name]
    .find(v => typeof v === 'string' && v.trim());
  if (picked) return (picked as string).trim();
  return user?.email?.split('@')[0] ?? '';
}

// Someone who signed up minutes ago has nothing to come back to, and "Welcome
// back" on the first screen they ever see is the kind of small wrongness that
// tells people a product was assembled rather than written. A day is generous
// on purpose: it covers signing up at night and opening it again at lunch.
const NEW_FOR_MS = 24 * 60 * 60 * 1000;

export function isNewAccount(user: User | null | undefined): boolean {
  if (!user?.created_at) return false;
  return Date.now() - new Date(user.created_at).getTime() < NEW_FOR_MS;
}

// The last account that signed in on this browser.
//
// Not a session and not a credential: an email, so the sign-in form can come
// back already knowing who you are. Signing out and signing straight back in
// as the same person is the common case by a long way, and typing your own
// address every time is the kind of small friction nobody reports.
//
// Deliberately NOT an auto sign-in. "Sign out" that puts you back in is a
// contradiction, and on a shared machine it hands the account to whoever sits
// down next. The name is shown with a way out beside it, which is the same
// shape as Google's account chooser: recognised, never assumed.
const LAST_EMAIL_KEY = 'chumoku_last_email';

export function rememberLastEmail(email: string | null | undefined) {
  try {
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch { /* private mode */ }
}

export function readLastEmail(): string {
  try { return localStorage.getItem(LAST_EMAIL_KEY) ?? ''; } catch { return ''; }
}

export function forgetLastEmail() {
  try { localStorage.removeItem(LAST_EMAIL_KEY); } catch { /* private mode */ }
}
