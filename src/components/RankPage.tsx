import { useEffect, useState } from 'react';
import { Loader2, Trophy, Flame, Link } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchRank, syncYouTubeIfStale, RankData, TIERS } from '../lib/rank';

const TIER_COLORS: Record<string, string> = {
  Iron: '#9CA3AF',
  Bronze: '#CD7F32',
  Silver: '#C0C4CE',
  Gold: '#F59E0B',
  Platinum: '#67E8F9',
  Diamond: '#38BDF8',
  Master: '#A78BFA',
  Viral: '#F43F5E',
};

const SEASON_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Pentagon radar, 5 axes 0-100. Axis order: top, then clockwise.
// Labels sit outside the pentagon with per-vertex anchors so long words
// (Consistency, Engagement) never clip at the viewBox edge or cover the chart.
function Radar({ values, labels }: { values: number[]; labels: string[] }) {
  const cx = 140, cy = 100, r = 70;
  const angles = [-90, -18, 54, 126, 198].map(a => (a * Math.PI) / 180);
  const px = (v: number, i: number) => cx + r * v * Math.cos(angles[i]);
  const py = (v: number, i: number) => cy + r * v * Math.sin(angles[i]);
  const pt = (v: number, i: number) => `${px(v, i)},${py(v, i)}`;
  const ring = (v: number) => angles.map((_, i) => pt(v, i)).join(' ');
  const labelProps: { x: number; y: number; anchor: string }[] = [
    { x: cx, y: cy - r - 12, anchor: 'middle' },
    { x: px(1, 1) + 8, y: py(1, 1) + 4, anchor: 'start' },
    { x: px(1, 2) + 4, y: py(1, 2) + 16, anchor: 'middle' },
    { x: px(1, 3) - 4, y: py(1, 3) + 16, anchor: 'middle' },
    { x: px(1, 4) - 8, y: py(1, 4) + 4, anchor: 'end' },
  ];
  return (
    <svg viewBox="0 0 280 186" className="w-full max-w-[300px] mx-auto">
      <polygon points={ring(1)} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <polygon points={ring(0.5)} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      {angles.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={px(1, i)} y2={py(1, i)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      <polygon
        points={values.map((v, i) => pt(Math.max(0.02, v / 100), i)).join(' ')}
        fill="rgba(14,164,233,0.22)"
        stroke="#0EA4E9"
        strokeWidth="1.5"
      />
      {values.map((v, i) => (
        <circle key={i} cx={px(Math.max(0.02, v / 100), i)} cy={py(Math.max(0.02, v / 100), i)} r="2.5" fill="#0EA4E9" />
      ))}
      {labels.map((l, i) => (
        <text key={l} x={labelProps[i].x} y={labelProps[i].y} textAnchor={labelProps[i].anchor} fontSize="10.5" fill="#6B7280">
          {l}
        </text>
      ))}
    </svg>
  );
}

function SourceRow({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-gray-300">{label}</span>
        <span className="text-sm font-semibold text-white">
          {value}<span className="text-gray-600 font-normal"> / {max}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: '#0EA4E9' }} />
      </div>
      {sub && <p className="mt-1 text-xs text-gray-600">{sub}</p>}
    </div>
  );
}

export function RankPage() {
  const { user } = useAuth();
  const [data, setData] = useState<RankData | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetchRank(user.id)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load rank'));
  }, [user?.id]);

  // Background refresh: pull fresh channel stats if the last sync is stale,
  // then silently re-fetch rank so Channel RP and the radar reflect it.
  // Doesn't block the initial render — retention lookups can take a while.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setSyncing(true);
    syncYouTubeIfStale(user.id)
      .then(synced => {
        if (cancelled) return;
        if (synced) return fetchRank(user.id).then(d => { if (!cancelled) setData(d); });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0EA4E9] animate-spin" />
      </div>
    );
  }

  const color = TIER_COLORS[data.tier] ?? '#9CA3AF';
  const monthName = SEASON_MONTHS[Number(data.season.split('-')[1]) - 1];
  const tierMin = TIERS.find(t => t.name === data.tier)?.min ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-2 sm:pt-6 pb-12 space-y-4 animate-fade-in-up">
      <div className="hidden sm:block mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Rank</h1>
        <p className="text-sm text-gray-500">Your creator rank this season. Earn RP by making better Shorts</p>
      </div>

      {/* ── Tier card ── */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-[11px] uppercase tracking-widest text-gray-500">Season · {monthName}</span>
          <span className="text-xs text-gray-500 flex items-center gap-1.5">
            {syncing && data.youtubeConnected && <Loader2 className="w-3 h-3 animate-spin" />}
            {data.daysLeft} {data.daysLeft === 1 ? 'day' : 'days'} left
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f`, border: `1px solid ${color}40` }}>
            {data.tier === 'Viral'
              ? <Flame className="w-8 h-8" style={{ color }} />
              : <Trophy className="w-8 h-8" style={{ color }} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold text-white leading-tight">
              {data.tier}{data.division ? ` ${data.division}` : ''}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {data.rp} RP
              {data.nextTierAt !== null && (
                <span className="text-gray-600"> · {data.nextTierAt - data.rp} RP to {TIERS.find(t => t.min === data.nextTierAt)?.name}</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${data.nextTierAt !== null ? Math.min(100, Math.max(2, ((data.rp - tierMin) / (data.nextTierAt - tierMin)) * 100)) : 100}%`,
              background: color,
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.rpBoostMultiplier > 1 && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
              ×{data.rpBoostMultiplier} RP boost active this season
            </span>
          )}
          {data.calibrationUsed < 3 && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(14,164,233,0.1)', color: '#38BDF8', border: '1px solid rgba(14,164,233,0.2)' }}>
              Calibration: {data.calibrationUsed}/3 videos · ×1.5 RP
            </span>
          )}
          {data.breakdown.carryover > 0 && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-gray-700/50 text-gray-400 border border-gray-600/40">
              +{data.breakdown.carryover} RP carried over
            </span>
          )}
        </div>
      </div>

      {/* ── Radar ── */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">Creator profile</p>
        <Radar
          values={[data.radar.hook, data.radar.retention, data.radar.engagement, data.radar.views, data.radar.consistency]}
          labels={['Hook', 'Retention', 'Engagement', 'Views', 'Consistency']}
        />
        {!data.youtubeConnected && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'settings' }))}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Link className="w-3.5 h-3.5" />
            Connect YouTube to power Retention, Engagement and Views
          </button>
        )}
      </div>

      {/* ── RP sources ── */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-5">
        <p className="text-[11px] uppercase tracking-widest text-gray-500">RP sources</p>
        <SourceRow
          label="Your videos"
          value={data.breakdown.own}
          max={600}
          sub={`${Math.min(10, data.ownVideosCounted)}/10 videos counted`}
        />
        <SourceRow
          label="Channel"
          value={data.breakdown.channel}
          max={300}
          sub={`Views ${data.breakdown.channelViews}/200 · Engagement ${data.breakdown.channelEngagement}/100`}
        />
        <SourceRow
          label="Learning"
          value={data.breakdown.learning}
          max={300}
          sub={`Analyzing others ${data.breakdown.learningOthers}/200 · Hook checks ${data.breakdown.learningHooks}/100`}
        />
      </div>
    </div>
  );
}
