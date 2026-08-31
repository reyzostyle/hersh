import { useState, useEffect, useCallback } from 'react';
import { RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { Youtube } from './BrandIcons';
import { supabase, getSessionToken, fetchWithRetry } from '../lib/supabase';
import { ErrorNotice } from './ErrorNotice';
import { Page, PageHead, Panel, Tile, Section, Empty } from './Page';

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

// What each axis is actually measuring, so the shape is readable without
// having to remember how the scorer weights its components.
const AXIS_NOTE: Record<string, string> = {
  Hook: 'First 3 seconds',
  Retention: 'The middle',
  Payoff: 'The ending',
  Delivery: 'Pace and edit',
  Reach: 'Overall score',
};

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(n);

// Five axes, all read off work already done: four are the score components the
// analyser already returns per video, the fifth is how the recent videos landed
// against this channel's own median. Nothing here is a new API call or a new
// judgement, it is the same numbers arranged so a pattern is visible.
//
// The viewBox is wider than it is tall on purpose. The plot is square, but
// RETENTION and DELIVERY sit outside it on the left and right, and at the old
// square viewBox both were sliced in half by the edge.
function Radar({ values }: { values: number[] }) {
  const W = 340, H = 250, cx = W / 2, cy = 118, r = 82;
  const pt = (i: number, frac: number) => {
    const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };
  const poly = values.map((v, i) => pt(i, Math.max(0.04, v / 100)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[340px]" role="img" aria-label="Score shape across five axes">
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
        const [x, y] = pt(i, 1.3);
        // Labels anchor away from the plot rather than always centring: a
        // centred RETENTION overhangs the right edge by half its width, which
        // is what was clipping it.
        const anchor = x > cx + 4 ? 'start' : x < cx - 4 ? 'end' : 'middle';
        return (
          <text key={label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle"
                fill="var(--text-faint)" fontSize="10" fontFamily="Geist Mono, monospace"
                letterSpacing="0.06em">
            {label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}

// The shape says where the channel is lopsided; this says by how much. A radar
// on its own is a picture you cannot read a number off, which is fine as the
// second thing on the screen and not fine as the only thing.
function AxisRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-4 py-2.5" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="w-28 flex-shrink-0">
        <p className="text-[13px] font-medium leading-tight" style={{ color: 'var(--text)' }}>{label}</p>
        <p className="text-[11px] leading-tight mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{AXIS_NOTE[label]}</p>
      </div>
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, value)}%`, background: 'var(--process)' }} />
      </div>
      <span className="font-mono text-[12px] w-8 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {value}
      </span>
    </div>
  );
}

export function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [radar, setRadar] = useState<number[]>([0, 0, 0, 0, 0]);
  const [sampleSize, setSampleSize] = useState(0);
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
      setSampleSize(breakdowns.length);
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
      <Page>
        <div className="flex justify-center pt-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
        </div>
      </Page>
    );
  }

  if (failed && !stats) {
    return (
      <Page>
        <PageHead eyebrow="Analytics" title="Your channel" />
        <ErrorNotice message="Could not reach the analytics service." />
      </Page>
    );
  }

  if (stats && !stats.connected) {
    return (
      <Page>
        <PageHead
          eyebrow="Analytics"
          title="Connect your channel"
          subtitle="Analytics reads your own numbers straight from YouTube. Connect it in Settings and this fills in."
        />
        <Empty icon={<Youtube className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
          Nothing to show until a channel is connected. It takes two clicks in Settings and reads only your own data.
        </Empty>
      </Page>
    );
  }

  return (
    <Page>
      <PageHead
        eyebrow="Analytics"
        title={stats?.channelTitle || 'Your channel'}
        subtitle="Your own numbers from YouTube, and the shape your last analysed videos came out at."
      />

      {/* Tiles, not bare hairlines. Numbers this important should sit on
          something, and a plate each is what keeps the row from reading as a
          fragment of a table. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Tile label="Subscribers" value={compact(stats?.subscribers ?? 0)}
              sub={stats?.subsGained28 ? `+${compact(stats.subsGained28)} in 28d` : undefined} />
        <Tile label="Views 28d" value={compact(stats?.views28 ?? 0)} />
        <Tile label="Watch time" value={`${compact(Math.round((stats?.watchMinutes28 ?? 0) / 60))}h`} />
        <Tile label="Total views" value={compact(stats?.totalViews ?? 0)} />
      </div>

      {failed && (
        <div className="mt-4">
          <ErrorNotice message="The last refresh did not come back. These numbers may be stale." />
        </div>
      )}

      <Section
        label="Shape"
        note={sampleSize
          ? `Averaged across your last ${sampleSize} analysed video${sampleSize === 1 ? '' : 's'}.`
          : 'Fills in once you have analysed a few videos.'}
      >
        {sampleSize === 0 ? (
          <Empty>Analyse a video and its score components land here, so you can see which part of your work is consistently the weak one.</Empty>
        ) : (
          <Panel>
            <div className="flex justify-center">
              <Radar values={radar} />
            </div>
            <div className="mt-4" style={{ borderTop: '1px solid var(--line)' }}>
              {AXES.map((label, i) => <AxisRow key={label} label={label} value={radar[i]} />)}
            </div>
          </Panel>
        )}
      </Section>
    </Page>
  );
}
