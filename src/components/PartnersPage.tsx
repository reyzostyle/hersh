import { useState, useEffect, useCallback } from 'react';
import {
  CopyOutlineIcon as Copy, UsersGroupRoundedOutlineIcon as Users,
  GraphUpOutlineIcon as TrendingUp, DollarOutlineIcon as DollarSign,
  RefreshOutlineIcon as Loader2, ClockCircleOutlineIcon as Clock,
  WalletOutlineIcon as Wallet, LinkOutlineIcon as Link,
} from '@solar-icons/react';
import { Check } from './BrandIcons';
import { useAuth } from '../contexts/AuthContext';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Page, PageHead, Panel, Section, Loading } from './Page';
import { ErrorNotice } from './ErrorNotice';

const FN_BASE = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

// Live figures without a reload. Same interval and the same reasoning as the
// Analytics tab: a page about money that only updates when you remember to
// refresh it is a page you do not trust.
const REFRESH_MS = 45_000;

export interface PartnerStats {
  id: string;
  code: string;
  partner_name: string;
  commission_percent: number;
  active: boolean;
  created_at: string;
  signups: number;
  conversions: number;
  total_commission_cents: number;
  owner_user_id?: string;
  pending_cents?: number;
  available_cents?: number;
  paid_out_cents?: number;
  can_withdraw?: boolean;
  min_payout_cents?: number;
  payout_method?: string | null;
  payout_details?: string | null;
  payout_in_credits?: boolean;
}

