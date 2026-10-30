import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatViews, isOwnIdea, ownIdeaLabel, type CompetitorIdea } from '../lib/competitors';
import { AiIdeaCover } from './AiIdeaCover';
import { ShortThumb } from './ShortThumb';
import { Skeleton } from './Page';

// Today's drop as a stack you swipe through: right keeps it (Saved), left
// lets it go, a tap opens it. Arrow keys do the same on a desktop, and the
// buttons under the card are there for anyone who does not think to drag.
//
// The stack is finite on purpose. Ten, then "next ones at 9:00": the end of
// the pile is what brings someone back tomorrow, which an endless feed never
// does.
//
// Motion, in the order it matters:
// - the card follows the finger in both axes and tilts with the drag;
// - the card underneath rises as you drag, so by the time the top one is gone
//   the next is already in place and simply becomes the top (same element,
//   cover already loaded);
// - a quick flick counts even short of the threshold;
// - let go early and it springs back with a little overshoot.
//
// The whole stack, buttons included, fits the window: the cover gives up
// height first (it is object-fit: cover, so it just crops tighter), down to
// MIN_MEDIA. Before, on a laptop the buttons sat below the fold (Ivan,
// 2026-10-27).

const THRESHOLD = 100;      // px of drag that counts as a decision
const FLICK = 0.55;         // px/ms that counts as a decision from 30px on
const FLY_MS = 300;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const OUT = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
const MIN_MEDIA = 180;      // px; below this the page scrolls instead
const BOTTOM_GAP = 20;      // px left under the buttons

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function DailyStack({ remaining, total, nextAt, loading, onSave, onDismiss, onOpen }: {
  remaining: CompetitorIdea[];
  total: number;
  nextAt: string | null;
  loading: boolean;
  onSave: (idea: CompetitorIdea) => void;
  onDismiss: (idea: CompetitorIdea) => void;
  onOpen: (idea: CompetitorIdea) => void;
}) {
  const top = remaining[0];
  const next = remaining[1];
  // Drag and flight belong to one card by id, so the card that rises to the
  // top never inherits the last one's offset.
  const [drag, setDragState] = useState({ x: 0, y: 0 });
  // The same offset, readable at once. Pointer moves are batched, so on a quick
  // flick the up event could read a render-old offset from state and spring
  // the card back instead of sending it (one of the "sometimes it doesn't
  // take" swipes).
  const dragRef = useRef({ x: 0, y: 0 });
  const setDrag = (d: { x: number; y: number }) => { dragRef.current = d; setDragState(d); };
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<{ id: string; dir: 1 | -1; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  const last = useRef<{ x: number; t: number; vx: number }>({ x: 0, t: 0, vx: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const [mediaH, setMediaH] = useState<number | null>(null);
  const [deckW, setDeckW] = useState<number | null>(null);

  // A new card on top is never mid-flight. Without this, a card that came
  // back (a save that failed and reloaded) kept the old flight: invisible,
  // and every decision on it refused.
  useEffect(() => { setFlying(null); }, [top?.video_id]);

  // Fit the stack to the window, measured rather than guessed: the page head
  // above it and the title under the cover both vary.
  useLayoutEffect(() => {
    const fit = () => {
      const root = rootRef.current;
      const media = root?.querySelector<HTMLElement>('.daily__card:not(.daily__card--under) .daily__media');
      if (!root || !media) return;
      const rootTop = root.getBoundingClientRect().top + window.scrollY;
      const rest = root.offsetHeight - media.offsetHeight;
      // The widest the deck may be (.daily's max-width), not what it is now.
      const maxW = Math.min(440, root.parentElement?.clientWidth ?? 440);
      // Below the lg breakpoint the app-style tab bar floats over the bottom.
      const gap = window.innerWidth < 1024 ? BOTTOM_GAP + 96 : BOTTOM_GAP;
      const room = window.innerHeight - rootTop - rest - gap;
      const h = Math.round(Math.max(MIN_MEDIA, Math.min(maxW * 1.25, room)));
      setMediaH(h);
      // Short on height, narrow the card with it, so it stays a portrait card
      // like the app's instead of a wide, flat strip on a laptop.
      setDeckW(Math.max(260, Math.min(maxW, Math.round(h / 1.25))));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [top?.video_id]);

  const decide = (dir: 1 | -1, y = 0) => {
    if (!top || flying?.id === top.video_id) return;
    setFlying({ id: top.video_id, dir, y });
    setDrag({ x: 0, y: 0 });
    const idea = top;
    window.setTimeout(() => (dir === 1 ? onSave(idea) : onDismiss(idea)), reducedMotion() ? 0 : FLY_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') decide(1);
      else if (e.key === 'ArrowLeft') decide(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) {
    return (
      <div className="daily" aria-busy="true">
        <Skeleton className="daily__card" style={{ aspectRatio: '4 / 6.1', borderRadius: 'var(--r-lg)' }} />
      </div>
    );
  }

  if (total === 0) return null;

  const seen = total - remaining.length;

  if (!top) {
    const at = nextAt ? new Date(nextAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '9:00';
    return (
      <div className="daily daily--done">
        <p className="daily__done">That's today's {total}. Next ones at {at}.</p>
      </div>
    );
  }

  const isFlying = flying?.id === top.video_id;
  const flyX = typeof window !== 'undefined' ? Math.max(window.innerWidth, 640) : 640;
  const x = isFlying ? flying!.dir * flyX : drag.x;
  const y = isFlying ? flying!.y + 40 : drag.y * 0.4;
  const rot = isFlying ? flying!.dir * 24 : drag.x / 18;
  const lean = Math.max(-1, Math.min(1, drag.x / THRESHOLD));
  // How far the card underneath has risen: all the way once the top one is
  // on its way out.
  const rise = isFlying ? 1 : Math.min(1, Math.abs(drag.x) / (THRESHOLD * 1.4));

  const motion = reducedMotion();
  const topTransition = dragging || motion
    ? 'none'
    : isFlying
      ? `transform ${FLY_MS}ms ${OUT}, opacity ${FLY_MS}ms ${OUT}`
      : `transform 420ms ${SPRING}`;
  const underTransition = dragging || motion ? 'none' : `transform 360ms ${OUT}, opacity 360ms ${OUT}`;

  // Two cards, keyed by video: when the top one leaves, the one underneath is
  // the same element moving up rather than a new one fading in.
  const deck = [top, next].filter((i): i is CompetitorIdea => !!i);

  return (
    <div className="daily" ref={rootRef} style={deckW ? { maxWidth: deckW } : undefined}>
      <div className="daily__head">
        <span className="daily__count ml-auto">{seen + 1} of {total}</span>
      </div>

      <div className="daily__deck">
        {[...deck].reverse().map(idea => {
          if (idea.video_id !== top.video_id) {
            return (
              <div
                key={idea.video_id}
                className="daily__card daily__card--under"
                aria-hidden="true"
                style={{
                  transform: `translateY(${12 * (1 - rise)}px) scale(${0.94 + 0.06 * rise})`,
                  opacity: 0.45 + 0.55 * rise,
                  transition: underTransition,
                }}
              >
                <CardFace idea={idea} mediaH={mediaH} />
              </div>
            );
          }
          return (
            <div
              key={idea.video_id}
              className="daily__card"
              role="button"
              tabIndex={0}
              aria-label={top.pitch ?? top.video_title ?? 'Idea'}
              style={{
                transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
                opacity: isFlying ? 0 : 1,
                transition: topTransition,
              }}
              onPointerDown={e => {
                if (isFlying || e.button > 0) return;
                start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
                last.current = { x: e.clientX, t: e.timeStamp, vx: 0 };
                moved.current = false;
                // Captured from the first moment, not after 5px: a quick drag
                // with a mouse used to leave the card before capture, and the
                // card then stopped following until the next click.
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(true);
              }}
              onPointerMove={e => {
                if (!start.current || start.current.id !== e.pointerId) return;
                const dx = e.clientX - start.current.x;
                const dy = e.clientY - start.current.y;
                // A vertical drag is the page scrolling, not a swipe.
                if (!moved.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
                  start.current = null; setDragging(false); setDrag({ x: 0, y: 0 }); return;
                }
                if (Math.abs(dx) > 5 && !moved.current) moved.current = true;
                const dt = e.timeStamp - last.current.t;
                if (dt > 0) last.current = { x: e.clientX, t: e.timeStamp, vx: (e.clientX - last.current.x) / dt };
                if (moved.current) setDrag({ x: dx, y: dy });
              }}
              onPointerUp={e => {
                // Released after the page took it as a scroll: neither a tap
                // nor a swipe. This used to open the card.
                if (!start.current || start.current.id !== e.pointerId) return;
                const wasDrag = moved.current;
                start.current = null;
                setDragging(false);
                if (!wasDrag) { onOpen(top); return; }
                const d = dragRef.current;
                // A stale velocity (finger rested before lifting) is not a flick.
                const vx = e.timeStamp - last.current.t < 80 ? last.current.vx : 0;
                const flick = Math.abs(d.x) > 30 && Math.abs(vx) > FLICK && Math.sign(vx) === Math.sign(d.x);
                if (d.x > THRESHOLD || (flick && vx > 0)) decide(1, d.y * 0.4);
                else if (d.x < -THRESHOLD || (flick && vx < 0)) decide(-1, d.y * 0.4);
                else setDrag({ x: 0, y: 0 });
              }}
              onPointerCancel={() => { start.current = null; setDragging(false); setDrag({ x: 0, y: 0 }); }}
              // Capture lost mid-drag (window switched, an alert): let go
              // cleanly instead of leaving the card stuck to the side.
              onLostPointerCapture={() => {
                if (!start.current) return;
                start.current = null; setDragging(false); setDrag({ x: 0, y: 0 });
              }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(top); } }}
            >
              <CardFace idea={top} lean={lean} mediaH={mediaH} />
            </div>
          );
        })}
      </div>

      <div className="daily__actions">
        <button className="daily__round" onClick={() => decide(-1)} aria-label="Skip">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button className="btn btn--text btn--sm" onClick={() => onOpen(top)}>Open</button>
        <button className="daily__round daily__round--keep" onClick={() => decide(1)} aria-label="Save">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.7 3.2 5 6.7 5c2 0 3.6 1.1 5.3 3 1.7-1.9 3.3-3 5.3-3 3.5 0 5.5 3.7 4.2 6.8C19.5 16.4 12 21 12 21z" /></svg>
        </button>
      </div>
    </div>
  );
}

// The same face on both cards, so promoting the under card changes nothing
// but its position. `lean` only exists on the top one.
function CardFace({ idea, lean, mediaH }: { idea: CompetitorIdea; lean?: number; mediaH: number | null }) {
  return (
    <>
      <div className="daily__media" style={mediaH ? { height: mediaH, aspectRatio: 'auto' } : undefined}>
        {isOwnIdea(idea) ? <AiIdeaCover idea={idea} /> : <ShortThumb videoId={idea.video_id} eager />}
        {!isOwnIdea(idea) && idea.outlier_score != null && idea.outlier_score < 1000 && (
          <span className="idea-card__mult">{idea.outlier_score}×</span>
        )}
        {lean !== undefined && (
          <>
            <span className="daily__stamp daily__stamp--keep" style={{ opacity: Math.max(0, lean), transform: `rotate(-8deg) scale(${0.85 + 0.15 * Math.max(0, lean)})` }}>Save</span>
            <span className="daily__stamp daily__stamp--skip" style={{ opacity: Math.max(0, -lean), transform: `rotate(8deg) scale(${0.85 + 0.15 * Math.max(0, -lean)})` }}>Skip</span>
          </>
        )}
      </div>
      <div className="daily__body">
        <p className="daily__pitch">{idea.pitch ?? idea.video_title}</p>
        <p className="idea-card__meta">
          {isOwnIdea(idea) ? ownIdeaLabel(idea) : <>
            {idea.fit === 'yes' && <><span className="idea-card__fit">Fits your channel</span> · </>}
            {[idea.channel_name, idea.video_views != null ? formatViews(idea.video_views) : null].filter(Boolean).join(' · ')}
          </>}
        </p>
      </div>
    </>
  );
}
