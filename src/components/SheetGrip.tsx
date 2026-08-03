import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const isMobile = () => window.matchMedia('(max-width: 639px)').matches;

// Smoothly slide the sheet off the bottom, then run `done`.
// Kills the entrance animation first: `.animate-scale-in` uses fill-mode `both`,
// which otherwise keeps `transform` under animation control and blocks our
// inline translateY. A forced reflow makes the slide animate from its current
// position (0 or the drag offset) rather than jumping.
function slideOut(panel: HTMLElement, done: () => void) {
  panel.style.animation = 'none';
  panel.style.transition = 'none';
  panel.style.transform = panel.style.transform || 'translateY(0px)';
  void panel.offsetHeight; // reflow: register the starting transform
  // Fast start (ease-out): the sheet reacts instantly to the gesture. An
  // ease-in here reads as input lag because the first frames barely move.
  panel.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.8, 0.4, 1)';
  panel.style.transform = 'translateY(110%)';
  setTimeout(done, 190);
}

/**
 * Shared dismiss for bottom-sheet modals: on mobile the sheet slides down
 * smoothly before unmounting; on sm+ (centered dialog) it closes instantly.
 * Attach `panelRef` to the sheet panel element and call `dismiss` from the
 * backdrop, X button, and Escape handler. Pass `panelRef` to <SheetGrip> too.
 */
export function useSheetDismiss(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const dismiss = useCallback(() => {
    const panel = panelRef.current;
    if (panel && isMobile()) {
      if (closing.current) return;
      closing.current = true;
      slideOut(panel, () => { closing.current = false; onClose(); });
    } else {
      onClose();
    }
  }, [onClose]);

  return { panelRef, dismiss };
}

/**
 * Bottom-sheet grab handle with interactive drag-to-dismiss. The sheet follows
 * the finger; release past the threshold slides it away, release earlier springs
 * it back. Tap also slides it down. Uses a native non-passive touch listener so
 * the drag can preventDefault and stop the page behind from scrolling.
 * Hidden on sm+ where modals are centered dialogs with an X button.
 */
export function SheetGrip({ onClose, panelRef }: { onClose: () => void; panelRef: RefObject<HTMLElement | null> }) {
  const gripRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const grip = gripRef.current;
    if (!grip) return;

    const onStart = (e: TouchEvent) => {
      startY.current = e.touches[0].clientY;
      dragged.current = false;
      const p = panelRef.current;
      if (p) { p.style.animation = 'none'; p.style.transition = 'none'; }
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = Math.max(0, e.touches[0].clientY - startY.current);
      if (dy > 2) { dragged.current = true; e.preventDefault(); } // stop the page scrolling
      const p = panelRef.current;
      if (p) p.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.changedTouches[0].clientY - startY.current;
      startY.current = null;
      const p = panelRef.current;
      if (!p) return;
      if (dy > 80) {
        slideOut(p, onClose);
      } else {
        p.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
        p.style.transform = 'translateY(0px)';
      }
    };

    grip.addEventListener('touchstart', onStart, { passive: true });
    grip.addEventListener('touchmove', onMove, { passive: false });
    grip.addEventListener('touchend', onEnd);
    grip.addEventListener('touchcancel', onEnd);
    return () => {
      grip.removeEventListener('touchstart', onStart);
      grip.removeEventListener('touchmove', onMove);
      grip.removeEventListener('touchend', onEnd);
      grip.removeEventListener('touchcancel', onEnd);
    };
  }, [onClose, panelRef]);

  const handleTap = () => {
    if (dragged.current) return;
    const p = panelRef.current;
    if (p) slideOut(p, onClose);
    else onClose();
  };

  return (
    // Zero-height: the pill and its touch target overlay the header row that
    // follows, so the grip sits on the same line as the back arrow / X.
    <div className="sm:hidden relative flex-shrink-0 h-0">
      {/* Visible pill, vertically centered on the header buttons (~22px) */}
      <div className="absolute top-[19px] left-1/2 -translate-x-1/2 w-9 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.25)' }} />
      {/* Enlarged invisible touch target (z-20 so it wins over the header),
          inset from the sides so the corner buttons stay tappable. */}
      <div
        ref={gripRef}
        onClick={handleTap}
        className="absolute left-16 right-16 top-0 h-11 z-20"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
