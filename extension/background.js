import { videoIdFrom, appUrlFor } from './shared.js';

// Opens the app on the result, next to the tab the button was pressed in, so
// closing it lands you back on the Short you were watching.
async function open(action, videoId, fromTab) {
  const url = appUrlFor(action, videoId);
  const props = { url, active: true };
  if (fromTab && typeof fromTab.index === 'number') {
    props.index = fromTab.index + 1;
    props.openerTabId = fromTab.id;
  }
  await chrome.tabs.create(props);
}

// From the buttons injected on the Short and from the popup.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'chumoku:open') return;
  const id = videoIdFrom(msg.url);
  if (!id || (msg.action !== 'analyze' && msg.action !== 'steal')) {
    sendResponse({ ok: false });
    return;
  }
  open(msg.action, id, sender.tab || msg.tab).then(() => sendResponse({ ok: true }));
  return true;
});

// Right-click on any Short, in a shelf, a search result or a channel page,
// without opening it first.
const LINK_PATTERNS = [
  '*://*.youtube.com/shorts/*',
  '*://*.youtube.com/watch*',
  '*://youtu.be/*',
];

chrome.runtime.onInstalled.addListener((details) => {
  // Two roots: one on Short links anywhere on YouTube, one on the page itself
  // when the page is a Short. A single root on 'page' would show on every
  // YouTube page, including the home feed where there is nothing to act on.
  const roots = [
    { id: 'link', contexts: ['link'], targetUrlPatterns: LINK_PATTERNS, documentUrlPatterns: ['*://*.youtube.com/*'] },
    { id: 'page', contexts: ['page'], documentUrlPatterns: ['*://*.youtube.com/shorts/*'] },
  ];
  chrome.contextMenus.removeAll(() => {
    for (const { id, ...scope } of roots) {
      chrome.contextMenus.create({ id: `${id}:root`, title: 'Chumoku', ...scope });
      chrome.contextMenus.create({ id: `${id}:analyze`, parentId: `${id}:root`, title: 'Analyze this Short', ...scope });
      chrome.contextMenus.create({ id: `${id}:steal`, parentId: `${id}:root`, title: 'Steal this format', ...scope });
    }
  });
  // First install: show what it does on a real Short instead of leaving an
  // icon in the toolbar and nothing else.
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const [where, action] = String(info.menuItemId).split(':');
  if (action !== 'analyze' && action !== 'steal') return;
  const id = where === 'link' ? videoIdFrom(info.linkUrl) : videoIdFrom(info.pageUrl);
  if (id) open(action, id, tab);
});

// Alt+Shift+A / Alt+Shift+S on the Short you are watching.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'analyze' && command !== 'steal') return;
  const active = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const id = videoIdFrom(active?.url);
  if (id) open(command, id, active);
});
