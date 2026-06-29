import { useEffect, useState } from 'react';

/**
 * Animated circular score gauge (0-100).
 * The ring fills clockwise on mount; color goes red (low) -> green (high).
 * Legacy scores stored on the old 1-10 scale are normalized to 1-100.
 */
export function ScoreCircle({ score, size = 76, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const value = score <= 10 ? Math.round(score * 10) : Math.round(score);
  const clamped = Math.max(0, Math.min(100, value));

  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  // Animate from 0 to the score after mount.
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setProgress(clamped), 60);
    return () => clearTimeout(t);
  }, [clamped]);

  // hue 0 = red, 120 = green
  const hue = Math.round((clamped / 100) * 120);
  const color = `hsl(${hue}, 78%, 48%)`;
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
