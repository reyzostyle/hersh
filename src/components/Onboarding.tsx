import { useState, useEffect } from 'react';
import { FUNCTIONS_URL, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RefreshOutlineIcon as Loader2, ArrowLeftOutlineIcon as ArrowLeft, ArrowRightOutlineIcon as ArrowRight, CupOutlineIcon as Trophy, LeafOutlineIcon as Sprout, RocketOutlineIcon as Rocket } from '@solar-icons/react';
import { Youtube, Check } from './BrandIcons';
import { requestBrain } from '../lib/brain';

const STORAGE_KEY = 'chumoku_onboarding';

// Two questions, and neither of them can be answered wrongly.
//
// It used to be five: level, a niche picked from twelve chips, a goal, a
// description and an audience. Three of those asked someone who has not opened
// the product yet to classify their own channel, and the answers were either
// blank or aspirational - which is worse, because everything the model later
// wrote "for your channel" was written for the channel they described rather
// than the one they run.
//
// A level and a couple of sentences is all anyone can get right on day one.
// Everything the prompts actually need - niche, format, voice, audience - is
// derived from those plus their real uploads once, at the end of this flow:
// see src/lib/brain.ts.
interface Answers {
  level: string;
  description: string;
}

const EMPTY: Answers = { level: '', description: '' };

const LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Just starting out or under a few thousand followers', icon: Sprout },
  { id: 'intermediate', label: 'Intermediate', desc: 'Posting regularly, growing, learning what works', icon: Rocket },
  { id: 'advanced', label: 'Advanced', desc: 'Established creator optimizing for scale', icon: Trophy },
];

// content steps (welcome is index 0, not counted in the progress bar)
const TOTAL_STEPS = 3;

const accent = 'var(--accent)';
// The label on a filled button. The accent is white, so `text-white` on top of
// it is an invisible label - which is exactly what every primary button in
// here rendered as until this was added. Icons inherit it through currentColor.
const onAccent = 'var(--on-accent)';
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
        // Clamped: a half-finished onboarding saved before this flow was cut
        // from five steps to two comes back pointing at a step that no longer
        // renders, and the screen would be blank with a Finish button on it.
        if (typeof parsed.step === 'number') setStep(Math.min(Math.max(parsed.step, 0), TOTAL_STEPS));
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
    // Trimmed: the stored value carries a trailing newline (see lib/supabase.ts).
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID?.trim();
    const redirectUri = `${FUNCTIONS_URL}/youtube-oauth-callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user.id}`;
  };

  const finish = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');

    const profile: Record<string, unknown> = { onboarding_completed: true };
    if (answers.level) profile.creator_level = answers.level;
    if (answers.description.trim()) profile.channel_description = answers.description.trim();

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

    // Read the channel now, while they walk into the product. Not awaited:
    // it takes a few seconds, it can fail (no channel connected, model
    // trouble), and neither of those is a reason to hold someone on a
    // finished form. It shows up in Settings under Chumoku brain, and
    // anything that needs it before then falls back to what they typed.
    requestBrain(true).catch(() => { /* Settings has a rebuild button */ });

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
            <h1 className="text-2xl font-bold text-white mb-3 text-balance">Welcome to Chumoku</h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-8 text-balance max-w-sm mx-auto">
              Two questions and a connection, so every idea and every rewrite is for your channel rather than a generic one. Takes under a minute.
            </p>
            <button onClick={next} className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: accent, color: onAccent }}>
              Let&apos;s go <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={finish} className="mt-3 text-sm text-gray-500 hover:text-gray-300 transition-colors">
              Skip for now
            </button>
          </div>
        )}

        {/* ── Level ── */}
        {step === 1 && (
          <StepShell title="Where are you at?" subtitle="So advice lands at your level instead of everyone's.">
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

        {/* ── About ── */}
        {step === 2 && (
          <StepShell title="Anything worth knowing?" subtitle="A sentence is plenty. There is no wrong answer here.">
            <textarea
              value={answers.description}
              onChange={e => set({ description: e.target.value })}
              placeholder="What you make, who it is for, what you are trying to fix. Or nothing at all - the rest gets read off your uploads."
              rows={4}
              className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none resize-none leading-relaxed"
              style={{ ...cardBase }}
              onFocus={e => { e.currentTarget.style.borderColor = accent; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </StepShell>
        )}

        {/* ── YouTube ── */}
        {step === 3 && (
          <StepShell title="Connect your YouTube" subtitle="This is what we read your channel from - your format, your voice, your numbers. You can skip it.">
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
                <button onClick={next} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: accent, color: onAccent }}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button onClick={finish} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: accent, color: onAccent }}>
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
