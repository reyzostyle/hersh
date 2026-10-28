import { useEffect, useId, useRef, useState } from 'react';
import { mmss, pctAt, type CurvePoint, type Drop } from '../lib/retention';

// A Short's retention curve as YouTube measured it: the share still watching
// at every second, the stretches where people left marked in the one colour
// that means loss, and a marker on the second being looked at. It is drawn at
// the pixel size of its box rather than scaled from a fixed viewBox, so the
// axis labels stay legible at phone width.

const LOSS = 'rgb(var(--danger-rgb))';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// The curve as points in seconds, with the first one pinned to 0:00 (YouTube's
// first point is at 1% of the video).
const pointsOf = (curve: CurvePoint[], duration: number) =>
  [{ s: 0, v: curve[0].w * 100 }, ...curve.map(p => ({ s: p.r * duration, v: p.w * 100 }))];

// One drop's stretch of the line, sampled finely so it sits exactly on the
// curve under it.
function stretch(curve: CurvePoint[], duration: number, d: Drop) {
  const out: { s: number; v: number }[] = [];
  for (let s = d.from_s; s < d.to_s; s += 0.2) out.push({ s, v: pctAt(curve, s, duration) });
  out.push({ s: d.to_s, v: pctAt(curve, d.to_s, duration) });
  return out;
}

const pathOf = (pts: { s: number; v: number }[], x: (s: number) => number, y: (v: number) => number) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

export function RetentionChart({ curve, duration, drops, at, onScrub, onPick, height = 220 }: {
  curve: CurvePoint[];
  duration: number;
  drops: Drop[];
  // The second marked: under the pointer, else where the video is.
  at: number | null;
  onScrub: (t: number | null) => void;
  onPick: (t: number) => void;
  height?: number;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const gradient = `ret-fill-${useId().replace(/:/g, '')}`;

  const pad = { l: 38, r: 8, t: 22, b: 24 };
  const W = Math.max(width, 220);
  const H = height;
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const peak = Math.max(100, ...curve.map(p => p.w * 100));
  const yMax = Math.max(100, Math.ceil((peak + 4) / 25) * 25);
  const x = (s: number) => pad.l + (s / duration) * pw;
  const y = (v: number) => pad.t + (1 - Math.min(v, yMax) / yMax) * ph;

  const pts = pointsOf(curve, duration);
  const line = pathOf(pts, x, y);
  const area = `${line}L${x(duration).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const yTicks = [0, 50, 100, 150, 200, 250, 300].filter(v => v <= yMax);
  const step = duration <= 20 ? 5 : duration <= 60 ? 10 : duration <= 120 ? 20 : 30;
  // The last tick gives way to the end label rather than touching it.
  const xTicks: number[] = [];
  for (let s = 0; s < duration && x(duration) - x(s) >= 46; s += step) xTicks.push(s);

  const secondAt = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(duration, Math.max(0, ((clientX - r.left - pad.l) / pw) * duration));
  };

  const biggest = drops[0];
  const label = `Retention curve. Starts at ${Math.round(pts[0].v)}% and ends at ${Math.round(pts[pts.length - 1].v)}%.${biggest ? ` Biggest drop ${mmss(biggest.from_s)} to ${mmss(biggest.to_s)}, ${biggest.from_pct}% to ${biggest.to_pct}%.` : ''}`;

  return (
    <div
      ref={box}
      className="relative w-full select-none cursor-crosshair"
      style={{ height: H, touchAction: 'pan-y' }}
      onPointerMove={e => onScrub(secondAt(e.clientX))}
      onPointerLeave={() => onScrub(null)}
      onClick={e => onPick(secondAt(e.clientX))}
    >
      {width > 0 && (
        <svg width={W} height={H} role="img" aria-label={label} className="block">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map(v => (
            <g key={v}>
              <line
                x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)}
                stroke={v === 100 ? 'var(--line-strong)' : 'var(--line)'}
                strokeDasharray={v === 100 ? '3 4' : undefined}
              />
              <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)" className="tabular-nums">{v}%</text>
            </g>
          ))}

          {drops.map(d => (
            <g key={d.from_s}>
              <rect x={x(d.from_s)} y={pad.t} width={Math.max(2, x(d.to_s) - x(d.from_s))} height={ph} fill={LOSS} fillOpacity="0.09" />
              <text x={(x(d.from_s) + x(d.to_s)) / 2} y={pad.t - 8} textAnchor="middle" fontSize="11" fontWeight="500" fill={LOSS} className="tabular-nums">
                {`−${d.lost}`}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="var(--text)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
          {drops.map(d => (
            <path key={d.from_s} d={pathOf(stretch(curve, duration, d), x, y)} fill="none" stroke={LOSS} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {xTicks.map(s => (
            <text key={s} x={x(s)} y={H - 6} textAnchor={s === 0 ? 'start' : 'middle'} fontSize="11" fill="var(--text-faint)" className="tabular-nums">{mmss(s)}</text>
          ))}
          <text x={x(duration)} y={H - 6} textAnchor="end" fontSize="11" fill="var(--text-faint)" className="tabular-nums">{mmss(duration)}</text>

          {at != null && (
            <g pointerEvents="none">
              <line x1={x(at)} x2={x(at)} y1={pad.t} y2={pad.t + ph} stroke="var(--text)" strokeOpacity="0.45" />
              <circle cx={x(at)} cy={y(pctAt(curve, at, duration))} r="4" fill="var(--text)" stroke="var(--bg-raised)" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

// The same curve at the size of a list row, so a column of Shorts can be read
// by shape at a glance: a cliff at the start, a slow leak, a fall at the end.
export function RetentionSpark({ curve, duration, drops, width = 88, height = 30 }: {
  curve: CurvePoint[];
  duration: number;
  drops: Drop[] | null;
  width?: number;
  height?: number;
}) {
  const peak = Math.max(100, ...curve.map(p => p.w * 100));
  const x = (s: number) => 1 + (s / duration) * (width - 2);
  const y = (v: number) => 2 + (1 - v / peak) * (height - 4);
  return (
    <svg width={width} height={height} aria-hidden="true" className="block flex-shrink-0">
      <line x1={0} x2={width} y1={y(100)} y2={y(100)} stroke="var(--line)" strokeDasharray="2 3" />
      <path d={pathOf(pointsOf(curve, duration), x, y)} fill="none" stroke="var(--text-muted)" strokeWidth="1.25" strokeLinejoin="round" />
      {(drops ?? []).map(d => (
        <path key={d.from_s} d={pathOf(stretch(curve, duration, d), x, y)} fill="none" stroke={LOSS} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}
