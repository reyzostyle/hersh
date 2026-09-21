// Links that arrive carrying something to do: the Chrome extension's Analyze
// and Steal buttons, and a phone's share sheet.
//
//   /?analyze=<url>   run the analysis, same as pasting into the hero
//   /?steal=<url>     rebuild that Short's format for this channel
//   /share?text=...   the share sheet; asks which of the two
//
// Each is turned into a one-shot key in localStorage and stripped from the
// address bar, so a reload does not run it twice and the key survives signup
// and onboarding the same way the hero's pending link already does.

export const PENDING_ANALYZE_KEY = 'chumoku_pending_video_url';
export const PENDING_STEAL_KEY = 'chumoku_pending_steal_url';
export const PENDING_SHARE_KEY = 'chumoku_pending_share_url';

export type Intent = 'analyze' | 'steal' | 'share';

// Share sheets send the link inside whatever text the app felt like adding
// ("Check out this Short! https://youtube.com/shorts/..."), and some put it in
// `text` rather than `url`. Pull out the first YouTube link from any of it.
export function findYouTubeLink(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i);
  return m ? m[0] : null;
}

function set(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: the link is lost, nothing breaks */ }
}

export function take(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) localStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}

export function peek(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

// What this page load arrived with, for the landing page: a guest who pressed
// a button in the extension should see the work start, not a marketing page.
export let arrivedWith: Intent | null = null;

export function captureIntents(): void {
  const url = new URL(window.location.href);
  const p = url.searchParams;
  const analyze = p.get('analyze');
  const steal = p.get('steal');
  const shared = url.pathname.replace(/\/$/, '') === '/share'
    ? findYouTubeLink(p.get('url')) || findYouTubeLink(p.get('text')) || findYouTubeLink(p.get('title'))
    : null;

  if (analyze) { set(PENDING_ANALYZE_KEY, analyze); arrivedWith = 'analyze'; }
  else if (steal) { set(PENDING_STEAL_KEY, steal); arrivedWith = 'steal'; }
  else if (shared) { set(PENDING_SHARE_KEY, shared); arrivedWith = 'share'; }
  else if (url.pathname.replace(/\/$/, '') !== '/share') return;

  // /share with nothing usable in it still leaves for the app rather than
  // rendering a path nothing routes.
  ['analyze', 'steal', 'url', 'text', 'title'].forEach(k => p.delete(k));
  const path = url.pathname.replace(/\/$/, '') === '/share' ? '/' : url.pathname;
  const qs = p.toString();
  window.history.replaceState({}, '', path + (qs ? `?${qs}` : '') + url.hash);
}
