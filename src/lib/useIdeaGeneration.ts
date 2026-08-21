import { useState } from 'react';
import { getSessionToken } from './supabase';
import { callFunction, type CompetitorIdea } from './competitors';

// Outline/script generation, shared by the drawer's analysis panel and the
// action button on each feed card. Both entry points have to handle credit
// exhaustion, the free-plan upgrade redirect and transport errors the same
// way, so the logic lives here rather than being written twice.
export function useIdeaGeneration(idea: CompetitorIdea, onUpdated: (updated: CompetitorIdea) => void) {
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [error, setError] = useState('');
  // Distinguishes "user hit their credit limit" (a plain, actionable message)
  // from an actual backend failure (routed through ErrorNotice) — both land
  // in the same `error` state, so the render needs to know which is which.
  const [errorIsPlanLimit, setErrorIsPlanLimit] = useState(false);

  const run = async (
    endpoint: string,
    setBusy: (v: boolean) => void
  ): Promise<boolean> => {
    setBusy(true);
    setError('');
    setErrorIsPlanLimit(false);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction(endpoint, token, { ideaId: idea.id });
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return false;
      }
      if (data.error === 'limit_reached') {
        setErrorIsPlanLimit(true);
        setError("You've used all your credits for this month.");
        return false;
      }
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      onUpdated(data.idea);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    generatingOutline,
    generatingScript,
    error,
    errorIsPlanLimit,
    generateOutline: () => run('generate-outline', setGeneratingOutline),
    generateScript: () => run('generate-competitor-script', setGeneratingScript),
  };
}
