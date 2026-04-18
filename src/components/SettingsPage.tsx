import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, Loader2, Check, User, Tv, Lock, Eye, EyeOff, RefreshCw, Link } from 'lucide-react';

function YouTubeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

type SettingsTab = 'profile' | 'niche';

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-gray-500">Manage your account, channel context, and subscription.</p>
      </div>
      <div className="px-6 py-6 max-w-3xl">

      <div className="flex gap-1 mb-8 rounded-lg p-1 w-fit" style={glassCard}>
        {([
          { id: 'profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
          { id: 'niche', label: 'Niche & Context', icon: <Tv className="w-3.5 h-3.5" /> },
        ] as { id: SettingsTab; label: string; icon: React.ReactNode }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            style={activeTab === tab.id ? { background: 'rgba(255,255,255,0.08)' } : {}}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab user={user} />}
      {activeTab === 'niche' && <NicheTab userId={user?.id} />}
      </div>
    </div>
  );
}

function ProfileTab({ user }: { user: any }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [youtubeStatus, setYoutubeStatus] = useState<{ connected: boolean; updatedAt?: string } | null>(null);

  useEffect(() => {
    supabase
      .from('user_tokens')
      .select('id, updated_at, access_token')
      .eq('user_id', user?.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.access_token) {
          setYoutubeStatus({ connected: true, updatedAt: data.updated_at });
        } else {
          setYoutubeStatus({ connected: false });
        }
      })
      .catch(() => setYoutubeStatus({ connected: false }));
  }, [user?.id]);

  const connectYouTube = () => {
    if (!user?.id) return;
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = 'https://hersh.live/auth/callback';
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl';
    sessionStorage.setItem('youtube_oauth_user_id', user.id);
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) { setError('New password must be at least 6 characters'); return; }
    setSaving(true);
    setError('');
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user?.email, password: currentPassword });
    if (signInErr) { setSaving(false); setError('Current password is incorrect'); return; }
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          Account
        </h2>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
          <div className="px-4 py-2.5 rounded-lg text-gray-400 text-sm" style={glassInput}>
            {user?.email}
          </div>
        </div>
      </div>

      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-400" />
          Change Password
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-4 py-2.5 pr-10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-4 py-2.5 pr-10 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={changePassword}
            disabled={saving || !currentPassword || !newPassword}
            className="flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0EA4E9' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Password Updated!' : 'Update Password'}
          </button>
        </div>
      </div>

      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <YouTubeLogo className="w-4 h-4 text-[#FF0000]" />
          YouTube Account
        </h2>
        {youtubeStatus === null ? (
          <div className="h-10 flex items-center"><Loader2 className="w-4 h-4 text-gray-500 animate-spin" /></div>
        ) : youtubeStatus.connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div>
                <p className="text-sm text-gray-200 font-medium">Connected</p>
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
              <div className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />
              <p className="text-sm text-gray-500">No account connected</p>
            </div>
            <button
              onClick={connectYouTube}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
              style={{ background: '#FF0000' }}
            >
              <Link className="w-3 h-3" />
              Connect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CREATOR_LEVELS = [
  { value: 'beginner', label: 'Beginner', hint: 'New to Shorts, learning fundamentals' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Know the basics, working on execution' },
  { value: 'advanced', label: 'Advanced', hint: 'Experienced creator, want nuance' },
];

function NicheTab({ userId }: { userId?: string }) {
  const [channelNiche, setChannelNiche] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [creatorLevel, setCreatorLevel] = useState('intermediate');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('user_tokens')
      .select('channel_niche, channel_description, creator_level')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setChannelNiche(data.channel_niche || '');
          setChannelDescription(data.channel_description || '');
          setCreatorLevel(data.creator_level || 'intermediate');
        }
        setLoading(false);
      });
  }, [userId]);

  const save = async () => {
    setSaving(true);
    setError('');
    const { data: existing } = await supabase
      .from('user_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    let err;
    if (existing) {
      ({ error: err } = await supabase
        .from('user_tokens')
        .update({ channel_niche: channelNiche, channel_description: channelDescription, creator_level: creatorLevel })
        .eq('user_id', userId));
    } else {
      ({ error: err } = await supabase
        .from('user_tokens')
        .insert({ user_id: userId, channel_niche: channelNiche, channel_description: channelDescription, creator_level: creatorLevel, access_token: '', refresh_token: '' }));
    }
    setSaving(false);
    if (err) {
      setError('Failed to save: ' + err.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 text-[#0EA4E9] animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={glassCard}>
        <div className="mb-5">
          <h2 className="text-base font-semibold text-white mb-1">Niche & Context</h2>
          <p className="text-sm text-gray-500">
            This information is included in every AI analysis to make recommendations more relevant to your channel.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Channel Niche</label>
            <input
              type="text"
              value={channelNiche}
              onChange={e => setChannelNiche(e.target.value)}
              placeholder="e.g. Personal finance for millennials, fitness & weight loss, tech reviews..."
              className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
              style={glassInput}
              onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Channel Description</label>
            <textarea
              value={channelDescription}
              onChange={e => setChannelDescription(e.target.value)}
              placeholder="Describe your channel, content style, tone, and target audience. The more detail you give, the better the analysis."
              rows={4}
              className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none resize-none leading-relaxed transition-colors"
              style={glassInput}
              onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Your Level</label>
            <select
              value={creatorLevel}
              onChange={e => setCreatorLevel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-white text-sm focus:outline-none transition-colors appearance-none cursor-pointer"
              style={{ ...glassInput, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              {CREATOR_LEVELS.map(l => (
                <option key={l.value} value={l.value} style={{ background: '#0D1B2A' }}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-600">
              {CREATOR_LEVELS.find(l => l.value === creatorLevel)?.hint}
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

        <div className="mt-5">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: '#0EA4E9' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
