import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Copy, Check, Users, TrendingUp, DollarSign, Loader2, Plus, RefreshCw, Trash2, Link, Handshake, Clock, Wallet } from 'lucide-react';

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

// No backdrop-filter: blur over the static app background caused Chromium
// ghost bands on sibling repaints; the blue underlay replaces its tint.
const glassCard: React.CSSProperties = {
  background:
    'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.04)), linear-gradient(180deg, rgba(14,80,133,0.05), rgba(14,80,133,0.03))',
  border: '1px solid rgba(255,255,255,0.08)',
};

interface PartnerStats {
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

const FN_BASE = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

export function PartnersPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
        <div className="hidden lg:block mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Partners</h1>
          <p className="text-sm text-gray-500 text-balance">{isAdmin ? 'Manage referral partners and track conversions' : 'Your referral stats and link'}</p>
        </div>
        {isAdmin ? <AdminView /> : <PartnerView userId={user?.id} />}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-2" style={glassCard}>
      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <span className="text-gray-400 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 transition-opacity" style={{ background: '#0EA4E9' }}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ── Partner view ────────────────────────────────────────────────────────────
function PartnerView({ userId }: { userId?: string }) {
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadStats();
  }, [userId]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`${FN_BASE}/referral-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setStats(null); return; }
      const data = await res.json();
      setStats(data.partner || null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 text-[#0EA4E9] animate-spin" /></div>;

  if (!stats) return <ClaimLink onClaimed={loadStats} />;

  // Built from the current origin so the link keeps working after a domain move.
  const refLink = `${window.location.origin}?ref=${stats.code}`;
  const money = (cents?: number) => `$${((cents ?? 0) / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Your referral link</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-2.5 rounded-lg text-sm text-gray-300 font-mono truncate" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {refLink}
          </div>
          <CopyButton text={refLink} />
        </div>
        <p className="mt-2 text-xs text-gray-600">
          {stats.commission_percent}% of what your referrals pay, every month, for their first 12 months.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard icon={<Users className="w-4 h-4" />} label="Signups" value={String(stats.signups)} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Conversions" value={String(stats.conversions)} />
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Earned" value={money(stats.total_commission_cents)} />
      </div>

      <Balance stats={stats} money={money} />
      <PayoutSettings stats={stats} onSaved={loadStats} />
    </div>
  );
}

// Splits earnings into what can be withdrawn now and what is still settling,
// so the number on screen is one a partner can act on.
function Balance({ stats, money }: { stats: PartnerStats; money: (c?: number) => string }) {
  const min = money(stats.min_payout_cents ?? 1000);
  return (
    <div className="rounded-xl p-5" style={glassCard}>
      <h2 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wide">Balance</h2>
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Available</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{money(stats.available_cents)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Settling</p>
          </div>
          <p className="text-2xl font-bold text-gray-400">{money(stats.pending_cents)}</p>
        </div>
        {(stats.paid_out_cents ?? 0) > 0 && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1 mt-[18px]">Paid out</p>
            <p className="text-2xl font-bold text-gray-400">{money(stats.paid_out_cents)}</p>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-gray-600 text-balance">
        Earnings settle 30 days after the payment they came from, which covers refunds. Once settled you can withdraw from {min}, by PayPal.
      </p>
    </div>
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
    <div className="rounded-xl p-5" style={glassCard}>
      <h2 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wide">Getting paid</h2>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="Your PayPal email"
          className="flex-1 px-4 py-2.5 rounded-lg text-sm text-gray-200 placeholder:text-gray-600"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ background: '#0EA4E9' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : 'Save'}
        </button>
      </div>

      <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={inCredits}
          onChange={e => setInCredits(e.target.checked)}
          className="mt-0.5 accent-[#0EA4E9]"
        />
        <span className="text-xs text-gray-500 text-balance">
          Pay me in credits instead, worth double the cash amount.
        </span>
      </label>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// Anyone signed in can take a link, so the program is self-serve rather than
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
    <div className="rounded-xl p-6 sm:p-8" style={glassCard}>
      <Handshake className="w-9 h-9 text-gray-600 mb-4" />
      <h2 className="text-white font-semibold text-lg mb-2">Earn 30% of every subscriber you send</h2>
      <p className="text-sm text-gray-500 max-w-lg text-balance">
        Share your link with your audience. When someone subscribes through it, you earn 30% of
        everything they pay for their first 12 months. Pick the name you want in the link.
      </p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-5">
        <div className="flex items-center flex-1 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="pl-3 pr-1 text-sm text-gray-600 font-mono whitespace-nowrap">?ref=</span>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && claim()}
            placeholder="yourname"
            className="flex-1 bg-transparent py-2.5 pr-4 text-sm text-gray-200 font-mono placeholder:text-gray-600 outline-none min-w-0"
          />
        </div>
        <button
          onClick={claim}
          disabled={busy || !code.trim()}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 whitespace-nowrap"
          style={{ background: '#0EA4E9' }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get my link'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <p className="mt-4 text-xs text-gray-600 text-balance">
        Earnings settle 30 days after each payment and you can withdraw from $10. Self-referrals and
        ads on our brand terms are not eligible.
      </p>
    </div>
  );
}

// ── Admin view ───────────────────────────────────────────────────────────────
function AdminView() {
  const [partners, setPartners] = useState<PartnerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  // assign email to existing partner
  const [assigningCode, setAssigningCode] = useState<string | null>(null);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/referral-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPartners(data.partners || []);
    } finally {
      setLoading(false);
    }
  };

  const createPartner = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    setCreating(true);
    try {
      const token = await getSessionToken();
      const res = await fetchWithRetry(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/referral-stats`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode.trim().toLowerCase(), partner_name: newName.trim(), owner_email: newEmail.trim() || undefined }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to create partner');
        return;
      }
      setNewCode(''); setNewName(''); setNewEmail('');
      setShowForm(false);
      loadAll();
    } catch {
      alert('Request failed or timed out. Check that the edge function is deployed.');
    } finally {
      setCreating(false);
    }
  };

  const deletePartner = async (code: string) => {
    if (!confirm(`Delete partner "${code}"? This cannot be undone.`)) return;
    try {
      const token = await getSessionToken();
      const res = await fetchWithRetry(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/referral-stats`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to delete partner');
        return;
      }
      loadAll();
    } catch {
      alert('Request failed or timed out.');
    }
  };

