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

const THRESHOLD = 90;   // px of drag that counts as a decision
const FLY_MS = 220;

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
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const moved = useRef(false);

  const decide = (dir: 1 | -1) => {
    if (!top || flying?.id === top.video_id) return;
    setFlying({ id: top.video_id, dir });
    setDx(0);
    const idea = top;
    window.setTimeout(() => (dir === 1 ? onSave(idea) : onDismiss(idea)), FLY_MS);
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

  const flight = flying?.id === top.video_id ? flying.dir * 640 : 0;
  const offset = flight || dx;
  const lean = Math.max(-1, Math.min(1, offset / THRESHOLD));

  // Two cards, keyed by video: when the top one leaves, the one underneath is
  // the same element moving up, cover already loaded, rather than a new one.
  const deck = [top, next].filter((i): i is CompetitorIdea => !!i);

  return (
    <div className="daily">
      <div className="daily__head">
        <span>Today</span>
        <span className="daily__count">{seen + 1} of {total}</span>
      </div>

      <div className="daily__deck">
        {[...deck].reverse().map(idea => {
          const isTop = idea.video_id === top.video_id;
          if (!isTop) {
            return (
              <div key={idea.video_id} className="daily__card daily__card--under" aria-hidden="true">
                <div className="daily__media"><ShortThumb videoId={idea.video_id} eager /></div>
                <div className="daily__body"><p className="daily__pitch">{idea.pitch ?? idea.video_title}</p></div>
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
                transform: `translateX(${offset}px) rotate(${offset / 22}deg)`,
                transition: dragging ? 'none' : `transform ${FLY_MS}ms ease-out, opacity ${FLY_MS}ms ease-out`,
              }}
              onPointerDown={e => {
                start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
                moved.current = false;
                setDragging(true);
              }}
              onPointerMove={e => {
                if (!start.current || start.current.id !== e.pointerId) return;
                const ddx = e.clientX - start.current.x;
                const ddy = e.clientY - start.current.y;
                // A vertical drag is the page scrolling, not a swipe.
                if (!moved.current && Math.abs(ddy) > Math.abs(ddx) && Math.abs(ddy) > 8) {
                  start.current = null; setDragging(false); setDx(0); return;
                }
                if (Math.abs(ddx) > 5 && !moved.current) {
                  moved.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
                if (moved.current) setDx(ddx);
              }}
              onPointerUp={() => {
                const wasDrag = moved.current;
                start.current = null;
                setDragging(false);
                if (!wasDrag) { onOpen(top); return; }
                if (dx > THRESHOLD) decide(1);
                else if (dx < -THRESHOLD) decide(-1);
                else setDx(0);
              }}
              onPointerCancel={() => { start.current = null; setDragging(false); setDx(0); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(top); } }}
            >
              <div className="daily__media">
                <ShortThumb videoId={top.video_id} eager />
                {top.outlier_score != null && top.outlier_score < 1000 && (
                  <span className="idea-card__mult">{top.outlier_score}×</span>
                )}
                <span className="daily__stamp daily__stamp--keep" style={{ opacity: Math.max(0, lean) }}>Save</span>
                <span className="daily__stamp daily__stamp--skip" style={{ opacity: Math.max(0, -lean) }}>Skip</span>
              </div>
              <div className="daily__body">
                <p className="daily__pitch">{top.pitch ?? top.video_title}</p>
                <p className="idea-card__meta">
                  {top.fit === 'yes' && <><span className="idea-card__fit">Fits your channel</span> · </>}
                  {[top.channel_name, top.video_views != null ? formatViews(top.video_views) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
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
