import { useState, useEffect } from 'react';
import { RefreshOutlineIcon as Loader2, AddOutlineIcon as Plus, RefreshOutlineIcon as RefreshCw, TrashBinMinimalisticOutlineIcon as Trash2, LinkOutlineIcon as Link, CopyOutlineIcon as Copy, UsersGroupRoundedOutlineIcon as Users, GraphUpOutlineIcon as TrendingUp, DollarOutlineIcon as DollarSign, CheckCircleOutlineIcon as MarkPaid } from '@solar-icons/react';
import { Check } from './BrandIcons';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Panel } from './Page';
import { money, type PartnerStats } from './PartnersPage';
import { SITE_URL } from '../lib/brand';

const glassCard: React.CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--line)',
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Panel className="flex flex-col gap-2">
      <span className="[&>svg]:w-4 [&>svg]:h-4" style={{ color: 'var(--text-faint)' }}>{icon}</span>
      <div>
        <p className="label-mono mb-1">{label}</p>
        <p className="text-[22px] font-semibold tracking-tight tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
    </Panel>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--r-sm)]"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Admin view ───────────────────────────────────────────────────────────────
export function PartnersAdmin() {
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

  // Settling up. Only earnings past their 30-day hold are marked, and the
  // server enforces that too - see referral-stats. Until this existed the
  // paid_out column was written by nothing at all, so the first real payout
  // meant an UPDATE typed by hand against production.
  const [payingCode, setPayingCode] = useState<string | null>(null);
  const markPaid = async (p: PartnerStats) => {
    const amount = money(p.available_cents);
    if (!window.confirm(`Mark ${amount} as paid out to ${p.partner_name}? Do this after the PayPal transfer has actually gone through.`)) return;
    setPayingCode(p.code);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetchWithRetry(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/referral-stats`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', code: p.code }),
      });
      const data = await res.json();
      if (!res.ok) { window.alert(data.error || 'Could not mark that paid'); return; }
      await loadAll();
    } finally {
      setPayingCode(null);
    }
  };

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
            <button onClick={loadAll} disabled={loading} className="p-2 text-[var(--text-muted)] hover:text-white transition-colors rounded-lg hover:bg-white/5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
              <Plus className="w-3.5 h-3.5" />
              New partner
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-4 p-4 rounded-lg space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Code (in URL)</label>
                <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="marcus" className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none" style={{ background: 'var(--line)', border: '1px solid var(--line-strong)' }} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Partner name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Marcus" className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none" style={{ background: 'var(--line)', border: '1px solid var(--line-strong)' }} />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Partner email (optional)</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="marcus@email.com" type="email" className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none" style={{ background: 'var(--line)', border: '1px solid var(--line-strong)' }} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createPartner} disabled={creating || !newCode || !newName} className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-16"><Loader2 className="w-4 h-4 text-[var(--text-muted)] animate-spin" /></div>
        ) : partners.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No partners yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {partners.map(p => (
              <div key={p.code}>
                <div className="px-4 py-3 rounded-lg space-y-2" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
                  {/* Top row: name + actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">{p.partner_name}</span>
                        <span className="text-xs text-[var(--text-faint)] font-mono">?ref={p.code}</span>
                        {!p.active && <span className="text-xs text-[rgb(var(--danger-rgb))]">inactive</span>}
                        {!p.owner_user_id && <span className="text-xs text-[var(--upgrade)]">no account linked</span>}
                      </div>
                      <p className="text-xs text-[var(--text-faint)]">{p.commission_percent}% commission</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setAssigningCode(assigningCode === p.code ? null : p.code); setAssignEmail(''); }} className="p-1.5 text-[var(--text-muted)] hover:text-white/70 transition-colors rounded" title="Link account">
                        <Link className="w-3.5 h-3.5" />
                      </button>
                      {(p.available_cents ?? 0) > 0 && (
                        <button
                          onClick={() => markPaid(p)}
                          disabled={payingCode === p.code}
                          className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-[var(--r-sm)] transition-colors disabled:opacity-50"
                          style={{ background: 'rgba(var(--process-rgb),0.12)', color: 'var(--process)' }}
                          title="Mark settled earnings as paid out"
                        >
                          {payingCode === p.code
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <MarkPaid className="w-3.5 h-3.5" />}
                          Pay {money(p.available_cents)}
                        </button>
                      )}
                      <button onClick={() => deletePartner(p.code)} className="p-1.5 text-[var(--text-muted)] hover:text-[rgb(var(--danger-rgb))] transition-colors rounded" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Bottom row: stats + copy */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-semibold">{p.signups}</span>
                        <span className="text-xs text-[var(--text-faint)]">signups</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-white font-semibold">{p.conversions}</span>
                        <span className="text-xs text-[var(--text-faint)]">paid</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-emerald-400 font-semibold">${(p.total_commission_cents / 100).toFixed(2)}</span>
                        <span className="text-xs text-[var(--text-faint)]">earned</span>
                      </div>
                    </div>
                    <CopyButton text={`${SITE_URL}?ref=${p.code}`} />
                  </div>
                </div>

                {assigningCode === p.code && (
                  <div className="mt-1 px-4 py-3 rounded-lg space-y-2" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
                    <input
                      value={assignEmail}
                      onChange={e => setAssignEmail(e.target.value)}
                      placeholder="partner@email.com"
                      type="email"
                      className="w-full px-3 py-2 rounded-lg text-white text-sm focus:outline-none"
                      style={{ background: 'var(--line)', border: '1px solid var(--line-strong)' }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => assignOwner(p.code)}
                        disabled={assignLoading || !assignEmail}
                        className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                      >
                        {assignLoading ? 'Linking...' : 'Link account'}
                      </button>
                      <button onClick={() => setAssigningCode(null)} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white rounded-lg" style={{ background: 'var(--line)' }}>Cancel</button>
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
