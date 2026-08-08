import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Eye, EyeOff, RefreshCw, Link, ChevronDown, Sparkles, User, Zap, MessageCircle, ExternalLink, Ticket } from 'lucide-react';
import { getSessionToken } from '../lib/supabase';

function YouTubeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

// Grouped settings section: a collapsible glass card (collapsed by default).
// Open state lives in SettingsPage so only one card is expanded at a time.
function SettingsCard({ icon, iconBg, title, open, onToggle, children }: {
  icon: React.ReactNode; iconBg: string; title: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-white font-semibold text-sm sm:text-[15px] leading-tight">{title}</h2>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

// Small uppercase label for fields inside a card.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{children}</label>;
}

const CREATOR_LEVELS = [
  { value: 'beginner', label: 'Beginner', hint: 'New to Shorts, learning fundamentals' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Know the basics, working on execution' },
  { value: 'advanced', label: 'Advanced', hint: 'Experienced creator, want nuance' },
];

// This field doubles as the future home for Discord voucher/perk codes.
// The one special case today is the hidden admin dashboard — gated on the
// account's own email, not on knowing this string (see admin-stats function).
const ADMIN_EMAIL = 'reyzostyle@gmail.com';
const ADMIN_CODE = 'ADMIN';
const PLAN_CACHE_KEY = 'hershy_last_plan';

export function SettingsPage() {
  const { user } = useAuth();

  // Accordion: name of the single expanded card, or null when all collapsed
  const [openCard, setOpenCard] = useState<string | null>(null);
  const cardProps = (name: string) => ({
    open: openCard === name,
    onToggle: () => setOpenCard(c => (c === name ? null : name)),
  });

  // YouTube + plan state
  const [youtubeStatus, setYoutubeStatus] = useState<{
    connected: boolean;
    updatedAt?: string;
    channelName?: string;
    channelThumbnail?: string;
  } | null>(null);
  // Seeded from the last known plan so the Subscription card is on screen from
  // the first paint rather than dropping in once the request lands and pushing
  // the page around. The fetch below corrects it either way.
  const [plan, setPlan] = useState<string | null>(() => {
    try { return localStorage.getItem(PLAN_CACHE_KEY); } catch { return null; }
  });
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Channel context state
  const [channelNiche, setChannelNiche] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [creatorLevel, setCreatorLevel] = useState('intermediate');
  const [loading, setLoading] = useState(true);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [contextError, setContextError] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');

  // Subscription state
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Redeem code state
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  const redeem = async () => {
    const code = redeemCode.trim();
    if (!code) return;
    if (user?.email === ADMIN_EMAIL && code.toUpperCase() === ADMIN_CODE) {
      setRedeemMsg(null);
      setRedeemCode('');
      window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'admin' }));
      return;
    }
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const token = await getSessionToken();
      const res = await fetch('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/redeem-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid or expired code.');
      setRedeemMsg({ type: 'success', text: data.message || 'Code redeemed!' });
      setRedeemCode('');
    } catch (e) {
      setRedeemMsg({ type: 'error', text: e instanceof Error ? e.message : 'Invalid or expired code.' });
    } finally {
      setRedeeming(false);
    }
  };

  // One row, one request. This used to be two queries against the same row,
  // which meant the cards filled in at two different moments and the
  // Subscription card (gated on `plan`) could land noticeably after the rest.
  // The context columns were split off as a guard against their not existing;
  // they have been guaranteed by migrations for a while now.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('user_tokens')
          .select('updated_at, access_token, plan, youtube_channel_name, youtube_channel_thumbnail, channel_niche, channel_description, creator_level')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;

        setYoutubeStatus(data?.access_token
          ? {
              connected: true,
              updatedAt: data.updated_at,
              channelName: data.youtube_channel_name,
              channelThumbnail: data.youtube_channel_thumbnail,
            }
          : { connected: false });
        const nextPlan = data?.plan || 'free';
        setPlan(nextPlan);
        try { localStorage.setItem(PLAN_CACHE_KEY, nextPlan); } catch { /* private mode */ }
        setChannelNiche(data?.channel_niche || '');
        setChannelDescription(data?.channel_description || '');
        setCreatorLevel(data?.creator_level || 'intermediate');
      } catch {
        if (!cancelled) {
          setYoutubeStatus({ connected: false });
          setPlan('free');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  const connectYouTube = () => {
    if (!user?.id) return;
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/youtube-oauth-callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user.id}`;
  };

  // Fully disconnect: clear the stored tokens + channel so the app forgets the
  // connection. (Users can also revoke at myaccount.google.com/permissions.)
  const disconnectYouTube = async () => {
    if (!user?.id) return;
    setDisconnecting(true);
    const { error } = await supabase
      .from('user_tokens')
      .update({
        access_token: '',
        refresh_token: '',
        youtube_channel_name: null,
        youtube_channel_thumbnail: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    setDisconnecting(false);
    if (!error) {
      setYoutubeStatus({ connected: false });
      setConfirmDisconnect(false);
    }
  };

  const saveContext = async () => {
    setContextSaving(true);
    setContextError('');
    const { data: existing } = await supabase
      .from('user_tokens')
      .select('user_id')
      .eq('user_id', user?.id)
      .maybeSingle();
    let err;
    if (existing) {
      ({ error: err } = await supabase
        .from('user_tokens')
        .update({ channel_niche: channelNiche, channel_description: channelDescription, creator_level: creatorLevel })
        .eq('user_id', user?.id));
    } else {
      ({ error: err } = await supabase
        .from('user_tokens')
        .insert({ user_id: user?.id, channel_niche: channelNiche, channel_description: channelDescription, creator_level: creatorLevel, access_token: '', refresh_token: '' }));
    }
    setContextSaving(false);
    if (err) {
      setContextError('Failed to save: ' + err.message);
    } else {
      setContextSaved(true);
      setTimeout(() => setContextSaved(false), 2500);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    setPwSaving(true);
    setPwError('');
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user?.email, password: currentPassword });
    if (signInErr) { setPwSaving(false); setPwError('Current password is incorrect'); return; }
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (err) {
      setPwError(err.message);
    } else {
      setPwSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPwSaved(false), 2500);
    }
  };

  const cancelSubscription = async () => {
    setCancelLoading(true);
    setCancelError('');
    try {
      const token = await getSessionToken();
      const res = await fetch(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/cancel-subscription`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      setCancelDone(true);
      setConfirmCancel(false);
    } catch (e: any) {
      setCancelError(e.message);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 space-y-4 animate-fade-in-up">

      <div className="hidden lg:block mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-gray-500 text-balance">Manage your channel profile, account, and subscription</p>
      </div>

      {/* ── Channel profile ── */}
      <SettingsCard
        {...cardProps('profile')}
        icon={<Sparkles className="w-4 h-4 text-[#0EA4E9]" />}
        iconBg="rgba(14,164,233,0.12)"
        title="Channel profile"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
        ) : (
          <div className="space-y-4">
            <div>
              <FieldLabel>Creator level</FieldLabel>
              <select
                value={creatorLevel}
                onChange={e => setCreatorLevel(e.target.value)}
                className="glass-field w-full px-4 py-2.5 rounded-lg text-white text-sm focus:outline-none transition-colors appearance-none cursor-pointer"
                style={{ ...glassInput, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                {CREATOR_LEVELS.map(l => (
                  <option key={l.value} value={l.value} style={{ background: '#0D1B2A' }}>{l.label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-600">{CREATOR_LEVELS.find(l => l.value === creatorLevel)?.hint}</p>
            </div>

            <div>
              <FieldLabel>Channel niche</FieldLabel>
              <input
                type="text"
                value={channelNiche}
                onChange={e => setChannelNiche(e.target.value)}
                placeholder="e.g. Personal finance for millennials, fitness, tech reviews..."
                className="glass-field w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            <div>
              <FieldLabel>About the channel</FieldLabel>
              <textarea
                value={channelDescription}
                onChange={e => setChannelDescription(e.target.value)}
                placeholder="Describe your content style, tone, and target audience."
                rows={3}
                className="glass-field w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none resize-none leading-relaxed transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            {contextError && <p className="text-red-400 text-sm">{contextError}</p>}

            <button
              onClick={saveContext}
              disabled={contextSaving}
              className="w-full py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {contextSaving ? 'Saving...' : contextSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        )}
      </SettingsCard>

      {/* ── YouTube account ── */}
      <SettingsCard
        {...cardProps('youtube')}
        icon={<YouTubeLogo className="w-4 h-4 text-red-500" />}
        iconBg="rgba(255,0,0,0.1)"
        title="YouTube account"
      >
        {youtubeStatus === null ? (
          <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
        ) : youtubeStatus.connected ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {youtubeStatus.channelThumbnail ? (
                <img src={youtubeStatus.channelThumbnail} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,0,0,0.1)' }}>
                  <YouTubeLogo className="w-4 h-4 text-red-500" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white font-medium truncate">{youtubeStatus.channelName || 'Connected'}</p>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
                </div>
                {youtubeStatus.updatedAt && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Last synced {new Date(youtubeStatus.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={connectYouTube}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 rounded-lg hover:text-gray-200 transition-colors flex-shrink-0"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <RefreshCw className="w-3 h-3" />
              Reconnect
            </button>
          </div>
        ) : null}

        {/* Disconnect (subtle) — only when connected */}
        {youtubeStatus?.connected && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {confirmDisconnect ? (
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400">Disconnect this YouTube account?</span>
                <button
                  onClick={disconnectYouTube}
                  disabled={disconnecting}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                </button>
                <button onClick={() => setConfirmDisconnect(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  Keep
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline decoration-gray-700 underline-offset-2"
              >
                Disconnect account
              </button>
            )}
          </div>
        )}

        {youtubeStatus !== null && !youtubeStatus.connected && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <YouTubeLogo className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-sm text-gray-500">No account connected</p>
            </div>
            <button
              onClick={connectYouTube}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors flex-shrink-0"
              style={{ background: '#FF0000' }}
            >
              <Link className="w-3 h-3" />
              Connect
            </button>
          </div>
        )}
      </SettingsCard>

      {/* ── Account ── */}
      <SettingsCard
        {...cardProps('account')}
        icon={<User className="w-4 h-4 text-gray-300" />}
        iconBg="rgba(255,255,255,0.07)"
        title="Account"
      >
        <div className="space-y-5">
          <div>
            <FieldLabel>Email</FieldLabel>
            <div className="px-4 py-2.5 rounded-lg text-gray-400 text-sm truncate" style={glassInput}>
              {user?.email}
            </div>
          </div>

          <div>
            <FieldLabel>Change password</FieldLabel>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="glass-field w-full px-4 py-2.5 pr-10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                  style={glassInput}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="glass-field w-full px-4 py-2.5 pr-10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                  style={glassInput}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
              <button
                onClick={changePassword}
                disabled={pwSaving || !currentPassword || !newPassword}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {pwSaving ? 'Updating...' : pwSaved ? 'Updated!' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* ── Subscription ── (paid only) */}
      {plan && plan !== 'free' && (
        <SettingsCard
          {...cardProps('subscription')}
          icon={<Zap className="w-4 h-4 text-[#0EA4E9]" />}
          iconBg="rgba(14,164,233,0.12)"
          title="Subscription"
        >
          {/* Plan summary with an accent badge — distinct from the other cards */}
          <div className="rounded-xl px-4 py-3.5 flex items-center justify-between gap-3" style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.18)' }}>
            <div className="min-w-0">
              <p className="text-sm text-white font-semibold">
                {plan === 'pro' ? 'Plus' : plan === 'agency' ? 'Pro' : plan} Plan
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {cancelDone ? 'Access until end of billing period' : 'Renews monthly'}
              </p>
            </div>
            <span
              className="text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0"
              style={cancelDone
                ? { background: 'rgba(148,163,184,0.15)', color: '#94A3B8' }
                : { background: 'rgba(52,211,153,0.15)', color: '#34D399' }}
            >
              {cancelDone ? 'Cancelled' : 'Active'}
            </span>
          </div>

          {!cancelDone && (
            <div className="mt-4">
              {confirmCancel ? (
                <div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Cancel your subscription? You'll keep full access until the end of the current billing period.
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                    >
                      Keep plan
                    </button>
                    <button
                      onClick={cancelSubscription}
                      disabled={cancelLoading}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {cancelLoading ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline decoration-gray-700 underline-offset-2"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          )}
          {cancelError && <p className="mt-2 text-red-400 text-xs">{cancelError}</p>}
        </SettingsCard>
      )}

      {/* ── Support ── */}
      <SettingsCard
        {...cardProps('support')}
        icon={<MessageCircle className="w-4 h-4 text-[#5865F2]" />}
        iconBg="rgba(88,101,242,0.12)"
        title="Support"
      >
        <a
          href="https://discord.gg/N8S6C95Ry2"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#5865F2] text-white rounded-lg text-sm font-semibold hover:bg-[#5865F2]/90 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Join Discord
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </a>
      </SettingsCard>

      {/* ── Redeem code ── */}
      <SettingsCard
        {...cardProps('redeem')}
        icon={<Ticket className="w-4 h-4 text-amber-400" />}
        iconBg="rgba(251,191,36,0.12)"
        title="Redeem code"
      >
        <div className="flex items-center gap-2">
          <input
            value={redeemCode}
            onChange={e => { setRedeemCode(e.target.value); setRedeemMsg(null); }}
            onKeyDown={e => { if (e.key === 'Enter') redeem(); }}
            placeholder="Enter a code"
            className="glass-field flex-1 px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
            style={glassInput}
            onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />
          <button
            onClick={redeem}
            disabled={!redeemCode.trim() || redeeming}
            className="px-4 py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            {redeeming ? 'Redeeming...' : 'Redeem'}
          </button>
        </div>
        {redeemMsg && (
          <p className={`mt-2 text-xs ${redeemMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {redeemMsg.text}
          </p>
        )}
      </SettingsCard>

    </div>
  );
}
