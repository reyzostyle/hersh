import { videoIdFrom, appUrlFor, PANEL_KEY } from './shared.js';

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const tabVideo = videoIdFrom(tab?.url);

const onVideo = document.getElementById('on-video');
const offVideo = document.getElementById('off-video');
const input = document.getElementById('link');
const error = document.getElementById('link-error');

// Opened from here directly rather than through the background worker: the
// click in this popup is the user gesture sidePanel.open() needs, and it has
// to be called before anything awaits. Same order as background.js.
function send(action, url) {
  const id = videoIdFrom(url);
  let opening;
  try { opening = chrome.sidePanel.open({ windowId: tab.windowId }); } catch (e) { opening = Promise.reject(e); }
  chrome.storage.session.set({
    [PANEL_KEY]: { action, url: `https://www.youtube.com/shorts/${id}`, id: crypto.randomUUID(), at: Date.now() },
  });
  opening
    .catch(() => chrome.tabs.create({ url: appUrlFor(action, id), index: tab.index + 1 }))
    .finally(() => window.close());
}

if (tabVideo) {
  onVideo.hidden = false;
  document.getElementById('video-id').textContent = `youtube.com/shorts/${tabVideo}`;
  onVideo.querySelectorAll('[data-action]').forEach((b) => {
    b.addEventListener('click', () => send(b.dataset.action, tab.url));
  });
} else {
  offVideo.hidden = false;
  input.focus();
  const go = (action) => {
    const id = videoIdFrom(input.value);
    if (!id) { error.hidden = false; input.focus(); return; }
    send(action, `https://www.youtube.com/shorts/${id}`);
  };
  input.addEventListener('input', () => { error.hidden = true; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('analyze'); });
  offVideo.querySelectorAll('[data-action]').forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.action));
  });
}
