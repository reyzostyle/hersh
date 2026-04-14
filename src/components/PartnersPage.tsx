import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, getSessionToken } from '../lib/supabase';
import { Copy, Check, Users, TrendingUp, DollarSign, Loader2, Plus, RefreshCw } from 'lucide-react';

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

interface PartnerStats {
  code: string;
  partner_name: string;
  commission_percent: number;
  active: boolean;
  created_at: string;
  signups: number;
  conversions: number;
  total_commission_cents: number;
  owner_user_id?: string;
}

export function PartnersPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 className="text-2xl font-bold text-white mb-1">Partners</h1>
        <p className="text-sm text-gray-500">
          {isAdmin ? 'Manage referral partners and track conversions' : 'Your referral stats and link'}
        </p>
      </div>
      <div className="flex-1 overflow-auto px-6 py-6 max-w-4xl">
        {isAdmin ? <AdminView /> : <PartnerView userId={user?.id} />}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl p-4" style={glassCard}>
      <div className="flex items-center gap-2 mb-2 text-gray-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-stats`, {
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

  if (!stats) {
    return (
      <div className="rounded-xl p-8 text-center" style={glassCard}>
        <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <h2 className="text-white font-semibold mb-2">You're not a partner yet</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Reach out to us on Discord or email to join the partner program and get your referral link.
        </p>
      </div>
    );
  }

  const refLink = `https://hersh.live?ref=${stats.code}`;
  const earned = (stats.total_commission_cents / 100).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">Your referral link</h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-2.5 rounded-lg text-sm text-gray-300 font-mono" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {refLink}
          </div>
          <CopyButton text={refLink} />
        </div>
        <p className="mt-2 text-xs text-gray-600">{stats.commission_percent}% commission on every paid conversion</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Users className="w-4 h-4" />} label="Signups" value={String(stats.signups)} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Paid conversions" value={String(stats.conversions)} />
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Total earned" value={`$${earned}`} />
      </div>
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

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-stats`, {
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
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/referral-stats`, {
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
    } catch (e) {
      alert('Request failed or timed out. Check that the edge function is deployed.');
    } finally {
      setCreating(false);
    }
  };

  const totalSignups = partners.reduce((s, p) => s + p.signups, 0);
  const totalConversions = partners.reduce((s, p) => s + p.conversions, 0);
  const totalEarned = partners.reduce((s, p) => s + p.total_commission_cents, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Users className="w-4 h-4" />} label="Total signups" value={String(totalSignups)} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Paid conversions" value={String(totalConversions)} />
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Total commission paid" value={`$${(totalEarned / 100).toFixed(2)}`} />
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
            <div className="grid grid-cols-3 gap-3">
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
              <div key={p.code} className="flex items-center gap-4 px-4 py-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{p.partner_name}</span>
                    <span className="text-xs text-gray-600 font-mono">?ref={p.code}</span>
                    {!p.active && <span className="text-xs text-red-400">inactive</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{p.commission_percent}% commission</p>
                </div>
                <div className="flex items-center gap-6 text-sm flex-shrink-0">
                  <div className="text-center">
                    <p className="text-white font-semibold">{p.signups}</p>
                    <p className="text-xs text-gray-600">signups</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold">{p.conversions}</p>
                    <p className="text-xs text-gray-600">paid</p>
                  </div>
                  <div className="text-center">
                    <p className="text-emerald-400 font-semibold">${(p.total_commission_cents / 100).toFixed(2)}</p>
                    <p className="text-xs text-gray-600">earned</p>
                  </div>
                  <CopyButton text={`https://hersh.live?ref=${p.code}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