  const assignOwner = async (code: string) => {
    if (!assignEmail.trim()) return;
    setAssignLoading(true);
    try {
      const token = await getSessionToken();
      const res = await fetchWithRetry(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/referral-stats`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, owner_email: assignEmail.trim() }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to assign');
        return;
      }
      setAssigningCode(null);
      setAssignEmail('');
      loadAll();
    } catch {
      alert('Request failed or timed out.');
    } finally {
      setAssignLoading(false);
    }
  };

  const totalSignups = partners.reduce((s, p) => s + p.signups, 0);
  const totalConversions = partners.reduce((s, p) => s + p.conversions, 0);
  const totalEarned = partners.reduce((s, p) => s + p.total_commission_cents, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard icon={<Users className="w-4 h-4" />} label="Signups" value={String(totalSignups)} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Conversions" value={String(totalConversions)} />
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Commission" value={`$${(totalEarned / 100).toFixed(2)}`} />
      </div>

      <div className="rounded-xl p-5" style={glassCard}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Partners ({partners.length})</h2>
          <div className="flex gap-2">
            <button onClick={loadAll} disabled={loading} className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity" style={{ background: '#0EA4E9' }}>
              <Plus className="w-3.5 h-3.5" />
              New partner
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-4 p-4 rounded-lg space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Code (in URL)</label>
                <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="marcus" className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Partner name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Marcus" className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Partner email (optional)</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="marcus@email.com" type="email" className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createPartner} disabled={creating || !newCode || !newName} className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity" style={{ background: '#0EA4E9' }}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-16"><Loader2 className="w-4 h-4 text-gray-500 animate-spin" /></div>
        ) : partners.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No partners yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {partners.map(p => (
              <div key={p.code}>
                <div className="px-4 py-3 rounded-lg space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Top row: name + actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">{p.partner_name}</span>
                        <span className="text-xs text-gray-600 font-mono">?ref={p.code}</span>
                        {!p.active && <span className="text-xs text-red-400">inactive</span>}
                        {!p.owner_user_id && <span className="text-xs text-amber-500">no account linked</span>}
                      </div>
                      <p className="text-xs text-gray-600">{p.commission_percent}% commission</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setAssigningCode(assigningCode === p.code ? null : p.code); setAssignEmail(''); }} className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors rounded" title="Link account">
                        <Link className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deletePartner(p.code)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors rounded" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Bottom row: stats + copy */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-semibold">{p.signups}</span>
                        <span className="text-xs text-gray-600">signups</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-white font-semibold">{p.conversions}</span>
                        <span className="text-xs text-gray-600">paid</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-emerald-400 font-semibold">${(p.total_commission_cents / 100).toFixed(2)}</span>
                        <span className="text-xs text-gray-600">earned</span>
                      </div>
                    </div>
                    <CopyButton text={`https://hershymedia.com?ref=${p.code}`} />
                  </div>
                </div>

                {assigningCode === p.code && (
                  <div className="mt-1 px-4 py-3 rounded-lg space-y-2" style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.15)' }}>
                    <input
                      value={assignEmail}
                      onChange={e => setAssignEmail(e.target.value)}
                      placeholder="partner@email.com"
                      type="email"
                      className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => assignOwner(p.code)}
                        disabled={assignLoading || !assignEmail}
                        className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                        style={{ background: '#0EA4E9' }}
                      >
                        {assignLoading ? 'Linking...' : 'Link account'}
                      </button>
                      <button onClick={() => setAssigningCode(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
