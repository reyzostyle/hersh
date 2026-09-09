import { useEffect, useRef } from 'react';

// Back, as a gesture rather than a button.
//
// The app is one page with a tab in React state, so until now the browser knew
// about exactly one screen: every tab, every project, every video the user had
// opened was the same history entry. A swipe from the left edge of a phone, a
// two-finger swipe on a trackpad, the fourth button on a mouse, and the browser's
// own back arrow all did the same thing - left the product entirely, to whatever
// page came before it. On a phone that is the single most-used gesture there is.
//
// So each screen gets a history entry. Nothing here touches the URL: this is a
// single-page app served from one path, and rewriting the address bar would mean
// a real router, server rewrites for every tab, and a set of URLs that are
// suddenly public API. The entry carries the screen in `history.state` instead,
// which is enough for back and forward to mean what they mean everywhere else.

interface ScreenState {
  chumokuTab?: string;
  // A view opened on top of a tab - a project, a competitor's video. It carries
  // no name because nothing needs to restore it: going back only has to close it.
  chumokuLayer?: number;
}

const state = (): ScreenState => (history.state ?? {}) as ScreenState;

// The entry the app was loaded into has no state of its own, so the first Back
// out of the second tab would land on an entry that says nothing about which
// tab it was. Stamped once on mount.
export function markInitialTab(tab: string) {
  history.replaceState({ ...state(), chumokuTab: tab }, '');
}

export function pushTab(tab: string) {
  history.pushState({ chumokuTab: tab }, '');
}

export function tabFromState(e: PopStateEvent): string | null {
  return (e.state as ScreenState | null)?.chumokuTab ?? null;
}

// A view that sits on top of a tab and can be dismissed.
//
// While it is open it owns a history entry, so Back closes it instead of
// leaving the tab. Closing it any other way - the Back link, picking something
// else - spends that entry, or every dismissed view would leave a press of Back
// that does nothing.
export function useBackLayer(open: boolean, close: () => void) {
  const pushed = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (open && !pushed.current) {
      pushed.current = true;
      history.pushState({ chumokuLayer: Date.now() }, '');
    } else if (!open && pushed.current) {
      pushed.current = false;
      history.back();
    }
  }, [open]);

  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Switching tabs unmounts the whole screen without the close path ever
  // running, and the entry it pushed would outlive the view it belonged to.
  useEffect(() => () => {
    if (pushed.current) {
      pushed.current = false;
      history.back();
    }
  }, []);
}
