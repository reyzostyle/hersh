import { videoIdFrom, appUrlFor, PANEL_KEY } from './shared.js';

// Shows the result in the side panel, beside the video. Falls back to a tab
// next to this one if the panel will not open (an older Chrome, or a call that
// Chrome did not count as a user gesture).
//
// sidePanel.open() has to be the first thing that happens: Chrome only allows
// it while the click that caused it is still being handled, and any await
// before it spends that. So it is called synchronously and the request is
// written afterwards; the panel picks it up from storage when it loads.
function open(action, videoId, fromTab) {
  const url = `https://www.youtube.com/shorts/${videoId}`;
  const windowId = fromTab?.windowId;
  let opening;
  try {
    opening = windowId != null ? chrome.sidePanel.open({ windowId }) : Promise.reject(new Error('no window'));
  } catch (e) {
    opening = Promise.reject(e);
  }
  chrome.storage.session.set({
    [PANEL_KEY]: { action, url, id: crypto.randomUUID(), at: Date.now() },
  });
  return opening.catch(() => openTab(action, videoId, fromTab));
}

async function openTab(action, videoId, fromTab) {
  const props = { url: appUrlFor(action, videoId), active: true };
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
// `tab` is passed by Chrome here, which matters: querying for it first would
// be an await, and the panel would then refuse to open.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'analyze' && command !== 'steal') return;
  const id = videoIdFrom(tab?.url);
  if (id) open(command, id, tab);
});
