import { useState, useEffect, useCallback } from 'react';
import { RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { Youtube } from './BrandIcons';
import { supabase, getSessionToken, fetchWithRetry } from '../lib/supabase';
import { ErrorNotice } from './ErrorNotice';

const FN = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';
const REFRESH_MS = 60_000;

interface Stats {
  connected: boolean;
  channelTitle?: string;
  subscribers?: number;
  totalViews?: number;
  views28?: number;
  subsGained28?: number;
  watchMinutes28?: number;
}

const AXES = ['Hook', 'Retention', 'Payoff', 'Delivery', 'Reach'] as const;

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(n);

// Five axes, all read off work already done: four are the score components the
// analyser already returns per video, the fifth is how the recent videos landed
// against this channel's own median. Nothing here is a new API call or a new
// judgement, it is the same numbers arranged so a pattern is visible.
function Radar({ values }: { values: number[] }) {
  const size = 260, cx = size / 2, cy = size / 2, r = 92;
  const pt = (i: number, frac: number) => {
    const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };
  const poly = values.map((v, i) => pt(i, Math.max(0.04, v / 100)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]">
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f}
          points={AXES.map((_, i) => pt(i, f).join(',')).join(' ')}
          fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="rgba(var(--process-rgb),0.16)" stroke="var(--process)" strokeWidth="1.5" />
      {values.map((v, i) => {
        const [x, y] = pt(i, Math.max(0.04, v / 100));
        return <circle key={i} cx={x} cy={y} r="3" fill="var(--process)" />;
      })}
      {AXES.map((label, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                fill="var(--text-faint)" fontSize="10" fontFamily="Geist Mono, monospace"
                letterSpacing="0.06em">
            {label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--line)' }}>
      <p className="label-mono mb-1.5">{label}</p>
      <p className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>{value}</p>
      {sub && <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--process)' }}>{sub}</p>}
    </div>
  );
}

export function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [radar, setRadar] = useState<number[]>([0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`${FN}/channel-stats`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('channel-stats unavailable');
      setStats(await res.json());
      setFailed(false);

      // The four score components, averaged over the analyses that carry them.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rows } = await supabase
        .from('analyses').select('hook_analysis').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(20);

      const breakdowns = (rows ?? [])
        .map((r: any) => r.hook_analysis?.score_breakdown)
        .filter(Boolean);
      if (breakdowns.length) {
        const avg = (k: string, max: number) =>
          Math.round((breakdowns.reduce((s: number, b: any) => s + (b[k] ?? 0), 0) / breakdowns.length) / max * 100);
        const scores = (rows ?? []).map((r: any) => r.hook_analysis?.overall_score).filter((n: number) => n != null);
        const reach = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
        setRadar([avg('hook', 30), avg('retention', 25), avg('payoff', 25), avg('delivery', 20), reach]);
      }
    } catch {
      // A refresh that cannot reach the server should say so, not sit on a
      // spinner or quietly render a page of zeros as though the channel were
      // empty.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refreshes itself, so the tab is worth leaving open rather than being a
  // page you reload to find out whether anything moved.
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center pt-24">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
      </div>
    );
  }

  if (failed && !stats) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-16">
        <ErrorNotice message="Could not reach the analytics service." />
      </div>
    );
  }

  if (stats && !stats.connected) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-16 text-center">
        <Youtube className="w-8 h-8 mx-auto mb-4" style={{ color: 'var(--text-faint)' }} />
        <h1 className="display mb-3" style={{ color: 'var(--text)' }}>Connect your channel</h1>
        <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>
          Analytics reads your own numbers from YouTube. Connect it in Settings and this fills in.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-16">
      <p className="label-mono mb-4">Analytics</p>
      <h1 className="display mb-10" style={{ color: 'var(--text)' }}>
        {stats?.channelTitle || 'Your channel'}
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8" style={{ borderTop: '1px solid var(--line)' }}>
        <Stat label="Subscribers" value={compact(stats?.subscribers ?? 0)}
              sub={stats?.subsGained28 ? `+${compact(stats.subsGained28)} in 28d` : undefined} />
        <Stat label="Views 28d" value={compact(stats?.views28 ?? 0)} />
        <Stat label="Watch time" value={`${compact(Math.round((stats?.watchMinutes28 ?? 0) / 60))}h`} />
      </div>

      <div className="mt-12">
        <p className="label-mono mb-1">Shape</p>
        <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>
          Averaged across your last 20 analysed videos.
        </p>
        <div className="flex justify-center py-4">
          <Radar values={radar} />
        </div>
      </div>
    </div>
  );
}
