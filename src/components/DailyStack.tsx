import { useEffect, useRef, useState } from 'react';
import { formatViews, type CompetitorIdea } from '../lib/competitors';
import { ShortThumb } from './ShortThumb';
import { Skeleton } from './Page';

// Today's drop as a stack you swipe through: right keeps it (Saved), left
// lets it go, a tap opens it. Arrow keys do the same on a desktop, and the
// buttons under the card are there for anyone who does not think to drag.
//
// The stack is finite on purpose. Seven, then "next ones at 9:00": the end of
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

const THRESHOLD = 100;      // px of drag that counts as a decision
const FLICK = 0.55;         // px/ms that counts as a decision from 30px on
const FLY_MS = 300;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const OUT = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

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
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<{ id: string; dir: 1 | -1; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);
  const last = useRef<{ x: number; t: number; vx: number }>({ x: 0, t: 0, vx: 0 });

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
        <div className="daily__head"><span>Today</span></div>
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
    <div className="daily">
      <div className="daily__head">
        <span>Today</span>
        <span className="daily__count">{seen + 1} of {total}</span>
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
                <CardFace idea={idea} />
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
                if (isFlying) return;
                start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
                last.current = { x: e.clientX, t: e.timeStamp, vx: 0 };
                moved.current = false;
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
                if (Math.abs(dx) > 5 && !moved.current) {
                  moved.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
                const dt = e.timeStamp - last.current.t;
                if (dt > 0) last.current = { x: e.clientX, t: e.timeStamp, vx: (e.clientX - last.current.x) / dt };
                if (moved.current) setDrag({ x: dx, y: dy });
              }}
              onPointerUp={e => {
                const wasDrag = moved.current;
                start.current = null;
                setDragging(false);
                if (!wasDrag) { onOpen(top); return; }
                // A stale velocity (finger rested before lifting) is not a flick.
                const vx = e.timeStamp - last.current.t < 80 ? last.current.vx : 0;
                const flick = Math.abs(drag.x) > 30 && Math.abs(vx) > FLICK && Math.sign(vx) === Math.sign(drag.x);
                if (drag.x > THRESHOLD || (flick && vx > 0)) decide(1, drag.y * 0.4);
                else if (drag.x < -THRESHOLD || (flick && vx < 0)) decide(-1, drag.y * 0.4);
                else setDrag({ x: 0, y: 0 });
              }}
              onPointerCancel={() => { start.current = null; setDragging(false); setDrag({ x: 0, y: 0 }); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(top); } }}
            >
              <CardFace idea={top} lean={lean} />
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
function CardFace({ idea, lean }: { idea: CompetitorIdea; lean?: number }) {
  return (
    <>
      <div className="daily__media">
        <ShortThumb videoId={idea.video_id} eager />
        {idea.outlier_score != null && idea.outlier_score < 1000 && (
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
          {idea.fit === 'yes' && <><span className="idea-card__fit">Fits your channel</span> · </>}
          {[idea.channel_name, idea.video_views != null ? formatViews(idea.video_views) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    </>
  );
}
