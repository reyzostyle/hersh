import { useState } from 'react';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Zap, Check, Loader2 } from 'lucide-react';
import { ErrorNotice } from './ErrorNotice';
import { useUsage } from '../lib/useUsage';

type Interval = 'month' | 'year';

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number | null;       // billed monthly
  yearlyTotal: number | null;        // total charged once/year (not a monthly rate)
  yearlyMonthlyPrice: number | null; // the "$X/month" figure to show when yearly is selected — an
                                      // authored number, not yearlyTotal/12 (which rounds to $5.00
                                      // and reads as inconsistent next to Plus's $4.99 monthly price)
  quotas: string[];
  features: string[];
  cta: string;
}

// Actual Stripe prices (2026-08-17 repricing). Plus's yearly total ($119.99)
// is exactly 12x its monthly rate rounded up 11c to end in .99 — no yearly
// discount, since Plus is already the cheap option. Pro's yearly total
// ($155.99) gets the SAME +11c rounding move applied to its $12.99/mo
// effective rate, which is a real ~35% discount off Pro's $19.99 monthly —
// pushes commitment toward the higher tier, which is where it matters most.
// Free isn't shown here on purpose — it's a real plan (new signups start on
// it), but listing it as a third card made this a long scroll on mobile
// before reaching an actual paid option. New users land on Free without
// needing to pick it off a pricing grid.
const plans: Plan[] = [
  {
    id: 'pro',
    name: 'Plus',
    monthlyPrice: 9.99,
    yearlyTotal: 119.99,
    yearlyMonthlyPrice: 9.99,
    // "& scripts" dropped 2026-08-23 along with competitor full-script
    // generation. "Script checks" above is Script Lab, a different tool that
    // reviews a script you wrote, and it stays.
    quotas: ['300 credits / month', 'Video, Hook & Script checks', 'Competitor ideas & outlines'],
    features: [
      'Hook score & assessment',
      'Weak spot breakdown',
      'Hook ideas & rewrites',
      'Channel profile context',
      'Retention insights on your videos',
      'Track up to 5 competitor channels',
    ],
    cta: 'Upgrade to Plus',
  },
  {
    id: 'agency',
    name: 'Pro',
    monthlyPrice: 19.99,
    yearlyTotal: 155.99,
    yearlyMonthlyPrice: 12.99,
    quotas: ['Unlimited credits', 'Same coverage as Plus', 'Highest fair-use ceiling'],
    features: [
      'Everything in Plus',
      'Highest monthly limits',
    ],
    cta: 'Upgrade to Pro',
  },
];

