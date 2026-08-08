import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, getSessionToken } from '../lib/supabase';
import { Zap, Check, Loader2, BarChart2, RefreshCw } from 'lucide-react';

const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 100 };
const HOOK_LIMITS: Record<string, number> = { free: 10, pro: 50, agency: 200 };

interface UsageData {
  plan: string;
  analysesUsed: number;
  analysesLimit: number;
  hooksUsed: number;
  hooksLimit: number;
  canAnalyze: boolean;
}

const PLUS_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_PRICE_ID;
const PRO_PRICE_ID = import.meta.env.VITE_STRIPE_AGENCY_PRICE_ID;

// DB value → display name
const PLAN_DISPLAY: Record<string, string> = {
  free: 'Trial',
  pro: 'Plus',
  agency: 'Pro',
};

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'free forever',
    quotas: ['3 video analyses to start', '10 hook checks / month'],
    priceId: null,
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
    price: '$19',
    period: '/month',
    quotas: ['30 video analyses / month', '50 hook checks / month'],
    priceId: PLUS_PRICE_ID,
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
    price: '$29',
    period: '/month',
    quotas: ['100 video analyses / month', '200 hook checks / month'],
    priceId: PRO_PRICE_ID,
    features: [
      'Everything in Plus',
      'Highest monthly limits',
    ],
    cta: 'Upgrade to Pro',
  },
];

export function UpgradePage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) loadUsage();
  }, [user?.id]);

  const loadUsage = async () => {
    if (!user) return;
    setLoadingUsage(true);
    setError('');
    try {
      const { data: tokenRow, error: dbError } = await supabase
        .from('user_tokens')
        .select('plan, analyses_used, analyses_reset_at, hooks_used, hooks_reset_at, bonus_analyses, bonus_hooks')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbError) throw dbError;

      const plan = tokenRow?.plan || 'free';
      const analysesUsed = tokenRow?.analyses_used || 0;
      const analysesLimit = (PLAN_LIMITS[plan] ?? 3) + (tokenRow?.bonus_analyses || 0);
      const hooksUsed = tokenRow?.hooks_used || 0;
      const hooksLimit = (HOOK_LIMITS[plan] ?? 10) + (tokenRow?.bonus_hooks || 0);
      const canAnalyze = analysesUsed < analysesLimit;

      setUsage({ plan, analysesUsed, analysesLimit, hooksUsed, hooksLimit, canAnalyze });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setCheckingOut(planId);
    setError('');
    const priceId = planId === 'pro' ? PLUS_PRICE_ID : PRO_PRICE_ID;
    try {
      const token = await getSessionToken();
      if (!token) { setError('Not authenticated'); setCheckingOut(null); return; }
      const res = await fetch(
        `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ priceId, plan: planId }),
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
  const currentPlanDisplay = PLAN_DISPLAY[currentPlan] ?? currentPlan;
  const usagePercent = usage ? Math.min((usage.analysesUsed / usage.analysesLimit) * 100, 100) : 0;
  const hookPercent = usage ? Math.min((usage.hooksUsed / usage.hooksLimit) * 100, 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
        <div className="hidden lg:block mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Plans & Billing</h1>
          <p className="text-sm text-gray-500">Manage your subscription and analysis usage</p>
        </div>
      <div>
        {error && (
          <div className="mb-6 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Usage card */}
        <div className="mb-6 sm:mb-8 p-4 sm:p-5 rounded-xl motion-card animate-fade-in-up delay-100 glass-panel">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-white flex-shrink-0">Usage this period</span>
              {!loadingUsage && usage && (
                <span className="ml-1.5 flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
                  <span className="text-gray-600">·</span>
                  <span className="truncate">{currentPlanDisplay} Plan</span>
                  {currentPlan !== 'free' && (
                    <span className="text-[11px] px-2 py-0.5 bg-[#0EA4E9]/15 text-[#0EA4E9] rounded-full flex-shrink-0">Active</span>
                  )}
                </span>
              )}
            </div>
            <button
              onClick={loadUsage}
              disabled={loadingUsage}
              className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-gray-800 flex-shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUsage ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingUsage ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading usage...
            </div>
          ) : usage ? (
            <>
              {/* Video analyses */}
              <div className="mb-2">
                <span className="text-xs text-gray-500 mb-0.5 block">Video analyses</span>
                <span className="text-3xl font-bold text-white leading-none">
                  {usage.analysesUsed}
                  <span className="text-lg text-gray-500 font-normal">/{usage.analysesLimit}</span>
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-[#0EA4E9]'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">
                {usage.analysesLimit - usage.analysesUsed} analyses remaining
                {currentPlan !== 'free' && ' this month'}
              </p>

              {/* Hook checks (Hook Lab) */}
              <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="mb-2">
                  <span className="text-xs text-gray-500 mb-0.5 block">Hook checks</span>
                  <span className="text-3xl font-bold text-white leading-none">
                    {usage.hooksUsed}
                    <span className="text-lg text-gray-500 font-normal">/{usage.hooksLimit}</span>
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      hookPercent >= 90 ? 'bg-red-500' : hookPercent >= 70 ? 'bg-amber-500' : 'bg-[#0EA4E9]'
                    }`}
                    style={{ width: `${hookPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-600">
                  {usage.hooksLimit - usage.hooksUsed} hook checks remaining this month
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => {
            const isCurrent = currentPlan === plan.id;
            const isHigher = (
              (plan.id === 'pro' && currentPlan === 'free') ||
              (plan.id === 'agency' && (currentPlan === 'free' || currentPlan === 'pro'))
            );
            const isPopular = plan.id === 'pro';

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
                  <div className="flex items-baseline gap-1 select-none">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-sm text-gray-500">{plan.period}</span>
                  </div>
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
