import { useState } from 'react';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { BoltOutlineIcon as Zap, RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { Check } from './BrandIcons';
import { ErrorNotice } from './ErrorNotice';
import { useUsage } from '../lib/useUsage';
import { PageHead } from './Page';

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
    <div className="sheet min-h-full max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-20">
        {/* The billing toggle lives in the header's action slot rather than in a
            centred block of its own. That block plus its margins pushed the
            plans 306px down the page, so on a laptop the cards ran past the
            fold and you had to scroll to see the price you came for. The slot
            already exists for exactly this and costs no vertical space. */}
        <div className="hidden lg:block">
          <PageHead
            eyebrow="Plans"
            title="Plans and billing"
            subtitle="Compare the plans and manage your subscription."
            action={
              <div className="flex flex-col items-end gap-1.5">
                <div className="seg">
                  {(['month', 'year'] as Interval[]).map(iv => (
                    <button key={iv} onClick={() => setBillingInterval(iv)} data-on={interval === iv}>
                      {iv === 'month' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
                {interval === 'year' && proYearlySavings > 0 && (
                  <p className="font-mono text-[11px]" style={{ color: 'var(--process)' }}>
                    save ${proYearlySavings.toFixed(2)}/yr on Pro, {proYearlyPercentOff}% off
                  </p>
                )}
              </div>
            }
          />
        </div>
      <div>
        {error && <ErrorNotice message={error} className="mb-6" />}

        {/* On a phone the header is hidden, so the toggle needs its own row. */}
        <div className="lg:hidden flex flex-col items-center gap-1.5 mb-6">
          <div className="seg">
            {(['month', 'year'] as Interval[]).map(iv => (
              <button key={iv} onClick={() => setBillingInterval(iv)} data-on={interval === iv}>
                {iv === 'month' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          {interval === 'year' && proYearlySavings > 0 && (
            <p className="font-mono text-[11px]" style={{ color: 'var(--process)' }}>
              save ${proYearlySavings.toFixed(2)}/yr on Pro, {proYearlyPercentOff}% off
            </p>
          )}
        </div>

        {/* Plans grid */}
        {/* Full width, so the cards start where the heading above them starts.
            They were capped at 672 inside an 896 container, which left the
            plans floating in the middle of a page whose text began further
            left - the single most visible spacing fault in the app. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                className={`relative flex flex-col p-5 rounded-xl motion-card ${((isPopular && isHigher) || isCurrent) ? 'glass-panel-accent' : 'glass-panel'}`}
                style={{ animationDelay: `${plans.indexOf(plan) * 80}ms` }}
              >
                {isPopular && !isCurrent && isHigher && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-[var(--accent)] text-[var(--on-accent)] text-xs font-semibold rounded-full">
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
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }} />
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
                        ? 'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent)]/90'
                        : 'bg-[var(--accent)]/60 text-[var(--on-accent)] hover:bg-[var(--accent)]/70'
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
