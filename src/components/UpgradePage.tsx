import { useState } from 'react';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Zap, Check, Loader2 } from 'lucide-react';
import { ErrorNotice } from './ErrorNotice';
import { useUsage } from '../lib/useUsage';

type Interval = 'month' | 'year';

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number | null; // billed monthly
  yearlyTotal: number | null;  // total charged once/year (not a monthly rate)
  quotas: string[];
  features: string[];
  cta: string;
}

// Actual Stripe prices (both plans' yearly total is $59.99 — annual
// commitment converges Plus and Pro to the same rate; Plus just has less
// room to fall since its monthly price is already low).
const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    yearlyTotal: 0,
    quotas: ['3 video analyses to start', '10 hook checks / month', '10 script checks / month'],
    features: [
      'Hook score & assessment',
      'Weak spot breakdown',
      'Hook ideas & rewrites',
      'Video file upload',
      'Channel profile context',
    ],
    cta: 'Current Plan',
  },
  {
    id: 'pro',
    name: 'Plus',
    monthlyPrice: 4.99,
    yearlyTotal: 59.99,
    quotas: ['30 video analyses / month', '30 hook checks / month', '30 script checks / month'],
    features: [
      'Everything in Free',
      'Hook score & assessment',
      'Weak spot breakdown',
      'Hook ideas & rewrites',
      'Channel profile context',
      'Retention insights on your videos',
    ],
    cta: 'Upgrade to Plus',
  },
  {
    id: 'agency',
    name: 'Pro',
    monthlyPrice: 9.99,
    yearlyTotal: 59.99,
    quotas: ['Unlimited video analyses', 'Unlimited hook checks', 'Unlimited script checks'],
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
  const [interval, setBillingInterval] = useState<Interval>('month');

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
              Save ${proYearlySavings.toFixed(2)}/yr on Pro, that's 50% off
            </p>
          )}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <span className="px-3 py-1 bg-[#0EA4E9] text-white text-xs font-semibold rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className={`w-4 h-4 ${plan.id === 'free' ? 'text-gray-500' : isPopular ? 'text-[#0EA4E9]' : 'text-[#0EA4E9]/70'}`} />
                    <span className="text-white font-semibold">{plan.name}</span>
                  </div>
                  {(() => {
                    const isYearly = interval === 'year';
                    const monthlyEquivalent = isYearly && plan.yearlyTotal != null ? plan.yearlyTotal / 12 : plan.monthlyPrice;
                    const displayPrice = monthlyEquivalent === 0 ? '$0' : monthlyEquivalent != null ? `$${monthlyEquivalent.toFixed(2)}` : '—';
                    const billedYearly = isYearly && plan.yearlyTotal != null && plan.yearlyTotal > 0
                      ? `$${plan.yearlyTotal.toFixed(2)} billed yearly`
                      : null;
                    return (
                      <>
                        <div className="flex items-baseline gap-1 select-none">
                          <span className="text-3xl font-bold text-white">{displayPrice}</span>
                          {plan.id !== 'free' && <span className="text-sm text-gray-500">/month</span>}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {plan.id === 'free' ? 'free forever' : billedYearly ?? 'billed monthly'}
                        </p>
                      </>
                    );
                  })()}
                  {/* Monthly quotas — the numbers people actually compare */}
                  <div className="mt-2.5 space-y-1.5">
                    {plan.quotas.map(q => (
                      <p key={q} className="flex items-center gap-2 text-[13px] font-semibold text-white">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: plan.id === 'free' ? 'rgba(255,255,255,0.35)' : '#0EA4E9' }} />
                        {q}
                      </p>
                    ))}
                  </div>
                </div>

                <ul className="flex-1 space-y-2 mb-5">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-400">
                      <Check className="w-4 h-4 text-[#0EA4E9] flex-shrink-0 mt-0.5" />
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
                        ? 'bg-[#0EA4E9] text-white hover:bg-[#0EA4E9]/90'
                        : 'bg-[#0EA4E9]/60 text-white hover:bg-[#0EA4E9]/70'
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
