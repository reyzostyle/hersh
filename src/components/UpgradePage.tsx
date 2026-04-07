import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Zap, Check, Loader2, BarChart2, RefreshCw } from 'lucide-react';

interface UsageData {
  plan: string;
  analysesUsed: number;
  analysesLimit: number;
  canAnalyze: boolean;
}

const PRO_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_PRICE_ID;
const AGENCY_PRICE_ID = import.meta.env.VITE_STRIPE_AGENCY_PRICE_ID;

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    analyses: '3 total',
    analysesNum: 3,
    priceId: null,
    features: [
      '3 lifetime analyses',
      'Basic hook analysis',
      'Hook ideas & weak spots',
    ],
    cta: 'Current Plan',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$8',
    period: '/month',
    analyses: '30/month',
    analysesNum: 30,
    priceId: PRO_PRICE_ID,
    features: [
      '30 analyses per month',
      'Script-based advanced analysis',
      'Hook ideas & weak spots',
      'Channel profile context',
    ],
    cta: 'Upgrade to Pro',
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$19',
    period: '/month',
    analyses: '200/month',
    analysesNum: 200,
    priceId: AGENCY_PRICE_ID,
    features: [
      '200 analyses per month',
      'Script-based advanced analysis',
      'Hook ideas & weak spots',
      'Channel profile context',
      'Priority support',
    ],
    cta: 'Upgrade to Agency',
  },
];

export function UpgradePage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    setLoadingUsage(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-usage`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user?.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load usage');
      setUsage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setCheckingOut(planId);
    setError('');
    const priceId = planId === 'pro' ? PRO_PRICE_ID : AGENCY_PRICE_ID;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user?.id, priceId, plan: planId }),
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
  const usagePercent = usage ? Math.min((usage.analysesUsed / usage.analysesLimit) * 100, 100) : 0;

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 py-5 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-1">Plans & Billing</h1>
        <p className="text-sm text-gray-500">Manage your subscription and analysis usage</p>
      </div>

      <div className="px-6 py-6 max-w-4xl">
        {error && (
          <div className="mb-6 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="mb-8 p-5 bg-[#1A1A1A] border border-gray-800 rounded-xl">
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
                <span className="text-sm text-gray-500 capitalize">
                  {currentPlan} plan
                  {currentPlan !== 'free' && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-[#0EA4E9]/15 text-[#0EA4E9] rounded-full">
                      Active
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-[#0EA4E9]'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">
                {currentPlan === 'free'
                  ? `${usage.analysesLimit - usage.analysesUsed} analyses remaining (lifetime)`
                  : `${usage.analysesLimit - usage.analysesUsed} analyses remaining this month`}
              </p>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => {
            const isCurrent = currentPlan === plan.id;
            const isHigher = (
              (plan.id === 'pro' && currentPlan === 'free') ||
              (plan.id === 'agency' && (currentPlan === 'free' || currentPlan === 'pro'))
            );

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col p-5 rounded-xl border transition-all ${
                  plan.id === 'pro'
                    ? 'border-[#0EA4E9]/50 bg-[#0EA4E9]/5'
                    : isCurrent
                    ? 'border-gray-600 bg-[#1A1A1A]'
                    : 'border-gray-800 bg-[#1A1A1A] hover:border-gray-700'
                }`}
              >
                {plan.id === 'pro' && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-[#0EA4E9] text-white text-xs font-semibold rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className={`w-4 h-4 ${plan.id === 'free' ? 'text-gray-500' : plan.id === 'pro' ? 'text-[#0EA4E9]' : 'text-amber-400'}`} />
                    <span className="text-white font-semibold">{plan.name}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-sm text-gray-500">{plan.period}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{plan.analyses} analyses</p>
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
                  <div className="w-full py-2.5 text-center text-sm font-medium text-gray-500 border border-gray-700 rounded-lg">
                    Current Plan
                  </div>
                ) : isHigher ? (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={checkingOut === plan.id}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      plan.id === 'pro'
                        ? 'bg-[#0EA4E9] text-white hover:bg-[#0EA4E9]/90'
                        : 'bg-amber-500 text-white hover:bg-amber-400'
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
                  <div className="w-full py-2.5 text-center text-sm font-medium text-gray-600 border border-gray-800 rounded-lg">
                    {plan.id === 'free' ? 'Downgrade' : plan.cta}
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
