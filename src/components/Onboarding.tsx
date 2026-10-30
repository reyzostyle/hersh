import { useState, useEffect, useRef } from 'react';
import { FUNCTIONS_URL, supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RefreshOutlineIcon as Loader2, ArrowLeftOutlineIcon as ArrowLeft } from '@solar-icons/react';
import { Youtube } from './BrandIcons';
import { requestBrain } from '../lib/brain';

// The first minutes after signing up (rewritten 2026-10-30, same three steps
// as the iOS app's OnboardingView).
//
// It was four screens: a welcome, a level, a sentence about yourself and
// YouTube. The brain reads level, niche and voice off the uploads better than
// anyone describes them, so the one question left is the connection. Without a
// channel, one line about what they make stands in for it. Then their own
// Shorts appear while the brain is read, which is the moment the product shows
// it is about them, and they walk into ideas that already are.

const STORAGE_KEY = 'chumoku_onboarding';

type Step = 'connect' | 'describe' | 'reading' | 'ready';

const accent = 'var(--accent)';
const onAccent = 'var(--on-accent)';
const cardBase: React.CSSProperties = {
  background:
    'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.04)), linear-gradient(180deg, rgba(var(--glass-tint-rgb),0.05), rgba(var(--glass-tint-rgb),0.03))',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { user, signOut } = useAuth();
  const [step, setStep] = useState<Step>('connect');
  const [about, setAbout] = useState('');
  const [ytChannel, setYtChannel] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  // Back from Google's consent screen: straight to reading the channel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube_connected') === 'true') {
      window.history.replaceState({}, '', '/');
      read();
    } else if (params.get('youtube_error')) {
      window.history.replaceState({}, '', '/');
      setError('YouTube did not connect. Try again, or go on without it.');
    }
    // read() is stable enough here: it runs once, on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Already connected (from Settings, or an earlier attempt): say so.
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_tokens')
      .select('youtube_channel_name, access_token')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.youtube_channel_name && data.access_token) setYtChannel(data.youtube_channel_name);
      });
  }, [user?.id]);

  const connectYouTube = () => {
    if (!user?.id) return;
    // Trimmed: the stored value carries a trailing newline (see lib/supabase.ts).
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID?.trim();
    const redirectUri = `${FUNCTIONS_URL}/youtube-oauth-callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user.id}`;
  };

  // build-brain saves the channel scan before the model starts writing, so
  // polling the scan shows their Shorts within a few seconds of starting.
  const loadThumbs = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('user_tokens').select('channel_scan').eq('user_id', user.id).maybeSingle();
    const ids = ((data?.channel_scan as { videos?: { id?: string }[] } | null)?.videos ?? [])
      .map(v => v.id).filter((id): id is string => !!id).slice(0, 9);
    setThumbs(prev => {
      const next = [...prev];
      for (const id of ids) {
        const url = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        if (!next.includes(url)) next.push(url);
      }
      return next;
    });
  };

  const read = async () => {
    if (started.current) return;
    started.current = true;
    setError('');
    setStep('reading');
    const poll = setInterval(loadThumbs, 1500);
    const result = await requestBrain(true).catch(() => null);
    clearInterval(poll);
    await loadThumbs();
    // Long enough to see their Shorts land when the build was quick.
    await new Promise(r => setTimeout(r, 1200));
    setSummary(result?.brain?.summary ?? null);
    setStep('ready');
  };

  const saveAbout = async () => {
    if (!user?.id || !about.trim()) return;
    const { error: err } = await supabase.from('user_tokens')
      .update({ channel_description: about.trim() }).eq('user_id', user.id);
    if (err) { setError(`Could not save that (${err.message}). Try again.`); return; }
    read();
  };

  const finish = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');
    // A stale session makes every write fail with an opaque error; refresh
    // first so a long-idle tab can still finish onboarding.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) await supabase.auth.refreshSession();
    const { data: existing, error: selErr } = await supabase
      .from('user_tokens').select('user_id').eq('user_id', user.id).maybeSingle();
    const { error: err } = selErr
      ? { error: selErr }
      : existing
      ? await supabase.from('user_tokens').update({ onboarding_completed: true }).eq('user_id', user.id)
      : await supabase.from('user_tokens').insert({ user_id: user.id, access_token: '', refresh_token: '', onboarding_completed: true });
    setSaving(false);
    if (err) { setError(`Could not save (${err.message}). Try again, or sign out below and log back in.`); return; }
    localStorage.removeItem(STORAGE_KEY);
    onDone();
  };

  const primary = 'w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10" style={{ background: 'rgb(var(--surface-rgb))' }}>
      <div className="w-full max-w-md">

        {step === 'connect' && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-3 text-balance">Connect your YouTube</h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-8 text-balance">
              Chumoku reads your Shorts and picks every idea for your channel. Read-only, nothing is ever posted.
            </p>
            {ytChannel ? (
              <button onClick={read} className={primary} style={{ background: accent, color: onAccent }}>
                Continue as {ytChannel}
              </button>
            ) : (
              <button onClick={connectYouTube} className={primary} style={{ background: accent, color: onAccent }}>
                <Youtube className="w-4 h-4" /> Connect YouTube
              </button>
            )}
            <button onClick={() => { setError(''); setStep('describe'); }} className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors">
              I don&apos;t have a channel yet
            </button>
          </div>
        )}

        {step === 'describe' && (
          <div>
            <button onClick={() => setStep('connect')} className="flex items-center gap-1.5 mb-6 text-sm text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-2xl font-bold text-white mb-5 text-balance">What do you make?</h1>
            <textarea
              value={about}
              onChange={e => setAbout(e.target.value)}
              placeholder="Cooking Shorts for students, gym tips, my startup..."
              rows={3}
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-white text-sm focus:outline-none resize-none leading-relaxed"
              style={{ ...cardBase }}
              onFocus={e => { e.currentTarget.style.borderColor = accent; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            <p className="mt-2 mb-8 text-xs" style={{ color: 'var(--text-faint)' }}>A sentence is enough.</p>
            <button onClick={saveAbout} disabled={!about.trim()} className={primary} style={{ background: accent, color: onAccent }}>
              Continue
            </button>
          </div>
        )}

        {step === 'reading' && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-2 text-balance">Reading your channel</h1>
            <p className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
              {thumbs.length ? 'Working out what works for you…' : 'Looking at your Shorts…'}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-7">
              {thumbs.map(src => (
                <div key={src} className="aspect-[9/16] rounded-xl overflow-hidden animate-fade-in" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'ready' && (
          <div>
            <h1 className="text-2xl font-bold text-white mb-5 text-balance">Got it</h1>
            {summary && (
              <>
                <div className="rounded-2xl px-5 py-4 text-sm leading-relaxed text-white" style={cardBase}>{summary}</div>
                <p className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
                  Every idea and script is written against this. Change it any time in Settings.
                </p>
              </>
            )}
            <button onClick={finish} disabled={saving} className={`${primary} mt-8`} style={{ background: accent, color: onAccent }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} See today&apos;s ideas
            </button>
          </div>
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
      </div>
    </div>
  );
}
