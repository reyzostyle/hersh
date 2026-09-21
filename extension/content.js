// Puts Analyze and Steal on every YouTube Short, in the same column as Like,
// Comment and Share, so they are where the thumb already is while scrolling.
//
// YouTube renders one action bar per Short in the feed
// (reel-action-bar-view-model, checked against the live page 2026-09-22) and
// recycles them as you scroll. Each bar gets our buttons once, marked with a
// data attribute; the video they act on is read from the address bar at click
// time, which always names the Short on screen - the only one whose buttons
// can be clicked. If YouTube renames the bar, a floating pair takes over on
// /shorts/ pages so the extension degrades instead of disappearing.

(() => {
  const APP_URL = 'https://chumoku.co';
  const MARK = 'data-chumoku';

  // Kept in step with shared.js; content scripts cannot import modules.
  function videoIdFrom(input) {
    if (!input) return null;
    const m = String(input).match(/(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  const isShortsPage = () => location.pathname.startsWith('/shorts/');

  // Built with createElementNS, not innerHTML: YouTube enforces Trusted Types,
  // and an innerHTML assignment from a content script throws there.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    analyze: [
      ['circle', { cx: 11, cy: 11, r: 7 }],
      ['path', { d: 'm20 20-3.5-3.5' }],
      ['path', { d: 'M8 12.5l2-2.5 2 1.5 2-3' }],
    ],
    steal: [
      ['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2.5 }],
      ['path', { d: 'M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8' }],
      ['path', { d: 'M14 11.5v5M11.5 14h5' }],
    ],
  };

  function icon(action) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    const attrs = { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
    for (const [tag, a] of ICONS[action]) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v));
      svg.appendChild(el);
    }
    return svg;
  }

  const LABELS = { analyze: 'Analyze', steal: 'Steal' };
  const TITLES = {
    analyze: 'Chumoku: why this Short worked, scored out of 100',
    steal: 'Chumoku: rebuild this format as an outline for your channel',
  };

  function openInApp(action) {
    const id = videoIdFrom(location.href);
    if (!id) return false;
    const url = `https://www.youtube.com/shorts/${id}`;
    try {
      chrome.runtime.sendMessage({ type: 'chumoku:open', action, url }, () => {
        // Swallow "receiving end does not exist" after an extension reload.
        void chrome.runtime.lastError;
      });
    } catch {
      // The extension was updated or reloaded under this page, so the runtime
      // is gone until YouTube is refreshed. Open the app directly instead.
      window.open(`${APP_URL}/?${action}=${encodeURIComponent(url)}&utm_source=extension`, '_blank', 'noopener');
    }
    return true;
  }

  function button(action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chumoku-btn chumoku-btn--${action}`;
    b.title = TITLES[action];
    b.setAttribute('aria-label', TITLES[action]);
    const circle = document.createElement('span');
    circle.className = 'chumoku-btn__circle';
    circle.appendChild(icon(action));
    const label = document.createElement('span');
    label.className = 'chumoku-btn__label';
    label.textContent = LABELS[action];
    b.append(circle, label);
    b.addEventListener('click', (e) => {
      // The overlay under the bar toggles play/pause on click.
      e.preventDefault();
      e.stopPropagation();
      if (!openInApp(action)) return;
      b.classList.add('chumoku-btn--sent');
      label.textContent = 'Opening';
      setTimeout(() => {
        b.classList.remove('chumoku-btn--sent');
        label.textContent = LABELS[action];
      }, 1600);
    }, true);
    return b;
  }

  function group(extraClass) {
    const g = document.createElement('div');
    g.className = `chumoku-group ${extraClass || ''}`.trim();
    g.setAttribute(MARK, '');
    g.append(button('analyze'), button('steal'));
    return g;
  }

  function injectIntoBars() {
    let found = 0;
    document.querySelectorAll('reel-action-bar-view-model').forEach((bar) => {
      found++;
      if (bar.querySelector(`:scope > [${MARK}]`)) return;
      bar.prepend(group());
    });
    return found;
  }

  let floating = null;
  function syncFloating(barsFound) {
    const want = isShortsPage() && barsFound === 0;
    if (want && !floating) {
      floating = group('chumoku-group--floating');
      document.body.appendChild(floating);
    } else if (!want && floating) {
      floating.remove();
      floating = null;
    }
  }

  // The bars do not exist the moment /shorts/ loads, so the floating fallback
  // waits a beat before deciding YouTube's markup has moved.
  let firstSeenShorts = 0;
  function tick() {
    const found = injectIntoBars();
    if (isShortsPage()) {
      if (!firstSeenShorts) firstSeenShorts = Date.now();
      syncFloating(Date.now() - firstSeenShorts > 4000 ? found : 1);
    } else {
      firstSeenShorts = 0;
      syncFloating(1);
    }
  }

  // YouTube mutates constantly; at most one pass per quarter second, and only
  // after something actually changed.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; tick(); }, 250);
  };

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', schedule);
  tick();
})();
