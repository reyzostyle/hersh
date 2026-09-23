import { useState } from 'react';
import { RefreshOutlineIcon as Loader2, AddOutlineIcon as Plus } from '@solar-icons/react';
import { ErrorNotice } from './ErrorNotice';
import { FUNCTIONS_URL, getSessionToken, fetchWithRetry } from '../lib/supabase';
import { type useUsage } from '../lib/useUsage';

// The balance, inside Settings.
//
// It used to be a tab of its own, with a price list of seven actions under the
// number. Both were the wrong place for the information: nobody decides what to
// do next by opening a price list, and a sidebar slot next to the tools made
// credits look like something to manage. What an action costs is printed on the
// action itself - under the composer, on the Break it down and outline buttons -
// and this card only answers the one question left: how much is there.
//
// A top-up is a one-time purchase on top of the plan, not another tier, so it
// lives here and not on the pricing grid.
const CREDIT_PACK = { id: 'small', credits: 100, price: '$4.99' };

type Usage = ReturnType<typeof useUsage>['usage'];

export function creditsLeftLine(usage: Usage): string {
  if (!usage) return 'Your balance';
  // Pro is sold as unlimited. The real fair-use ceiling stays server-side, so
  // this never prints a number that undercuts the promise they paid for.
  if (usage.plan === 'agency') return 'Unlimited on Pro';
  const left = Math.max(0, usage.creditsLimit - usage.creditsUsed);
  return usage.plan === 'free' ? `${left} free credits left` : `${left} credits left this month`;
}

export function CreditsPanel({ usage }: { usage: Usage }) {
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');

  if (!usage) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</p>;

  const unlimited = usage.plan === 'agency';
  const isFree = usage.plan === 'free';
  const left = Math.max(0, usage.creditsLimit - usage.creditsUsed);
  const percent = Math.min((usage.creditsUsed / Math.max(1, usage.creditsLimit)) * 100, 100);

  const buy = async () => {
    setBuying(true);
    setBuyError('');
    try {
      const token = await getSessionToken();
      if (!token) { setBuyError('Not authenticated'); return; }
      const res = await fetchWithRetry(`${FUNCTIONS_URL}/create-credit-topup-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack: CREDIT_PACK.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setBuying(false);
    }
  };

  if (unlimited) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No monthly cap on Pro. Use it as much as you like.</p>;
  }

  return (
    <div>
      <p className="font-semibold leading-none" style={{ color: 'var(--text)', fontSize: 28, letterSpacing: '-0.02em' }}>
        {left}
        <span className="text-[14px] font-normal ml-1.5" style={{ color: 'var(--text-faint)' }}>credits left</span>
      </p>
      <div className="mt-3 w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
        <div className="h-full rounded-full transition-all duration-500"
             style={{ width: `${100 - percent}%`, background: percent >= 90 ? 'rgb(var(--danger-rgb))' : 'var(--text)' }} />
      </div>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>
        {isFree ? 'A one-time grant. Plans refill every month.' : 'Refills with your plan every month.'}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {CREDIT_PACK.credits} more for {CREDIT_PACK.price}, on top of your plan, never expire.
        </p>
        <button onClick={buy} disabled={buying} className="chip" data-on>
          {buying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Buy credits
        </button>
      </div>
      {buyError && <ErrorNotice message={buyError} className="mt-3" />}
    </div>
  );
}
