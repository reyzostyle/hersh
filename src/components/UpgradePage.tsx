import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, getSessionToken } from '../lib/supabase';
import { Zap, Check, Loader2, BarChart2, RefreshCw } from 'lucide-react';

const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 100 };

interface UsageData {
  plan: string;
  analysesUsed: number;
  analysesLimit: number;
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
    analyses: '10 hook checks / mo',
    priceId: null,
    features: [
      '10 hook checks every month',
      '3 video analyses to start',
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
    price: '$29',
    period: '/month',
    analyses: '30 analyses / month',
    priceId: PLUS_PRICE_ID,
    features: [
      '30 hook analyses / month',
      'Hook score & assessment',
      'Weak spot breakdown',
      'Hook ideas & rewrites',
      'Video file upload',
      'Channel profile context',
      'Competitor tracking',
      'AI idea extraction & outlines',
    ],
    cta: 'Upgrade to Plus',
  },
  {
    id: 'agency',
    name: 'Pro',
    price: '$49',
    period: '/month',
    analyses: '100 analyses / month',
    priceId: PRO_PRICE_ID,
    features: [
      '100 hook analyses / month',
      'Everything in Plus',
      'Channel analytics dashboard',
      'Deep channel analysis (5/mo)',
      'Competitor script writing',
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
        .select('plan, analyses_used, analyses_reset_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbError) throw dbError;

      const plan = tokenRow?.plan || 'free';
      const analysesUsed = tokenRow?.analyses_used || 0;
      const analysesLimit = PLAN_LIMITS[plan] ?? 3;
      const canAnalyze = analysesUsed < analysesLimit;

      setUsage({ plan, analysesUsed, analysesLimit, canAnalyze });
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

  return (
    <div className="max-w-4xl mx-auto px-6 pt-6 pb-12 animate-fade-in-up">
        <div className="hidden sm:block mb-6">
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
        <div className="mb-8 p-5 rounded-xl motion-card animate-fade-in-up delay-100" style={{ background: 'rgba(22,27,38,0.6)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px) saturate(160%)', WebkitBackdropFilter: 'blur(16px) saturate(160%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Usage this period</span>
            </div>
            <button
              onClick={loadUsage}
              disabled={loadingUsage}
              className="p-1.5 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
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
              <div className="flex items-end justify-between mb-2">
                <span className="text-3xl font-bold text-white">
                  {usage.analysesUsed}
                  <span className="text-lg text-gray-500 font-normal">/{usage.analysesLimit}</span>
                </span>
                <span className="text-sm text-gray-500">
                  {currentPlanDisplay} Plan
                  {currentPlan !== 'free' && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-[#0EA4E9]/15 text-[#0EA4E9] rounded-full">
                      Active
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
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
                className="relative flex flex-col p-5 rounded-xl motion-card animate-fade-in-up"
                style={{
                  animationDelay: `${plans.indexOf(plan) * 80}ms`,
                  background: (isPopular && isHigher) || isCurrent ? 'rgba(14,164,233,0.06)' : 'rgba(255,255,255,0.04)',
                  border: (isPopular && isHigher) || isCurrent ? '1px solid rgba(14,164,233,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
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
                  <p className="mt-1 text-xs text-gray-500">{plan.analyses}</p>
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
