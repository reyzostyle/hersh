import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RefreshOutlineIcon as Loader2, EyeOutlineIcon as Eye, EyeClosedOutlineIcon as EyeOff, RefreshOutlineIcon as RefreshCw, LinkOutlineIcon as Link, AltArrowDownOutlineIcon as ChevronDown, Stars2OutlineIcon as Sparkles, UserOutlineIcon as User, BoltOutlineIcon as Zap, ChatRoundOutlineIcon as MessageCircle, SquareArrowRightUpOutlineIcon as ExternalLink, TicketOutlineIcon as Ticket, CpuBoltOutlineIcon as Brain, HandShakeOutlineIcon as Handshake, ArrowRightUpOutlineIcon as ArrowUpRight } from '@solar-icons/react';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';

import { requestBrain, type ChannelBrain } from '../lib/brain';
import { displayNameOf } from '../lib/user';
import { PageHead, Row, Loading } from './Page';

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

// Grouped settings section: the app's row, opened rather than followed.
//
// It used to be its own object - a glass card with a 2xl radius and an icon
// tile at a size nothing else used - which is how Settings, the hub and
// Projects ended up as three different-looking lists of the same thing. The
// plate, the tile and the measure are now `.row` / `.row-group` (index.css),
// shared with everything else.
//
// The sentence under each title is new. A row of six words told you nothing
// about what was behind it, and the one screen where people go looking for a
// setting is the worst place to make them open all six to find out.
function SettingsCard({ icon, iconBg, title, subtitle, open, onToggle, children }: {
  icon: React.ReactNode; iconBg: string; title: string; subtitle: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="row-group">
      <button onClick={onToggle} className="row" aria-expanded={open}>
        <span className="row-icon" style={{ background: iconBg }}>{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-medium" style={{ color: 'var(--text)' }}>{title}</span>
          <span className="block text-[13px] leading-relaxed mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</span>
        </span>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 row-chevron"
          style={{ color: 'var(--text-faint)', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open && <div className="row-group-body">{children}</div>}
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
// The affiliate tab is now identical for every account, admin included, so the
// partner-management list needs its own door. Same mechanism as ADMIN: the code
// is a shortcut, not the security - the endpoint behind it checks the email.
const PARTNERS_CODE = 'PARTNERS';
const PLAN_CACHE_KEY = 'chumoku_last_plan';

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

  // Channel context state. Niche and audience are no longer typed by anyone -
  // the brain derives them and writes them back to the same columns, which is
  // what keeps competitor search working for accounts that never filled them
  // in. See supabase/functions/_shared/brain.ts.
  const [channelDescription, setChannelDescription] = useState('');
  const [creatorLevel, setCreatorLevel] = useState('intermediate');

  // The brain
  const [brain, setBrain] = useState<ChannelBrain | null>(null);
  const [brainAt, setBrainAt] = useState<string | null>(null);
  const [brainBuilding, setBrainBuilding] = useState(false);
  const [brainError, setBrainError] = useState('');
  const [loading, setLoading] = useState(true);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);
  const [contextError, setContextError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  // Display name. Lives on the auth user rather than in a column of our own:
  // Google already puts a real name there at sign-in, so most accounts have one
  // without ever opening this field, and no migration was needed to read it.
  const [displayName, setDisplayName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');

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
      window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'admin' }));
      return;
    }
    if (user?.email === ADMIN_EMAIL && code.toUpperCase() === PARTNERS_CODE) {
      setRedeemMsg(null);
      setRedeemCode('');
      window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'affiliate-admin' }));
      return;
    }
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const token = await getSessionToken();
      const res = await fetchWithRetry('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/redeem-code', {
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
    setDisplayName(displayNameOf(user));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_tokens')
          .select('updated_at, access_token, plan, youtube_channel_name, youtube_channel_thumbnail, channel_description, creator_level, brain, brain_at')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        // A failed read leaves every field at its empty default, and Save
        // would then write those empties over a profile that is perfectly
        // fine. Say so and refuse to save instead.
        if (error) setLoadFailed(true);

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
        setChannelDescription(data?.channel_description || '');
        setCreatorLevel(data?.creator_level || 'intermediate');
        setBrain((data?.brain as ChannelBrain) ?? null);
        setBrainAt(data?.brain_at ?? null);
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

  // One button, two things: the two fields go to the row, and the brain is
  // rebuilt off them. Saving a profile and then having to notice a second
  // control that makes the profile count would be a trap - the whole point of
  // cutting this screen down to two fields is that there is nothing left to
  // get wrong.
  const saveContext = async () => {
    setContextSaving(true);
    setContextError('');
    const { data: existing } = await supabase
      .from('user_tokens')
      .select('user_id')
      .eq('user_id', user?.id)
      .maybeSingle();
    const patch = { channel_description: channelDescription, creator_level: creatorLevel };
    let err;
    if (existing) {
      ({ error: err } = await supabase
        .from('user_tokens')
        .update(patch)
        .eq('user_id', user?.id));
    } else {
      ({ error: err } = await supabase
        .from('user_tokens')
        .insert({ user_id: user?.id, ...patch, access_token: '', refresh_token: '' }));
    }
    setContextSaving(false);
    if (err) {
      setContextError('Failed to save: ' + err.message);
      return;
    }
    setContextSaved(true);
    setTimeout(() => setContextSaved(false), 2500);
    buildBrain(true);
  };

  const buildBrain = async (force: boolean) => {
    setBrainBuilding(true);
    setBrainError('');
    const result = await requestBrain(force);
    setBrainBuilding(false);
    if (result.error) { setBrainError(result.error); return; }
    if (result.brain) {
      setBrain(result.brain);
      setBrainAt(new Date().toISOString());
    } else if (result.reason === 'nothing_to_read') {
      setBrainError('Nothing to read yet. Say a line about yourself above, or connect your channel.');
    }
  };

  const saveDisplayName = async () => {
    setNameSaving(true);
    setNameError('');
    const { error: err } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
    setNameSaving(false);
    if (err) { setNameError(err.message); return; }
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    setPwSaving(true);
    setPwError('');
    // Re-authenticating needs an address to re-authenticate. There is always
    // one on a signed-in account, but the session type does not promise it,
    // and a password change is the wrong place to send `undefined` and find
    // out what the API makes of it.
    if (!user?.email) { setPwSaving(false); setPwError('Could not confirm your account'); return; }
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
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
      const res = await fetchWithRetry(`https://ezlousklksipvwuinpzq.supabase.co/functions/v1/cancel-subscription`, {
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

  // The same 10px between cards that the hub and Projects use between rows -
  // they are the same object now, so they stack the same way.
  // The whole list waits for the one query behind it and then arrives at once.
  // Before, each card decided for itself when it was ready: the profile spun
  // inside its own card, YouTube spun inside its, and Subscription did not
  // exist until `plan` landed - so opening Settings was three or four things
  // appearing at different moments and pushing each other down the page. They
  // all come from a single row in a single request; there was never a reason
  // for them to arrive separately.
  return (
    <div className="sheet min-h-full max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-20">

      <div className="hidden lg:block">
        <PageHead eyebrow="Settings" title="Your account" subtitle="Your channel profile, your connections, and your subscription." />
      </div>

      {loading ? <Loading /> : (
      <div className="space-y-2.5 animate-fade-in">

      {/* ── Channel profile ── */}
      {/* Two fields, and neither of them can be filled in wrongly.
          It was five: a level, a niche picked from twelve chips or typed, a
          description, and an audience. Every one of them was a chance to
          describe the channel you mean to run rather than the one you run, and
          a wrong profile is worse than an empty one - it steers every adapted
          idea at a channel that does not exist. Most people left them blank
          anyway. What the prompts need is derived from these two plus the
          uploads: see the brain below. */}
      <SettingsCard
        {...cardProps('profile')}
        icon={<Sparkles className="w-[18px] h-[18px] text-[var(--accent)]" />}
        iconBg="rgba(var(--accent-rgb),0.12)"
        title="Channel profile"
        subtitle="Where you are, and anything you want us to know."
      >
        {(
          <div className="space-y-4">
            <div>
              <FieldLabel>Where you are</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {CREATOR_LEVELS.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    className="chip"
                    data-on={creatorLevel === l.value}
                    onClick={() => setCreatorLevel(l.value)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
                {CREATOR_LEVELS.find(l => l.value === creatorLevel)?.hint}
              </p>
            </div>

            <div>
              <FieldLabel>Anything worth knowing</FieldLabel>
              <textarea
                value={channelDescription}
                onChange={e => setChannelDescription(e.target.value)}
                placeholder="Whatever you want us to know - what you make, who it is for, what you are trying to fix. A sentence is enough."
                rows={3}
                className="glass-field w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none resize-none leading-relaxed transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              <p className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
                There is no wrong answer here. Whatever you leave out is read off your uploads.
              </p>
            </div>

            {(contextError || loadFailed) && (
              <p className="text-red-400 text-sm">
                {contextError || 'Could not read your profile just now, so saving is off to avoid writing over it. Reload the page.'}
              </p>
            )}

            <button
              onClick={saveContext}
              disabled={contextSaving || loadFailed}
              className="w-full py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {contextSaving ? 'Saving...' : contextSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        )}
      </SettingsCard>

      {/* ── The brain ── */}
      <SettingsCard
        {...cardProps('brain')}
        /* Not the process green, however tempting on an icon called brain:
           green in this product means something is running or something
           worked, and spending it on a permanent tile is exactly how a colour
           with one meaning stops having one. */
        icon={<Brain className="w-[18px] h-[18px]" style={{ color: 'var(--text)' }} />}
        iconBg="rgba(255,255,255,0.05)"
        title="Chumoku brain"
        subtitle="What we worked out about your channel, and what every idea is written against."
      >
        <BrainCard
          brain={brain}
          builtAt={brainAt}
          loading={brainBuilding}
          error={brainError}
          onBuild={() => buildBrain(true)}
        />
      </SettingsCard>

      {/* ── YouTube account ── */}
      <SettingsCard
        {...cardProps('youtube')}
        icon={<YouTubeLogo className="w-[18px] h-[18px] text-red-500" />}
        iconBg="rgba(255,0,0,0.1)"
        title="YouTube account"
        subtitle="Your own numbers, your own videos, and a read of what you publish."
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
        icon={<User className="w-[18px] h-[18px]" style={{ color: 'var(--text)' }} />}
        iconBg="rgba(255,255,255,0.05)"
        title="Account"
        subtitle="The email you signed in with, and your password."
      >
        <div className="space-y-5">
          {/* The hub used to greet people by the part of their email before the
              @, which is how someone ends up being called kirill.dev2024 every
              time they open the product. */}
          <div>
            <FieldLabel>Name</FieldLabel>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="What we should call you"
                maxLength={40}
                className="glass-field flex-1 min-w-0 px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              <button
                onClick={saveDisplayName}
                disabled={nameSaving || !displayName.trim()}
                className="px-4 py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {nameSaving ? 'Saving...' : nameSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-red-400 text-sm mt-2">{nameError}</p>}
            <p className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
              Used where the product speaks to you, starting with the hub.
            </p>
          </div>

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
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
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
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
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
          /* Amber, the colour this product already uses for the one thing
             that is about money - the Upgrade link in the sidebar. Not the
             process green: green here means something is running or something
             worked (a connected account, a finished bar), and spending it on a
             permanent tile is how a colour with one meaning stops having one. */
          icon={<Zap className="w-[18px] h-[18px]" style={{ color: 'var(--upgrade)' }} />}
          iconBg="rgba(245,196,81,0.12)"
          title="Subscription"
          subtitle="What you are on, and how to change it."
        >
          {/* Plan summary with an accent badge — distinct from the other cards */}
          <div className="rounded-xl px-4 py-3.5 flex items-center justify-between gap-3" style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.18)' }}>
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
                : { background: 'rgba(var(--ok-rgb),0.15)', color: '#34D399' }}
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

      {/* ── Affiliate ── */}
      {/* A door, not a drawer. The page behind it is a claim flow, a link, a
          stats table and a payout form - too much to unfold inside a settings
          card, and it used to hold a permanent slot in the sidebar next to the
          four tools for something nobody opens daily. */}
      <Row
        icon={<Handshake className="w-[18px] h-[18px]" />}
        title="Affiliate"
        subtitle="Your link, who signed up through it, and what it has paid."
        arrow={<ArrowUpRight className="w-4 h-4 row-arrow" />}
        onClick={() => window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'partners' }))}
      />

      {/* ── Support ── */}
      <SettingsCard
        {...cardProps('support')}
        icon={<MessageCircle className="w-[18px] h-[18px] text-[#5865F2]" />}
        iconBg="rgba(88,101,242,0.12)"
        title="Support"
        subtitle="Where to reach us, and what to send so it can be answered."
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
        icon={<Ticket className="w-[18px] h-[18px]" style={{ color: 'var(--upgrade)' }} />}
        iconBg="rgba(245,196,81,0.12)"
        title="Redeem code"
        subtitle="A code from Discord or a partner goes in here."
      >
        <div className="flex items-center gap-2">
          <input
            value={redeemCode}
            onChange={e => { setRedeemCode(e.target.value); setRedeemMsg(null); }}
            onKeyDown={e => { if (e.key === 'Enter') redeem(); }}
            placeholder="Enter a code"
            className="glass-field flex-1 px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
            style={glassInput}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
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
      )}
    </div>
  );
}

// ─── The brain, on screen ────────────────────────────────────────────────────
// The profile the model wrote, shown to the person it is about.
//
// It could have stayed invisible - nothing in the product needs the creator to
// read it. But a profile that silently steers every adapted idea, that nobody
// can see and nobody can correct, is the same trap as the four boxes it
// replaced, only harder to argue with. Shown, it is checkable: if it has the
// channel wrong, the fix is a line in the box above and a rebuild.
function BrainCard({ brain, builtAt, loading, error, onBuild }: {
  brain: ChannelBrain | null;
  builtAt: string | null;
  loading: boolean;
  error: string;
  onBuild: () => void;
}) {
  const Field = ({ label, value }: { label: string; value: string }) =>
    value ? (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{value}</p>
      </div>
    ) : null;

  const List = ({ label, items }: { label: string; items: string[] }) =>
    items?.length ? (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <ul className="space-y-1.5">
          {items.map((x, i) => (
            <li key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--text-faint)' }}>-</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {brain ? (
        <>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{brain.summary}</p>
          <Field label="Niche" value={brain.niche} />
          <Field label="Format" value={brain.format} />
          <Field label="Audience" value={brain.audience} />
          <Field label="Voice" value={brain.voice} />
          <List label="What already works" items={brain.strengths} />
          <List label="What we will not suggest" items={brain.watch_outs} />
          <List label="How ideas get remade for you" items={brain.adapt_rules} />
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {brain.source === 'uploads'
              ? 'Read off your last uploads and what you wrote.'
              : 'Written from what you wrote. Connect your channel and this gets read off your real uploads instead.'}
            {builtAt && ` Built ${new Date(builtAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`}
          </p>
        </>
      ) : (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Nothing here yet. Build it and every idea, outline and rewrite after that is
          written for your channel instead of for a generic one.
        </p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={onBuild}
        disabled={loading}
        className="w-full py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Reading your channel' : brain ? 'Rebuild' : 'Build it'}
      </button>
    </div>
  );
}
