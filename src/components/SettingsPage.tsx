import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, Loader2, Check, Lock, Eye, EyeOff, RefreshCw, Link, AlertTriangle, Settings } from 'lucide-react';
import { getSessionToken } from '../lib/supabase';
import { showToast } from '../lib/toast';

const NOTION_CONNECT_URL = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1/notion-connect';

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

const divider = { borderTop: '1px solid rgba(255,255,255,0.06)' };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-600 mb-3">
      {children}
    </p>
  );
}

const CREATOR_LEVELS = [
  { value: 'beginner', label: 'Beginner', hint: 'New to Shorts, learning fundamentals' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Know the basics, working on execution' },
  { value: 'advanced', label: 'Advanced', hint: 'Experienced creator, want nuance' },
];

export function SettingsPage() {
  const { user } = useAuth();

  // YouTube + plan state
  const [youtubeStatus, setYoutubeStatus] = useState<{
    connected: boolean;
    updatedAt?: string;
    channelName?: string;
    channelThumbnail?: string;
  } | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  // Notion connection state
  const [notion, setNotion] = useState<{ connected: boolean; workspace_name?: string | null } | null>(null);
  const [notionBusy, setNotionBusy] = useState(false);

  // Channel context state
  const [channelNiche, setChannelNiche] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [creatorLevel, setCreatorLevel] = useState('intermediate');
  const [contextLoading, setContextLoading] = useState(true);
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

  useEffect(() => {
    if (!user?.id) return;
    // Query 1: guaranteed columns (tokens + plan)
    supabase
      .from('user_tokens')
      .select('updated_at, access_token, plan, youtube_channel_name, youtube_channel_thumbnail')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.access_token) {
          setYoutubeStatus({
            connected: true,
            updatedAt: data.updated_at,
            channelName: data.youtube_channel_name,
            channelThumbnail: data.youtube_channel_thumbnail,
          });
        } else {
          setYoutubeStatus({ connected: false });
        }
        setPlan(data?.plan || 'free');
      })
      .catch(() => setYoutubeStatus({ connected: false }));

    // Query 2: optional context columns (may not exist)
    supabase
      .from('user_tokens')
      .select('channel_niche, channel_description, creator_level')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setChannelNiche(data.channel_niche || '');
          setChannelDescription(data.channel_description || '');
          setCreatorLevel(data.creator_level || 'intermediate');
        }
        setContextLoading(false);
      })
      .catch(() => setContextLoading(false));
  }, [user?.id]);

  const connectYouTube = () => {
    if (!user?.id) return;
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/youtube-oauth-callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl';
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user.id}`;
  };

  // Load Notion connection status
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const token = await getSessionToken();
      if (!token) return;
      try {
        const res = await fetch(NOTION_CONNECT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        if (res.ok) setNotion(await res.json());
        else setNotion({ connected: false });
      } catch { setNotion({ connected: false }); }
    })();
  }, [user?.id]);

  const callNotion = async (action: string) => {
    const token = await getSessionToken();
    if (!token) throw new Error('no token');
    const res = await fetch(NOTION_CONNECT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const connectNotion = async () => {
    setNotionBusy(true);
    try {
      const { res, data } = await callNotion('start');
      if (!res.ok || !data.url) {
        showToast(data.error === 'upgrade_required' ? 'Notion is a paid feature' : 'Could not start Notion connect', 'error');
        return;
      }
      window.location.href = data.url;
    } catch { showToast('Could not connect Notion', 'error'); }
    finally { setNotionBusy(false); }
  };

  const disconnectNotion = async () => {
    setNotionBusy(true);
    try {
      await callNotion('disconnect');
      setNotion({ connected: false });
      showToast('Notion disconnected');
    } catch { showToast('Failed to disconnect', 'error'); }
    finally { setNotionBusy(false); }
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
    <div className="max-w-2xl mx-auto px-6 pt-6 pb-12 space-y-8 animate-fade-in-up">

      <div className="hidden sm:block">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-gray-500">Manage your account, channel context, and subscription</p>
      </div>

      {/* ── YouTube ── */}
      <div>
        <SectionLabel>YouTube</SectionLabel>
        <div style={divider} className="pt-4">
          {youtubeStatus === null ? (
            <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
          ) : youtubeStatus.connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {youtubeStatus.channelThumbnail ? (
                  <img src={youtubeStatus.channelThumbnail} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.1)' }}>
                    <YouTubeLogo className="w-4 h-4 text-red-500" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">{youtubeStatus.channelName || 'Connected'}</p>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 rounded-lg hover:text-gray-200 transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <RefreshCw className="w-3 h-3" />
                Reconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <YouTubeLogo className="w-4 h-4 text-gray-600" />
                </div>
                <p className="text-sm text-gray-500">No account connected</p>
              </div>
              <button
                onClick={connectYouTube}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors"
                style={{ background: '#FF0000' }}
              >
                <Link className="w-3 h-3" />
                Connect
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Notion (paid plans) ── */}
      {plan && plan !== 'free' && (
        <div>
          <SectionLabel>Notion</SectionLabel>
          <div style={divider} className="pt-4">
            {notion === null ? (
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
            ) : notion.connected ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Link className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{notion.workspace_name || 'Connected'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Save hooks, scripts & ideas straight to Notion</p>
                  </div>
                </div>
                <button onClick={disconnectNotion} disabled={notionBusy} className="px-4 py-2 text-xs font-semibold rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50 flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                  {notionBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Link className="w-4 h-4 text-gray-600" />
                  </div>
                  <p className="text-sm text-gray-500">Not connected</p>
                </div>
                <button onClick={connectNotion} disabled={notionBusy} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 flex-shrink-0" style={{ background: '#0EA4E9' }}>
                  {notionBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
                  Connect
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Channel Context ── */}
      <div>
        <SectionLabel>Channel Context</SectionLabel>
        <div style={divider} className="pt-4">
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">
            Included in every AI analysis to make recommendations relevant to your channel.
          </p>
          {contextLoading ? (
            <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Creator Level</label>
                <select
                  value={creatorLevel}
                  onChange={e => setCreatorLevel(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-white text-sm focus:outline-none transition-colors appearance-none cursor-pointer"
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
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Channel Niche</label>
                <input
                  type="text"
                  value={channelNiche}
                  onChange={e => setChannelNiche(e.target.value)}
                  placeholder="e.g. Personal finance for millennials, fitness, tech reviews..."
                  className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                  style={glassInput}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Channel Description</label>
                <textarea
                  value={channelDescription}
                  onChange={e => setChannelDescription(e.target.value)}
                  placeholder="Describe your content style, tone, and target audience."
                  rows={3}
                  className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none resize-none leading-relaxed transition-colors"
                  style={glassInput}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
              </div>

              {contextError && <p className="text-red-400 text-sm">{contextError}</p>}

              <button
                onClick={saveContext}
                disabled={contextSaving}
                className="w-full py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {contextSaving ? 'Saving...' : contextSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Account ── */}
      <div>
        <SectionLabel>Account</SectionLabel>
        <div style={divider} className="pt-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Email</label>
            <div className="px-4 py-2.5 rounded-lg text-gray-400 text-sm" style={glassInput}>
              {user?.email}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Change Password</label>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-4 py-2.5 pr-10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
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
                  className="w-full px-4 py-2.5 pr-10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
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
                className="px-4 py-1.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {pwSaving ? 'Updating...' : pwSaved ? 'Updated!' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Subscription ── (paid only) */}
      {plan && plan !== 'free' && (
        <div>
          <SectionLabel>Subscription</SectionLabel>
          <div style={divider} className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium capitalize">
                  {plan === 'pro' ? 'Plus' : plan === 'agency' ? 'Pro' : plan} Plan
                </p>
                {cancelDone
                  ? <p className="text-xs text-emerald-400 mt-0.5">Cancelled — access continues until end of billing period</p>
                  : <p className="text-xs text-gray-500 mt-0.5">Active subscription</p>
                }
              </div>
              {!cancelDone && (
                confirmCancel ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Sure?</span>
                    <button
                      onClick={cancelSubscription}
                      disabled={cancelLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                      style={{ background: 'rgba(239,68,68,0.8)' }}
                    >
                      {cancelLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {cancelLoading ? 'Cancelling...' : 'Yes, cancel'}
                    </button>
                    <button onClick={() => setConfirmCancel(false)} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5">
                      Keep
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 rounded-lg hover:text-red-400 transition-colors"
                    style={{ border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Cancel subscription
                  </button>
                )
              )}
            </div>
            {cancelError && <p className="mt-2 text-red-400 text-xs">{cancelError}</p>}
          </div>
        </div>
      )}

    </div>
  );
}
