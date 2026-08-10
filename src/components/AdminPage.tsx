import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

interface Stats {
  total_users: number;
  new_users_today: number;
  new_users_28d: number;
  active_users_28d: number;
  daily_signups: number[];
  plan_free: number;
  plan_plus: number;
  plan_pro: number;
  new_subs_today: number;
  new_subs_28d: number;
  cancels_28d: number;
  revenue_28d_cents: number;
  daily_subs: number[];
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 140, h = 44;
  const max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`);
  const line = points.join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11" preserveAspectRatio="none">
      <polygon points={area} fill={color} fillOpacity="0.12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function StatCard({ icon, label, value, sub, color, spark }: {
  icon: string; label: string; value: string; sub?: string; color: string; spark?: number[];
}) {
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base leading-none">{icon}</span>
            <span className="text-sm font-semibold" style={{ color }}>{label}</span>
          </div>
          {sub && <p className="text-xs text-gray-500 mb-1">{sub}</p>}
          <p className="text-3xl font-bold text-white">{value}</p>
        </div>
        {spark && (
          <div className="w-28 sm:w-36 flex-shrink-0">
            <Sparkline values={spark} color={color} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const token = await getSessionToken();
        const res = await fetchWithRetry('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/admin-stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setStats(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load stats');
      }
    })();
  }, [isAdmin]);

  // Not the admin: render nothing identifying — just a quiet dead end.
  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-600">Nothing here.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
        <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[#0EA4E9] animate-spin" />
      </div>
    );
  }

  const paying = stats.plan_plus + stats.plan_pro;
  const mrr = stats.plan_plus * 19 + stats.plan_pro * 29;
  const revenue28d = stats.revenue_28d_cents / 100;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 space-y-3 animate-fade-in-up">
      <div className="hidden sm:block mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Growth</h1>
        <p className="text-sm text-gray-500">Live numbers across every Hershy account. Only you can see this.</p>
      </div>

      <StatCard
        icon="📈"
        label="Active subscriptions"
        value={String(paying)}
        sub={`${stats.new_subs_today} new today · ${stats.new_subs_28d} in 28d · ${stats.cancels_28d} cancelled`}
        color="#F59E0B"
        spark={stats.daily_subs}
      />
      <StatCard
        icon="💰"
        label="Monthly recurring revenue"
        value={`$${mrr.toLocaleString()}`}
        sub={`Plus ${stats.plan_plus} × $19 · Pro ${stats.plan_pro} × $29`}
        color="#34D399"
      />
      <StatCard
        icon="💵"
        label="Revenue"
        value={`$${revenue28d.toLocaleString()}`}
        sub="Last 28 days"
        color="#34D399"
      />
      <StatCard
        icon="🧑‍🤝‍🧑"
        label="New signups"
        value={String(stats.new_users_28d)}
        sub={`${stats.new_users_today} today · Last 28 days`}
        color="#38BDF8"
        spark={stats.daily_signups}
      />
      <StatCard
        icon="👥"
        label="Active users"
        value={String(stats.active_users_28d)}
        sub="Signed in within the last 28 days"
        color="#38BDF8"
      />
      <StatCard
        icon="🌍"
        label="Total users"
        value={stats.total_users.toLocaleString()}
        sub={`${stats.plan_free} free · ${paying} paying`}
        color="#9CA3AF"
      />
    </div>
  );
}