export function UpgradePage() {
  const { usage } = useUsage();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [interval, setBillingInterval] = useState<Interval>('year');

  const handleUpgrade = async (planId: string) => {
    setCheckingOut(planId);
    setError('');
    try {
      const token = await getSessionToken();
      if (!token) { setError('Not authenticated'); setCheckingOut(null); return; }
      const res = await fetchWithRetry(
        `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan: planId, interval }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create checkout session');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setCheckingOut(null);
    }
  };

  const currentPlan = usage?.plan || 'free';
  const proPlan = plans.find(p => p.id === 'agency')!;
  const proYearlySavings = proPlan.monthlyPrice != null && proPlan.yearlyTotal != null
    ? Math.round((proPlan.monthlyPrice * 12 - proPlan.yearlyTotal) * 100) / 100
    : 0;
  // Computed, not hardcoded — this drifted silently out of sync with the
  // actual discount once during the 2026-08-17 repricing (stayed "50% off"
  // after the real number had moved to ~35%).
  const proYearlyPercentOff = proPlan.monthlyPrice != null && proPlan.monthlyPrice > 0
    ? Math.round((proYearlySavings / (proPlan.monthlyPrice * 12)) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
        <div className="hidden lg:block mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Plans & Billing</h1>
          <p className="text-sm text-gray-500">Compare plans and manage your subscription</p>
        </div>
      <div>
        {error && <ErrorNotice message={error} className="mb-6" />}

        {/* Billing interval toggle */}
        <div className="flex flex-col items-center mb-6">
          <div className="inline-flex p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['month', 'year'] as Interval[]).map(iv => (
              <button
                key={iv}
                onClick={() => setBillingInterval(iv)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  interval === iv ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'
                }`}
              >
                {iv === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          {interval === 'year' && proYearlySavings > 0 && (
            <p className="mt-2 text-xs font-medium" style={{ color: '#34D399' }}>
              Save ${proYearlySavings.toFixed(2)}/yr on Pro, that's {proYearlyPercentOff}% off
            </p>
          )}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {plans.map(plan => {
            const isCurrent = currentPlan === plan.id;
            const isHigher = (
              (plan.id === 'pro' && currentPlan === 'free') ||
              (plan.id === 'agency' && (currentPlan === 'free' || currentPlan === 'pro'))
            );
            const isPopular = plan.id === 'agency';

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col p-5 rounded-xl motion-card animate-fade-in-up ${((isPopular && isHigher) || isCurrent) ? 'glass-panel-accent' : 'glass-panel'}`}
                style={{ animationDelay: `${plans.indexOf(plan) * 80}ms` }}
              >
                {isPopular && !isCurrent && isHigher && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-[var(--accent)] text-white text-xs font-semibold rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className={`w-4 h-4 ${isPopular ? 'text-[var(--accent)]' : 'text-[var(--accent)]/70'}`} />
                    <span className="text-white font-semibold">{plan.name}</span>
                  </div>
                  {(() => {
                    const isYearly = interval === 'year';
                    const displayPrice = (isYearly ? plan.yearlyMonthlyPrice : plan.monthlyPrice) ?? null;
                    const billedYearly = isYearly && plan.yearlyTotal != null
                      ? `$${plan.yearlyTotal.toFixed(2)} billed yearly`
                      : null;
                    // Only show a struck-through "was" price when yearly billing
                    // actually undercuts the monthly rate (Plus doesn't).
                    const showWasPrice = isYearly && plan.monthlyPrice != null && displayPrice != null && plan.monthlyPrice > displayPrice;
                    return (
                      <>
                        <div className="flex items-baseline gap-1.5 select-none">
                          {showWasPrice && (
                            <span className="text-lg text-gray-600 line-through">${plan.monthlyPrice!.toFixed(2)}</span>
                          )}
                          <span className="text-3xl font-bold text-white">{displayPrice != null ? `$${displayPrice.toFixed(2)}` : '—'}</span>
                          <span className="text-sm text-gray-500">/month</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {billedYearly ?? 'billed monthly'}
                        </p>
                      </>
                    );
                  })()}
                  {/* Monthly quotas — the numbers people actually compare */}
                  <div className="mt-2.5 space-y-1.5">
                    {plan.quotas.map(q => (
                      <p key={q} className="flex items-center gap-2 text-[13px] font-semibold text-white">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                        {q}
                      </p>
                    ))}
                  </div>
                </div>

                <ul className="flex-1 space-y-2 mb-5">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-400">
                      <Check className="w-4 h-4 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-2.5 text-center text-sm font-medium text-gray-500 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                    Current Plan
                  </div>
                ) : isHigher ? (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={checkingOut === plan.id}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isPopular
                        ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90'
                        : 'bg-[var(--accent)]/60 text-white hover:bg-[var(--accent)]/70'
                    }`}
                  >
                    {checkingOut === plan.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    {checkingOut === plan.id ? 'Redirecting...' : plan.cta}
                  </button>
                ) : (
                  <div className="w-full py-2.5 text-center text-sm font-medium text-gray-600 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    Downgrade
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-gray-600 text-center">
          Payments are processed securely by Stripe. Cancel anytime from your billing portal.
        </p>
      </div>
    </div>
  );
}
