import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, Loader2, Check, User, Tv, Youtube, Lock } from 'lucide-react';

type SettingsTab = 'profile' | 'niche';

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  return (
    <div className="px-6 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      <p className="text-gray-500 mb-6">Manage your account, channel context, and subscription.</p>

      <div className="flex gap-1 mb-8 bg-[#1A1A1A] rounded-lg p-1 border border-gray-800 w-fit">
        {([
          { id: 'profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
          { id: 'niche', label: 'Niche & Context', icon: <Tv className="w-3.5 h-3.5" /> },
        ] as { id: SettingsTab; label: string; icon: React.ReactNode }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-[#212121] text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <ProfileTab user={user} />}
      {activeTab === 'niche' && <NicheTab userId={user?.id} />}
    </div>
  );
}

function ProfileTab({ user }: { user: any }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [hasYouTube, setHasYouTube] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.resolve(
      supabase
        .from('user_tokens')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle()
    )
      .then(({ data }) => setHasYouTube(!!data))
      .catch(() => setHasYouTube(false));
  }, [user?.id]);

  const changePassword = async () => {
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1A1A1A] rounded-xl border border-gray-800 p-5">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          Account
        </h2>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Email</label>
          <div className="px-4 py-2.5 bg-[#212121] border border-gray-800 rounded-lg text-gray-400 text-sm">
            {user?.email}
          </div>
        </div>
      </div>

      <div className="bg-[#1A1A1A] rounded-xl border border-gray-800 p-5">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-400" />
          Change Password
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full px-4 py-2.5 bg-[#212121] border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:border-[#0EA4E9] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-4 py-2.5 bg-[#212121] border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:border-[#0EA4E9] focus:outline-none"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={changePassword}
            disabled={saving || !newPassword}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0EA4E9] text-white rounded-lg text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Password Updated!' : 'Update Password'}
          </button>
        </div>
      </div>

      <div className="bg-[#1A1A1A] rounded-xl border border-gray-800 p-5">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Youtube className="w-4 h-4 text-gray-400" />
          Connected YouTube Account
        </h2>
        {hasYouTube === null ? (
          <div className="h-8 flex items-center"><Loader2 className="w-4 h-4 text-gray-500 animate-spin" /></div>
        ) : hasYouTube ? (
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm text-gray-300">YouTube account connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-gray-600" />
            <span className="text-sm text-gray-500">No YouTube account connected</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NicheTab({ userId }: { userId?: string }) {
  const [channelNiche, setChannelNiche] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('user_tokens')
      .select('channel_niche, channel_description')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setChannelNiche(data.channel_niche || '');
          setChannelDescription(data.channel_description || '');
        }
        setLoading(false);
      });
  }, [userId]);

  const save = async () => {
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('user_tokens')
      .update({ channel_niche: channelNiche, channel_description: channelDescription })
      .eq('user_id', userId);
    setSaving(false);
    if (err) {
      setError('Failed to save');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 text-[#0EA4E9] animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#1A1A1A] rounded-xl border border-gray-800 p-5">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-white mb-1">Niche & Context</h2>
          <p className="text-sm text-gray-500">
            This information is included in every AI analysis to make recommendations more relevant to your channel.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Channel Niche</label>
            <input
              type="text"
              value={channelNiche}
              onChange={e => setChannelNiche(e.target.value)}
              placeholder="e.g. Personal finance for millennials, fitness & weight loss, tech reviews..."
              className="w-full px-4 py-2.5 bg-[#212121] border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:border-[#0EA4E9] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Channel Description</label>
            <textarea
              value={channelDescription}
              onChange={e => setChannelDescription(e.target.value)}
              placeholder="Describe your channel, content style, tone, and target audience. The more detail you give, the better the analysis."
              rows={4}
              className="w-full px-4 py-3 bg-[#212121] border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:border-[#0EA4E9] focus:outline-none resize-none leading-relaxed"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

        <div className="mt-5">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0EA4E9] text-white rounded-lg text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

