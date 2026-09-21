// Shared by the background worker and the popup. The content script cannot
// import modules, so it keeps its own copy of videoIdFrom - keep them in step.

export const APP_URL = 'https://chumoku.co';

// Any YouTube video link down to its id: /shorts/ID, watch?v=ID, youtu.be/ID.
export function videoIdFrom(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// The app reads ?analyze= and ?steal= on load (src/lib/intents.ts), runs the
// action if signed in, and carries it through signup if not. The link is
// normalised to the Shorts form so the analysis sees the same URL whichever
// page it was pressed on.
export function appUrlFor(action, videoId) {
  const link = `https://www.youtube.com/shorts/${videoId}`;
  return `${APP_URL}/?${action}=${encodeURIComponent(link)}&utm_source=extension`;
}
