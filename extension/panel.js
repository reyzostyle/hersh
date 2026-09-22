import { APP_URL, PANEL_KEY } from './shared.js';

// Hands each Analyze / Steal press to the app in the iframe.
//
// The background worker writes the request to session storage and opens this
// panel. On the first load the request rides in the iframe's URL; after that
// it is posted in, so pressing again on the next Short does not reload the app.
// A request is delivered once, tracked by its id, whichever way arrives first.

const frame = document.getElementById('app');

// A request older than this was pressed before the panel was last closed.
// Reopening the panel from Chrome's own menu must not quietly re-run (and
// re-bill) whatever was pressed an hour ago.
const FRESH_MS = 15000;
const fresh = (req) => req && Date.now() - req.at < FRESH_MS;
let ready = false;
let delivered = null;

function deliver(req) {
  if (!fresh(req) || req.id === delivered || !ready) return;
  delivered = req.id;
  frame.contentWindow.postMessage({ type: 'chumoku:run', action: req.action, url: req.url }, APP_URL);
}

window.addEventListener('message', (e) => {
  if (e.origin !== APP_URL || e.source !== frame.contentWindow) return;
  if (e.data?.type === 'chumoku:panel-ready') {
    ready = true;
    chrome.storage.session.get(PANEL_KEY).then((s) => deliver(s[PANEL_KEY]));
  }
});

chrome.storage.session.onChanged.addListener((changes) => {
  if (changes[PANEL_KEY]?.newValue) deliver(changes[PANEL_KEY].newValue);
});

const { [PANEL_KEY]: first } = await chrome.storage.session.get(PANEL_KEY);
const src = new URL(`${APP_URL}/panel`);
src.searchParams.set('utm_source', 'extension');
if (fresh(first)) {
  // Marked delivered up front: the app reads it from the URL, and the
  // ready message that follows must not run it a second time.
  src.searchParams.set('action', first.action);
  src.searchParams.set('url', first.url);
  delivered = first.id;
}
frame.src = src.toString();
