import { useEffect, useState } from 'react';

// Smooth red -> amber -> green ramp (nicer than a raw HSL sweep).
function scoreColor(pct: number): string {
  const stops = [
    { p: 0, c: [239, 68, 68] },   // red-500
    { p: 50, c: [245, 158, 11] }, // amber-500
    { p: 100, c: [34, 197, 94] }, // green-500
  ];
  const x = Math.max(0, Math.min(100, pct));
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i].p && x <= stops[i + 1].p) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const t = b.p === a.p ? 0 : (x - a.p) / (b.p - a.p);
  const ch = (i: number) => Math.round(a.c[i] + (b.c[i] - a.c[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/**
 * Animated circular score gauge (0-100).
 * Ring fills clockwise on mount; color goes red (low) -> green (high).
 * Legacy scores stored on the old 1-10 scale are normalized to 1-100.
 */
export function ScoreCircle({ score, size = 76, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const value = score <= 10 ? Math.round(score * 10) : Math.round(score);
  const clamped = Math.max(0, Math.min(100, value));

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setProgress(clamped), 60);
    return () => clearTimeout(t);
  }, [clamped]);

  const color = scoreColor(clamped);
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1), stroke 1.1s ease-out' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.3), lineHeight: 1 }}>{value}</span>
      </div>
    </div>
  );
}

const CRITERIA = [
  { key: 'hook', label: 'Hook', max: 30 },
  { key: 'retention', label: 'Retention', max: 25 },
  { key: 'payoff', label: 'Payoff', max: 25 },
  { key: 'delivery', label: 'Delivery', max: 20 },
] as const;

type Breakdown = { hook: number; retention: number; payoff: number; delivery: number };

/** The four scoring components shown as labelled progress bars. */
export function ScoreBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
      {CRITERIA.map(c => {
        const raw = (breakdown as Record<string, number>)[c.key] ?? 0;
        const val = Math.max(0, Math.min(c.max, Math.round(raw)));
        const pct = (val / c.max) * 100;
        const color = scoreColor(pct);
        return (
          <div key={c.key}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-gray-400">{c.label}</span>
              <span className="text-xs font-semibold text-white">
                {val}<span className="text-gray-600 font-normal">/{c.max}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: mounted ? `${pct}%` : '0%', background: color, transition: 'width 0.9s cubic-bezier(0.22,1,0.36,1)' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
