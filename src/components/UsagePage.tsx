import { useState } from 'react';
import { ChartSquareOutlineIcon as BarChart2, RefreshOutlineIcon as Loader2, RefreshOutlineIcon as RefreshCw, InfiniteOutlineIcon as InfinityIcon, AddOutlineIcon as Plus } from '@solar-icons/react';
import { ErrorNotice } from './ErrorNotice';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { useUsage, PLAN_DISPLAY, CREDIT_COSTS } from '../lib/useUsage';
import { PageHead } from './Page';

const PRICE_LIST: { label: string; cost: number }[] = [
  { label: 'Video analysis', cost: CREDIT_COSTS.video_analysis },
  { label: 'Hook check', cost: CREDIT_COSTS.hook_check },
  { label: 'Script check', cost: CREDIT_COSTS.script_check },
  { label: 'Follow-up message', cost: CREDIT_COSTS.chat_followup },
  { label: 'Competitor idea found', cost: CREDIT_COSTS.competitor_idea },
  { label: 'Competitor outline', cost: CREDIT_COSTS.competitor_outline },
  { label: 'Competitor script', cost: CREDIT_COSTS.competitor_script },
];

// Separate from the plan/upgrade page on purpose — a top-up is a one-time
// purchase on top of whatever the plan already grants, not another
// subscription tier, so it doesn't belong on the same pricing grid.
const CREDIT_PACK = { id: 'small', credits: 100, price: '$4.99' };

export function UsagePage() {
  const { usage, loading, error, reload } = useUsage();
  const [buyingCredits, setBuyingCredits] = useState(false);
  const [buyError, setBuyError] = useState('');

  const currentPlan = usage?.plan || 'free';
  const currentPlanDisplay = PLAN_DISPLAY[currentPlan] ?? currentPlan;
  const isFree = currentPlan === 'free';
  // Pro is marketed as unlimited — the real 1000/month fair-use cap (see
  // Terms) stays server-side and out of this dashboard so it doesn't
  // undercut the "unlimited" promise for the people paying for it. The
  // price list below stays visible either way — knowing what an action
  // costs isn't the same as knowing the hidden ceiling.
  const isUnlimitedPlan = currentPlan === 'agency';

  const percent = usage ? Math.min((usage.creditsUsed / usage.creditsLimit) * 100, 100) : 0;

  const handleBuyCredits = async () => {
    setBuyingCredits(true);
    setBuyError('');
    try {
      const token = await getSessionToken();
      if (!token) { setBuyError('Not authenticated'); return; }
      const res = await fetchWithRetry(
        'https://ezlousklksipvwuinpzq.supabase.co/functions/v1/create-credit-topup-session',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pack: CREDIT_PACK.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setBuyingCredits(false);
    }
  };

  return (
    <div className="sheet min-h-full max-w-2xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-20 animate-fade-in-up">
      <div className="hidden lg:block">
        <PageHead eyebrow="Usage" title="What you have left" subtitle="One credit balance across Analyze and Competitors." />
      </div>

      {error && <ErrorNotice message={error} className="mb-6" />}

      <div className="p-4 sm:p-5 rounded-xl motion-card animate-fade-in-up delay-100 glass-panel">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white flex-shrink-0">{isFree ? 'Credits' : 'Credits this month'}</span>
            {!loading && usage && (
              <span className="ml-1.5 flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                <span className="text-gray-600">·</span>
                <span className="truncate">{currentPlanDisplay} Plan</span>
                {currentPlan !== 'free' && (
                  <span className="text-[11px] px-2 py-0.5 bg-[var(--accent)]/15 text-[var(--accent)] rounded-full flex-shrink-0">Active</span>
                )}
              </span>
            )}
          </div>
          <button
            onClick={reload}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-gray-800 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading usage...
          </div>
        ) : usage ? (
          <>
            {isUnlimitedPlan ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600">No visible monthly cap on the Pro plan.</p>
                <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }}>
                  <InfinityIcon className="w-3 h-3" /> Unlimited
                </span>
              </div>
            ) : (
              <>
                <span className="text-3xl font-bold text-white leading-none">
                  {usage.creditsUsed}
                  <span className="text-lg text-gray-500 font-normal">/{usage.creditsLimit}</span>
                </span>
                <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-[var(--accent)]'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  {isFree
                    ? `${usage.creditsLimit - usage.creditsUsed} free credits left, one-time. Upgrade for a monthly refill.`
                    : `${usage.creditsLimit - usage.creditsUsed} credits remaining this month`}
                </p>
              </>
            )}

            {!isUnlimitedPlan && (
              <div className="mt-4 flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <p className="text-xs font-semibold text-gray-200">Need more this month?</p>
                  <p className="text-[11px] text-gray-500">{CREDIT_PACK.credits} credits for {CREDIT_PACK.price}, added on top, never expires.</p>
                </div>
                <button
                  onClick={handleBuyCredits}
                  disabled={buyingCredits}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex-shrink-0"
                  style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent-soft)' }}
                >
                  {buyingCredits ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Buy credits
                </button>
              </div>
            )}
            {buyError && <ErrorNotice message={buyError} className="mt-3" />}

            <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600 mb-2">What things cost</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {PRICE_LIST.map(row => (
                  <div key={row.label} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{row.label}</span>
                    <span className="text-gray-300 font-medium tabular-nums">{row.cost} cr</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
