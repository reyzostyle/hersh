// One place for the things that carry the product's name.
//
// The rename from Chumoku to Chumoku touched thirty four files, which is what
// happens when a brand is typed out at every call site instead of imported.
// The .com is still to be bought, so the domain will move once more; that move
// should be this file and nothing else.
export const BRAND = 'Chumoku';
export const SITE_URL = 'https://chumoku.co';
// Without the scheme, for the places that print a link to be read rather than
// clicked: a referral URL someone types into a browser bar, a policy page
// naming the site.
export const SITE_HOST = 'chumoku.co';
export const SUPPORT_EMAIL = 'support@chumoku.co';

// Browser storage outlives a deploy, so a renamed key is a user who lost
// whatever it held. Two of these matter beyond tidiness: chumoku_ref carries the
// referral code that decides who gets paid for a signup, and chumoku_onboarding
// carries a half-finished onboarding across the YouTube OAuth redirect. Both
// would silently reset.
//
// Copy across once, then drop the old name. Anyone who has not opened the app
// since the rename still gets their value the first time they do.
const RENAMED_KEYS: [string, string][] = [
  ['hersh_ref', 'chumoku_ref'],
  ['hershy_pending_video_url', 'chumoku_pending_video_url'],
  ['hershy_onboarding', 'chumoku_onboarding'],
  ['hershy_onboarding_offer_dismissed', 'chumoku_onboarding_offer_dismissed'],
  ['hershy_analyze_submode', 'chumoku_analyze_submode'],
  ['hershy_last_plan', 'chumoku_last_plan'],
  ['hershy_open_competitor_video', 'chumoku_open_competitor_video'],
  ['hershy_open_thread', 'chumoku_open_thread'],
  ['hershy_sidebar_collapsed', 'chumoku_sidebar_collapsed'],
];

export function migrateStorageKeys(): void {
  for (const [before, after] of RENAMED_KEYS) {
    // The rename's find-and-replace once turned every pair here into the same
    // name twice, and the removeItem below then deleted each key on every page
    // load - the referral code included, since App.tsx writes it before this
    // runs. A pair that maps to itself is never a migration.
    if (before === after) continue;
    try {
      const value = localStorage.getItem(before);
      if (value === null) continue;
      // Never overwrite: a value written under the new name is newer than
      // anything left under the old one.
      if (localStorage.getItem(after) === null) localStorage.setItem(after, value);
      localStorage.removeItem(before);
    } catch {
      // Private mode, blocked storage, a full quota. Nothing here is worth
      // failing a page load over.
    }
  }
}