export const money = (cents?: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;

// Affiliate looks the same for every account, the admin's included. Managing
// other people's partner codes is a different job on a different screen
// (PartnersAdminPage), reached by a code in Settings.
export function PartnersPage() {
  const { user } = useAuth();
  return <PartnerSide userId={user?.id} />;
}

function PartnerSide({ userId }: { userId?: string }) {
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`${FN_BASE}/referral-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setStats(null); return; }
      setStats((await res.json()).partner || null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (loading) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }

  return stats
    ? <Dashboard stats={stats} onChanged={load} />
    : <Pitch onClaimed={load} />;
}

// ─── Screen one: the pitch ───────────────────────────────────────────────────
// Someone without a link has not decided yet, so this page argues for the
// programme before it asks for anything. It used to be a single small card that
// went straight to "pick a name", which asks for a commitment from a reader who
// has not been told what they get.

const STEPS = [
  { n: '01', t: 'Take your link', d: 'Pick the name that goes in it. Yours in one click, no application to fill in.' },
  { n: '02', t: 'Share it', d: 'In a video description, a newsletter, a pinned comment. Anywhere your audience already is.' },
  { n: '03', t: 'They sign up and subscribe', d: 'They get 20 credits free first, so nobody has to gamble on a card to try it.' },
  { n: '04', t: 'You get paid every month', d: 'Not once. Every month they stay, for their first twelve.' },
];

const BLURB = `I use Hershy to work out why my shorts land or don't. It watches the video and tells you what to fix, and it pulls the shorts already beating their own channel so you have something proven to build on. 20 free credits, no card: `;

function Pitch({ onClaimed }: { onClaimed: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <Page className="animate-tab-in">
      <PageHead
        eyebrow="Affiliate"
        title="Earn 30% of everyone you bring"
        subtitle="Share your link. When someone subscribes through it, you keep 30% of everything they pay for their first twelve months."
      />

      <Section label="How it works" className="mt-0">
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {STEPS.map(s => (
            <div key={s.n} className="flex items-start gap-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="font-mono text-[11px] pt-1 w-6 flex-shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium mb-1" style={{ color: 'var(--text)' }}>{s.t}</p>
                <p className="text-[13px] leading-relaxed text-balance" style={{ color: 'var(--text-muted)' }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        label="What your audience gets"
        note="Twenty credits, no card asked for. Which means you are recommending something they can try, not something they have to buy first."
      >
        <Panel>
          <p className="label-mono mb-3">Copy this into a description</p>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>
            {BLURB}<span className="font-mono" style={{ color: 'var(--text-muted)' }}>hershymedia.com/?ref=yourname</span>
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${BLURB}hershymedia.com/?ref=yourname`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="chip mt-4"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </Panel>
      </Section>

      <Section label="Your link looks like">
        <p className="font-mono text-[15px]" style={{ color: 'var(--text)' }}>
          hershymedia.com/?ref=<span style={{ color: 'var(--text-faint)' }}>yourname</span>
        </p>
      </Section>

      <Section label="The terms">
        {/* Plain and small. The hold and the minimum are not hidden - they are
            the second and third lines - but they are not in a warning box
            either, because they are ordinary terms and framing them as risks
            would be its own kind of dishonesty. */}
        <ul className="space-y-2 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <li>30% of net revenue for twelve months from each subscriber you bring.</li>
          <li>Earnings settle 30 days after the payment they came from, which is what covers refunds.</li>
          <li>Withdraw from $10, by PayPal. Or take it in credits, worth double the cash.</li>
          <li>Refunds and chargebacks are not counted.</li>
          <li>Referring yourself, coupon sites and ads on our brand terms are not eligible.</li>
        </ul>
      </Section>

      <Section label="Get your link">
        <ClaimLink onClaimed={onClaimed} />
      </Section>
    </Page>
  );
}

// Anyone signed in can take a link, so the programme is self-serve rather than
// something you have to ask us for.
function ClaimLink({ onClaimed }: { onClaimed: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const claim = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`${FN_BASE}/referral-stats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), self_serve: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not create that link'); return; }
      onClaimed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center flex-1 rounded-[var(--r-sm)] overflow-hidden"
             style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
          <span className="pl-3 pr-1 text-sm font-mono whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>?ref=</span>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && claim()}
            placeholder="yourname"
            className="flex-1 bg-transparent py-2.5 pr-4 text-sm font-mono outline-none min-w-0"
            style={{ color: 'var(--text)' }}
          />
        </div>
        <button
          onClick={claim}
          disabled={busy || !code.trim()}
          className="btn-primary px-5 py-2.5 text-sm font-medium rounded-[var(--r-sm)] disabled:opacity-40 whitespace-nowrap"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get my link'}
        </button>
      </div>
      {error && <p className="mt-3 text-[13px]" style={{ color: 'rgb(var(--danger-rgb))' }}>{error}</p>}
      <p className="mt-3 text-[12px]" style={{ color: 'var(--text-faint)' }}>
        3 to 24 characters, letters, numbers, dashes. One link per account, and it cannot be changed later.
      </p>
    </div>
  );
}

// ─── Screen two: the dashboard ───────────────────────────────────────────────

function Dashboard({ stats, onChanged }: { stats: PartnerStats; onChanged: () => void }) {
  // Built from the current origin so the link keeps working after a domain move.
  const refLink = `${window.location.origin}?ref=${stats.code}`;
  const [copied, setCopied] = useState(false);

  return (
    <Page className="animate-tab-in">
      <PageHead
        eyebrow="Affiliate"
        title="Your affiliate link"
        subtitle={`${stats.commission_percent}% of what your referrals pay, every month, for their first twelve.`}
      />

      <Panel className="flex items-center gap-3">
        <Link className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
        <p className="flex-1 min-w-0 font-mono text-[13px] truncate" style={{ color: 'var(--text)' }}>{refLink}</p>
        <button
          onClick={() => { navigator.clipboard.writeText(refLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--r-sm)] flex-shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </Panel>

      <Section label="Balance" className="mt-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Figure icon={<Wallet className="w-4 h-4" />} label="Available" value={money(stats.available_cents)} accent />
          <Figure icon={<Clock className="w-4 h-4" />} label="Settling" value={money(stats.pending_cents)} />
          <Figure icon={<DollarSign className="w-4 h-4" />} label="Earned" value={money(stats.total_commission_cents)} />
          <Figure icon={<Check className="w-4 h-4" />} label="Paid out" value={money(stats.paid_out_cents)} />
        </div>
        <p className="mt-4 text-[12px] text-balance" style={{ color: 'var(--text-faint)' }}>
          Earnings settle 30 days after the payment they came from, which covers refunds.
          Once settled you can withdraw from {money(stats.min_payout_cents ?? 1000)}, by PayPal.
        </p>
      </Section>

      <Section label="Traffic">
        <div className="grid grid-cols-2 gap-2.5">
          <Figure icon={<Users className="w-4 h-4" />} label="Signups" value={String(stats.signups)} />
          <Figure icon={<TrendingUp className="w-4 h-4" />} label="Conversions" value={String(stats.conversions)} />
        </div>
      </Section>

      <Section label="Getting paid">
        <PayoutSettings stats={stats} onSaved={onChanged} />
      </Section>
    </Page>
  );
}

function Figure({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string; accent?: boolean;
}) {
  return (
    <Panel className="min-w-0">
      <span className="[&>svg]:w-4 [&>svg]:h-4" style={{ color: accent ? 'var(--process)' : 'var(--text-faint)' }}>{icon}</span>
      <p className="label-mono mt-2 mb-1">{label}</p>
      <p className="text-[22px] leading-none font-semibold tracking-tight tabular-nums truncate"
         style={{ color: accent ? 'var(--process)' : 'var(--text)' }}>
        {value}
      </p>
    </Panel>
  );
}

// Where the money goes, plus the credits option: taking it in credits is worth
// double, which suits partners who use the product themselves.
function PayoutSettings({ stats, onSaved }: { stats: PartnerStats; onSaved: () => void }) {
  const [details, setDetails] = useState(stats.payout_details || '');
  const [inCredits, setInCredits] = useState(!!stats.payout_in_credits);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`${FN_BASE}/referral-stats`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_method: 'paypal', payout_details: details, payout_in_credits: inCredits }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not save that'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="Your PayPal email"
          className="flex-1 px-4 py-2.5 rounded-[var(--r-sm)] text-sm focus:outline-none"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text)' }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary px-4 py-2.5 text-sm font-medium rounded-[var(--r-sm)] disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : 'Save'}
        </button>
      </div>

      <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={inCredits}
          onChange={e => setInCredits(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span className="text-[12px] text-balance" style={{ color: 'var(--text-muted)' }}>
          Pay me in credits instead, worth double the cash amount.
        </span>
      </label>

      {error && <div className="mt-3"><ErrorNotice message={error} /></div>}
    </div>
  );
}
