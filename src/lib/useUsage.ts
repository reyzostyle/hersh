import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from './supabase';

// Mirrors supabase/functions/_shared/credits.ts — kept in sync manually,
// same as the rest of this app's plan-limit constants (no shared package
// between edge functions and the client). Free's allowance is a ONE-TIME
// grant (see credits.ts's loadCreditStatus) — that's the entire free tier,
// no separate trial mechanism. See credits.ts for how these numbers were
// picked (worst-case $ budget, compressed real-cost ratios).
export const CREDIT_LIMITS: Record<string, number> = { free: 50, pro: 300, agency: 1000 };
export const CREDIT_COSTS = {
  video_analysis: 5,
  hook_check: 2,
  script_check: 3,
  competitor_idea: 1,
  competitor_outline: 1,
  competitor_script: 1,
} as const;

// DB value → display name
export const PLAN_DISPLAY: Record<string, string> = {
  free: 'Trial',
  pro: 'Plus',
  agency: 'Pro',
};

export interface UsageData {
  plan: string;
  creditsUsed: number;
  creditsLimit: number;
  canAnalyze: boolean;
}

// Shared between UpgradePage (needs current plan for the checkout grid) and
// UsagePage (needs the full numbers) so the quota math and query live in one
// place instead of drifting between two copies.
export function useUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data: tokenRow, error: dbError } = await supabase
        .from('user_tokens')
        .select('plan, credits_used, bonus_credits')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbError) throw dbError;

      const plan = tokenRow?.plan || 'free';
      const creditsUsed = tokenRow?.credits_used || 0;
      const creditsLimit = (CREDIT_LIMITS[plan] ?? CREDIT_LIMITS.free) + (tokenRow?.bonus_credits || 0);
      const canAnalyze = creditsUsed < creditsLimit;

      setUsage({ plan, creditsUsed, creditsLimit, canAnalyze });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) reload();
  }, [user?.id, reload]);

  return { usage, loading, error, reload };
}
