import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from './supabase';

export const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 30, agency: 100 };
export const HOOK_LIMITS: Record<string, number> = { free: 10, pro: 30, agency: 100 };
export const SCRIPT_ANALYSIS_LIMITS: Record<string, number> = { free: 10, pro: 30, agency: 100 };

// DB value → display name
export const PLAN_DISPLAY: Record<string, string> = {
  free: 'Trial',
  pro: 'Plus',
  agency: 'Pro',
};

export interface UsageData {
  plan: string;
  analysesUsed: number;
  analysesLimit: number;
  hooksUsed: number;
  hooksLimit: number;
  scriptAnalysesUsed: number;
  scriptAnalysesLimit: number;
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
        .select('plan, analyses_used, analyses_reset_at, hooks_used, hooks_reset_at, bonus_analyses, bonus_hooks, script_analyses_used, script_analyses_reset_at, bonus_script_analyses')
        .eq('user_id', user.id)
        .maybeSingle();

      if (dbError) throw dbError;

      const plan = tokenRow?.plan || 'free';
      const analysesUsed = tokenRow?.analyses_used || 0;
      const analysesLimit = (PLAN_LIMITS[plan] ?? 3) + (tokenRow?.bonus_analyses || 0);
      const hooksUsed = tokenRow?.hooks_used || 0;
      const hooksLimit = (HOOK_LIMITS[plan] ?? 10) + (tokenRow?.bonus_hooks || 0);
      const scriptAnalysesUsed = tokenRow?.script_analyses_used || 0;
      const scriptAnalysesLimit = (SCRIPT_ANALYSIS_LIMITS[plan] ?? 10) + (tokenRow?.bonus_script_analyses || 0);
      const canAnalyze = analysesUsed < analysesLimit;

      setUsage({ plan, analysesUsed, analysesLimit, hooksUsed, hooksLimit, scriptAnalysesUsed, scriptAnalysesLimit, canAnalyze });
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
