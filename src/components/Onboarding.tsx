import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RefreshOutlineIcon as Loader2, ArrowLeftOutlineIcon as ArrowLeft, ArrowRightOutlineIcon as ArrowRight, DollarOutlineIcon as DollarSign, FireOutlineIcon as Flame, GraphUpOutlineIcon as TrendingUp, CupOutlineIcon as Trophy, LeafOutlineIcon as Sprout, RocketOutlineIcon as Rocket, BagOutlineIcon as ShoppingBag } from '@solar-icons/react';
import { Youtube, Check } from './BrandIcons';

const STORAGE_KEY = 'hershy_onboarding';

interface Answers {
  level: string;
  niche: string;
  goal: string;
  description: string;
  audience: string;
}

const EMPTY: Answers = { level: '', niche: '', goal: '', description: '', audience: '' };

const LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Just starting out or under a few thousand followers', icon: Sprout },
  { id: 'intermediate', label: 'Intermediate', desc: 'Posting regularly, growing, learning what works', icon: Rocket },
  { id: 'advanced', label: 'Advanced', desc: 'Established creator optimizing for scale', icon: Trophy },
];

const GOALS = [
  { id: 'grow', label: 'Grow my audience', icon: TrendingUp },
  { id: 'monetize', label: 'Monetize my content', icon: DollarSign },
  { id: 'viral', label: 'Go viral', icon: Flame },
  { id: 'sell', label: 'Sell a product or service', icon: ShoppingBag },
];

const GOAL_IDS = GOALS.map(g => g.id);

const NICHE_PRESETS = [
  'Finance', 'Fitness', 'Education', 'Tech', 'Gaming', 'Beauty',
  'Food', 'Comedy', 'Motivation', 'Business', 'Travel', 'Lifestyle',
];

// content steps (welcome is index 0, not counted in the progress bar)
const TOTAL_STEPS = 5;

