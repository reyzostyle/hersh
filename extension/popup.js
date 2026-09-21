import { videoIdFrom } from './shared.js';

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const tabVideo = videoIdFrom(tab?.url);

const onVideo = document.getElementById('on-video');
const offVideo = document.getElementById('off-video');
const input = document.getElementById('link');
const error = document.getElementById('link-error');

function send(action, url) {
  chrome.runtime.sendMessage({ type: 'chumoku:open', action, url, tab }, () => window.close());
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