const accent = 'var(--accent)';
// No backdrop-filter: blur over the static app background caused Chromium
// ghost bands on sibling repaints; the blue underlay replaces its tint.
const cardBase: React.CSSProperties = {
  background:
    'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.04)), linear-gradient(180deg, rgba(var(--glass-tint-rgb),0.05), rgba(var(--glass-tint-rgb),0.03))',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { user, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [ytConnected, setYtConnected] = useState(false);
  const [ytChannel, setYtChannel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Hydrate saved progress (survives the YouTube OAuth redirect round-trip).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.answers) setAnswers({ ...EMPTY, ...parsed.answers });
        if (typeof parsed.step === 'number') setStep(parsed.step);
      }
    } catch { /* ignore */ }

    // Returning from YouTube OAuth?
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube_connected') === 'true') {
      setStep(TOTAL_STEPS); // YouTube step
      window.history.replaceState({}, '', '/');
    }
    if (params.get('youtube_error')) {
      setError('YouTube connection failed. You can connect it later in Settings.');
      setStep(TOTAL_STEPS);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Check current YouTube connection state.
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_tokens')
      .select('youtube_channel_name, access_token')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.youtube_channel_name && data.access_token) {
          setYtConnected(true);
          setYtChannel(data.youtube_channel_name);
        }
      });
  }, [user?.id]);

  // Persist progress on every change.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, answers }));
  }, [step, answers]);

  const set = (patch: Partial<Answers>) => setAnswers(a => ({ ...a, ...patch }));

  const connectYouTube = () => {
    if (!user?.id) return;
    // persist before leaving the page
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: TOTAL_STEPS, answers }));
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/youtube-oauth-callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user.id}`;
  };

  const finish = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');

    const profile: Record<string, unknown> = { onboarding_completed: true };
    if (answers.level) profile.creator_level = answers.level;
    if (answers.niche.trim()) profile.channel_niche = answers.niche.trim();
    if (answers.goal) profile.goal = answers.goal;
    if (answers.description.trim()) profile.channel_description = answers.description.trim();
    if (answers.audience.trim()) profile.target_audience = answers.audience.trim();

    // A stale session makes every write fail with an opaque error; refresh
    // first so a long-idle tab can still finish onboarding.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      await supabase.auth.refreshSession();
    }

    const { data: existing, error: selErr } = await supabase
      .from('user_tokens').select('user_id').eq('user_id', user.id).maybeSingle();

    const { error: err } = selErr
      ? { error: selErr }
      : existing
      ? await supabase.from('user_tokens').update(profile).eq('user_id', user.id)
      : await supabase.from('user_tokens').insert({ user_id: user.id, access_token: '', refresh_token: '', ...profile });

    setSaving(false);
    if (err) { setError(`Could not save (${err.message}). Try again, or sign out below and log back in.`); return; }
    localStorage.removeItem(STORAGE_KEY);
    onDone();
  };

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const back = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(160deg, rgb(var(--surface-rgb)) 0%, rgb(var(--surface-rgb)) 100%)' }}
    >
      <div className="w-full max-w-lg">
        {/* progress */}
        {step > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Step {step} of {TOTAL_STEPS}</span>
              <button onClick={finish} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                Skip all
              </button>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%`, background: 'var(--process)' }}
              />
            </div>
          </div>
        )}

        {/* ── Welcome ── */}
        {step === 0 && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-3 text-balance">Welcome to Hershy</h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-8 text-balance max-w-sm mx-auto">
              Answer a few quick questions so every analysis and idea is tailored to your channel. Takes under a minute.
            </p>
            <button onClick={next} className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2" style={{ background: accent }}>
              Let&apos;s go <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={finish} className="mt-3 text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Skip for now
            </button>
          </div>
        )}

        {/* ── Level ── */}
        {step === 1 && (
          <StepShell title="What's your level?" subtitle="So advice matches where you are.">
            <div className="space-y-3">
              {LEVELS.map(l => {
                const Icon = l.icon;
                const active = answers.level === l.id;
                return (
                  <button key={l.id} onClick={() => set({ level: l.id })} className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                    style={{ ...cardBase, borderColor: active ? accent : 'rgba(255,255,255,0.08)', background: active ? 'rgba(var(--accent-rgb),0.08)' : cardBase.background }}>
                    <Icon className="w-5 h-5 flex-shrink-0" style={{ color: active ? accent : '#94a3b8' }} />
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm">{l.label}</p>
                      <p className="text-gray-500 text-xs">{l.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </StepShell>
        )}

        {/* ── Niche ── */}
        {step === 2 && (() => {
          // Multi-select up to 3: the niche string is the comma-joined list, so
          // chips and free typing stay in sync (typed text counts as a part too).
          const parts = answers.niche.split(',').map(p => p.trim()).filter(Boolean);
          const atCap = parts.length >= 3;
          const toggle = (n: string) => {
            const has = parts.includes(n);
            if (!has && atCap) return;
            const nextParts = has ? parts.filter(p => p !== n) : [...parts, n];
            set({ niche: nextParts.join(', ') });
          };
          return (
            <StepShell title="What's your niche?" subtitle="Pick up to 3 or type your own.">
              {/* Fixed grid (12 presets = 3×4 mobile, 4×3 desktop) so a wrap
                  never strands a single chip on its own row */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                {NICHE_PRESETS.map(n => {
                  const active = parts.includes(n);
                  const dimmed = !active && atCap;
                  return (
                    <button key={n} onClick={() => toggle(n)} className="w-full px-2 py-1.5 rounded-full text-sm text-center whitespace-nowrap transition-all"
                      style={{ ...cardBase, borderColor: active ? accent : 'rgba(255,255,255,0.08)', background: active ? 'rgba(var(--accent-rgb),0.12)' : cardBase.background, color: active ? '#fff' : '#cbd5e1', opacity: dimmed ? 0.4 : 1, cursor: dimmed ? 'default' : 'pointer' }}>
                      {n}
                    </button>
                  );
                })}
              </div>
              <input
                value={answers.niche}
                onChange={e => set({ niche: e.target.value })}
                placeholder="Or describe your niche…"
                className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none"
                style={{ ...cardBase }}
                onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
            </StepShell>
          );
        })()}

        {/* ── Goal ── */}
        {step === 3 && (
          <StepShell title="What's your main goal?" subtitle="We'll prioritize what gets you there.">
            <div className="grid grid-cols-2 gap-3 mb-4">
              {GOALS.map(g => {
                const Icon = g.icon;
                const active = answers.goal === g.id;
                return (
                  <button key={g.id} onClick={() => set({ goal: g.id })} className="flex flex-col items-start gap-3 p-4 rounded-2xl text-left transition-all"
                    style={{ ...cardBase, borderColor: active ? accent : 'rgba(255,255,255,0.08)', background: active ? 'rgba(var(--accent-rgb),0.08)' : cardBase.background }}>
                    <Icon className="w-5 h-5" style={{ color: active ? accent : '#94a3b8' }} />
                    <span className="text-white font-medium text-sm text-balance">{g.label}</span>
                  </button>
                );
              })}
            </div>
            <input
              value={GOAL_IDS.includes(answers.goal) ? '' : answers.goal}
              onChange={e => set({ goal: e.target.value })}
              placeholder="Or write your own goal…"
              className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none"
              style={{ ...cardBase }}
              onFocus={e => { e.currentTarget.style.borderColor = accent; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </StepShell>
        )}

        {/* ── About channel ── */}
        {step === 4 && (
          <StepShell title="Tell us about your channel" subtitle="Optional, but makes analysis sharper.">
            <div className="space-y-3">
              <textarea
                value={answers.description}
                onChange={e => set({ description: e.target.value })}
                placeholder="What's your channel about? (content style, format…)"
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none resize-none"
                style={{ ...cardBase }}
                onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
              <textarea
                value={answers.audience}
                onChange={e => set({ audience: e.target.value })}
                placeholder="Who's your target audience?"
                rows={2}
                className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none resize-none"
                style={{ ...cardBase }}
                onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
            </div>
          </StepShell>
        )}

        {/* ── YouTube ── */}
        {step === 5 && (
          <StepShell title="Connect your YouTube" subtitle="Unlocks channel-aware analysis. You can skip this.">
            {ytConnected ? (
              <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ ...cardBase, borderColor: 'rgba(var(--ok-rgb),0.3)', background: 'rgba(var(--ok-rgb),0.08)' }}>
                <Check className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-white text-sm font-medium">Connected</p>
                  {ytChannel && <p className="text-gray-400 text-xs">{ytChannel}</p>}
                </div>
              </div>
            ) : (
              // Tinted rather than solid YouTube red: the same treatment the
              // Discord link in ErrorNotice uses, so a third-party brand reads
              // as one action among ours instead of a slab of someone else's
              // colour. It is also an optional step, and a full-bleed red
              // button outshouts Finish, which is the primary action here.
              <button
                onClick={connectYouTube}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: 'rgba(255,0,0,0.11)',
                  border: '1px solid rgba(255,0,0,0.28)',
                  color: '#ff8080',
                }}
              >
                <Youtube className="w-4 h-4" /> Connect YouTube
              </button>
            )}
          </StepShell>
        )}

        {error && (
          <div className="mt-4 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => { localStorage.removeItem(STORAGE_KEY); signOut(); }}
              className="mt-2 text-xs text-gray-500 hover:text-gray-300 underline decoration-gray-700 underline-offset-2 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}

        {/* nav */}
        {step > 0 && (
          <div className="flex items-center gap-3 mt-8">
            <button onClick={back} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex-1" />
            {step < TOTAL_STEPS ? (
              <>
                <button onClick={next} className="px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white transition-colors">
                  Skip
                </button>
                <button onClick={next} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: accent }}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={finish} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Finish
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-1.5 text-balance">{title}</h1>
      <p className="text-gray-400 text-sm mb-6 text-balance">{subtitle}</p>
      {children}
    </div>
  );
}
