import { useState, useEffect, useRef } from 'react';

import {
  CloseCircleOutlineIcon as X,
  RefreshOutlineIcon as Loader2,
  AltArrowRightOutlineIcon as ChevronRight,
  AltArrowDownOutlineIcon as ChevronDown,
  ArrowUpOutlineIcon as ArrowUp,
  ArrowRightUpOutlineIcon as ArrowUpRight,
  AddOutlineIcon as Plus,
  LetterOutlineIcon as Mail,
  VideocameraOutlineIcon as VideoIcon,
  FolderOutlineIcon as Folder,
  GraphUpOutlineIcon as GraphUp,
  UsersGroupRoundedOutlineIcon as Users,
  HamburgerMenuOutlineIcon as Menu,
} from '@solar-icons/react';
import { Check } from './BrandIcons';
import { useAuth } from '../contexts/AuthContext';
import { HeroAnalysisGate } from './HeroAnalysisGate';
import { supabase } from '../lib/supabase';
import { SUPPORT_EMAIL } from '../lib/brand';
import { FAQS } from '../lib/faq';

// ─── Surface ─────────────────────────────────────────────────────────────────
// This page used to run on three bespoke `glass` objects: stacked white
// gradients, inset highlights, a 34px drop shadow, and a blue-tinted variant
// for the hero field. None of them exist in the product. A visitor signing up
// went from a page made of frosted panels to an app made of flat plates with a
// hairline, which is why the landing read as a different piece of software than
// the thing it was selling.
//
// There is one plate now, and it is the app's: --bg-raised, one --line
// hairline, one radius token. Same object as Panel in Page.tsx.
const plate: React.CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
};

// The app's composer shell (AnalysisChat.tsx) — larger radius, same plate.
const composer: React.CSSProperties = {
  background: 'var(--bg-raised)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-lg)',
};

const inputReset: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
};

// ONE column, ONE gutter, on every section — the same pair Page.tsx sets for
// every tab in the app, so the left edge of this page and the left edge of the
// product land on the same place. Sections used to run at max-w-4xl with px-6
// while the app ran max-w-5xl with px-5/px-8.
const SECTION = 'w-full max-w-5xl mx-auto px-5 sm:px-8';

// The icon set has no brand marks, so the real Discord glyph is inlined here
// (official logo path, viewBox 0 0 24 24) rather than standing in with a
// generic chat-bubble icon.
function DiscordIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.419-2.157 2.419z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ─── Scroll reveal ────────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// Was 28px of travel over 600ms, which is a slide, and a slide on every block
// is the tell that a page is animated rather than designed. 10px over 500ms:
// the section settles, it does not arrive.
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Auth modal ───────────────────────────────────────────────────────────────

function AuthModal({ initialMode, onClose, context }: {
  initialMode: 'login' | 'signup';
  onClose: () => void;
  // Set when the form is raised at the end of the hero analysis, so the
  // headline answers "why am I being asked this" instead of introducing the
  // product to someone who is already five steps in.
  context?: { title: string; sub: string };
}) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
        setEmailSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    setLoading(false);
    if (err) setError(err.message);
    else setResetSent(true);
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try { await signInWithGoogle(); }
    catch (err) { setError(err instanceof Error ? err.message : 'An error occurred'); setGoogleLoading(false); }
  };

  // One field style for every input in the modal, on the same plate the rest of
  // the page uses. Focus moves the hairline to --line-strong rather than
  // painting a white border, which at this accent would be a glowing box.
  const fieldProps = {
    className: 'w-full px-4 py-2.5 rounded-[var(--r-sm)] text-sm',
    style: { background: 'var(--bg-app)', border: '1px solid var(--line)', outline: 'none', color: 'var(--text)' },
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--line-strong)'; },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--line)'; },
  };

  const primaryBtn = 'w-full py-2.5 rounded-[var(--r-sm)] font-semibold text-sm disabled:opacity-50';
  const primaryStyle = { background: 'var(--accent)', color: 'var(--on-accent)' };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md p-8 animate-scale-in"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-[var(--r-sm)] transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-faint)' }}>
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <p className="text-[19px] font-semibold tracking-tight mb-1" style={{ color: 'var(--text)' }}>
            {emailSent ? 'Almost there' : mode === 'forgot' ? 'Reset password' : mode === 'login' ? 'Welcome back' : (context?.title ?? 'Start for free')}
          </p>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {emailSent ? 'Confirm your email to activate your account.' : mode === 'forgot' ? "We'll send you a reset link." : mode === 'login' ? 'Sign in to your Chumoku account.' : (context?.sub ?? 'No credit card required.')}
          </p>
        </div>

        {emailSent ? (
          <div className="text-center py-2 animate-fade-in">
            <p className="text-[15px] font-medium mb-2" style={{ color: 'var(--text)' }}>Check your email</p>
            <p className="text-[13px] mb-1" style={{ color: 'var(--text-muted)' }}>We sent a confirmation link to</p>
            <p className="text-[13px] font-medium mb-5" style={{ color: 'var(--text)' }}>{email}</p>
            <div className="p-3 mb-5 text-left" style={plate}>
              <p className="label-mono mb-1.5">One thing</p>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Open the link on <strong style={{ color: 'var(--text)' }}>this device</strong>. Clicking it on your phone while Chumoku is open on a PC will not sign you in here.
              </p>
            </div>
            <button
              onClick={() => { setEmailSent(false); setMode('login'); setPassword(''); }}
              className={`${primaryBtn} mb-3`}
              style={primaryStyle}
            >
              I confirmed my email, sign in
            </button>
            <button onClick={handleGoogle} disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-[var(--r-sm)] font-medium text-sm transition-colors disabled:opacity-50"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--line)', color: 'var(--text)' }}
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-faint)' }} /> : <GoogleMark />}
              Or continue with Google
            </button>
            <p className="text-[12px] mt-3" style={{ color: 'var(--text-faint)' }}>
              No email? Check spam or{' '}
              <button onClick={() => { setEmailSent(false); setMode('signup'); }} className="underline" style={{ color: 'var(--text-muted)' }}>try again</button>.
            </p>
          </div>
        ) : mode === 'forgot' ? (
          resetSent ? (
            <div className="text-center py-4 animate-fade-in">
              <p className="text-[15px] font-medium mb-1" style={{ color: 'var(--text)' }}>Check your email</p>
              <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>Reset link sent to {email}</p>
              <button onClick={() => { setMode('login'); setResetSent(false); }} className="text-[13px]" style={{ color: 'var(--text)' }}>Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required {...fieldProps} />
              {error && <p className="text-[13px] rounded-[var(--r-sm)] p-3" style={{ color: 'rgb(var(--danger-rgb))', background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)' }}>{error}</p>}
              <button type="submit" disabled={loading} className={primaryBtn} style={primaryStyle}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => setMode('login')} className="text-[13px] transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>Back to sign in</button>
              </div>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-3 mb-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required {...fieldProps} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required {...fieldProps} />
              {mode === 'login' && (
                <div className="text-right">
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-[12px] transition-colors hover:text-[var(--text-muted)]" style={{ color: 'var(--text-faint)' }}>
                    Forgot password?
                  </button>
                </div>
              )}
              {error && <p className="text-[13px] rounded-[var(--r-sm)] p-3" style={{ color: 'rgb(var(--danger-rgb))', background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)' }}>{error}</p>}
              <button type="submit" disabled={loading || googleLoading} className={primaryBtn} style={primaryStyle}>
                {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
              <span className="label-mono">or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--line)' }} />
            </div>

            <button onClick={handleGoogle} disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-[var(--r-sm)] font-medium text-sm disabled:opacity-50"
              style={{ background: 'var(--bg-app)', border: '1px solid var(--line)', color: 'var(--text)' }}
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-faint)' }} /> : <GoogleMark />}
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </button>

            <div className="mt-5 text-center">
              <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                className="text-[13px] transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Product frames ───────────────────────────────────────────────────────────
// Not mockups of a product, and not the four invented mini-widgets that used to
// scroll past on a marquee here. These are the real components rebuilt at a
// smaller type scale: same plate, same hairline, same label-mono, same score
// layout as AnalysisChat's AnalysisCard and Competitors' feed. If the app
// changes shape, these are wrong, and that is the correct amount of coupling
// for a page whose whole job is to show the app.

// The hero shot: the sidebar and a finished thread, exactly as Analyze renders
// it — conversation on the ruled grid, no sheet under it.
// What the thread plays, and how long each beat holds before the next lands.
// The questions are the two asked most in the Discord this was built for:
// why a video died, and whether a number is normal. Answers are short on
// purpose - the point is that an answer arrives, not that it is exhaustive.
const SCRIPT: { role: 'user' | 'working' | 'card' | 'answer' | 'shot'; text?: string; mono?: boolean; hold: number }[] = [
  { role: 'user', text: 'youtube.com/shorts/8fLq2Xr', mono: true, hold: 1200 },
  { role: 'working', text: 'Watching the whole thing', hold: 2000 },
  { role: 'card', hold: 2900 },
  { role: 'user', text: 'why did this video flop?', hold: 1300 },
  {
    role: 'answer',
    text: 'It did not flop on the idea. 41% left before 0:03, so almost nobody got to the idea. The thumbnail already showed the payoff, so the first three seconds had nothing left to promise.',
    hold: 3400,
  },
  // The screenshot is the point of this beat. YouTube shows the Shorts
  // swipe-away rate in Studio and exposes nothing like it in any API, so for a
  // whole class of question the picture IS the data - and a page that never
  // shows one never tells anybody they can send it.
  { role: 'shot', text: 'is this swipe rate ok?', hold: 1600 },
  {
    role: 'answer',
    text: 'No. 38% swiped in the first second, and your last five sat near 19%. Same hook, same opening shot, so it is the first frame doing it, not the idea.',
    hold: 4200,
  },
];

function AppFrame() {
  // Plays through SCRIPT, then holds the finished thread and starts again.
  //
  // Paused while off screen: a loop running behind the fold is a timer nobody
  // is watching, and on a phone it is battery spent on a frame below the
  // scroll. Reduced motion gets the finished thread and no animation at all,
  // which is the same information without the movement.
  const [step, setStep] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? SCRIPT.length
      : 0,
  );
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let timer: ReturnType<typeof setTimeout>;
    let visible = true;
    // The step lives in a ref as well as in state because the next timeout is
    // scheduled from it. Scheduling inside the setState updater looked tidier
    // and was wrong: React is free to call an updater more than once, and each
    // call started another timer, so several ran at once and the thread
    // skipped beats.
    let current = 0;

    const tick = () => {
      current = current >= SCRIPT.length ? 0 : current + 1;
      setStep(current);
      // Step 0 is the blank frame before it starts over, and it holds briefly.
      // Every other beat holds for as long as the message before it needs.
      const hold = current === 0 ? 900 : SCRIPT[current - 1].hold;
      timer = setTimeout(() => { if (visible) tick(); }, hold);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { clearTimeout(timer); tick(); }
      else clearTimeout(timer);
    }, { threshold: 0.15 });

    if (frameRef.current) observer.observe(frameRef.current);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  const nav = [
    { icon: <VideoIcon className="w-3.5 h-3.5" />, label: 'Analyze', on: true },
    { icon: <Folder className="w-3.5 h-3.5" />, label: 'Projects', on: false },
    { icon: <GraphUp className="w-3.5 h-3.5" />, label: 'Analytics', on: false },
    { icon: <Users className="w-3.5 h-3.5" />, label: 'Competitors', on: false },
  ];

  return (
    <div
      ref={frameRef}
      className="overflow-hidden"
      style={{ background: 'var(--bg-app)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-lg)' }}
    >
      <div className="flex" style={{ height: 'clamp(360px, 46vw, 460px)' }}>
        {/* Sidebar. Hidden on phones: at that width it would be four icons
            wide and the thread beside it unreadable, which shows off nothing. */}
        <div className="hidden sm:flex w-[168px] flex-shrink-0 flex-col py-4 px-3" style={{ borderRight: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 px-2 mb-6">
            <img src="/chumoku-mark.png" alt="" className="h-[11px] w-auto" />
            <span className="font-black uppercase tracking-[0.14em] text-[10px]" style={{ color: 'var(--text)' }}>Chumoku</span>
          </div>
          <div className="space-y-0.5">
            {nav.map(n => (
              <div
                key={n.label}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--r-sm)] text-[11.5px]"
                style={n.on
                  ? { background: 'var(--bg-raised-hover)', color: 'var(--text)' }
                  : { color: 'var(--text-faint)' }}
              >
                {n.icon}
                {n.label}
              </div>
            ))}
          </div>
          <div className="mt-auto px-2">
            <p className="label-mono">Credits</p>
            <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>284 left</p>
          </div>
        </div>

        {/* No grid inside the frame. It used to draw its own at a 56px cell
            while the hero draws the page's at 112px, so the two met at the
            frame's edge without lining up on either axis - a fine mesh sitting
            inside a coarse one, which reads as a rendering fault rather than
            as texture. The frame is a solid panel on the page's grid now, the
            same way a sheet sits on it inside the app. */}
        <div className="relative flex-1 min-w-0">
          <div className="relative h-full flex flex-col px-4 sm:px-6 pt-5 pb-4">
            {/* overflow-hidden, not just min-h-0: the frame is a fixed height
                and on a phone the card is taller than it, so without this the
                thread spilled over the composer instead of being cropped by
                the frame's edge. */}
            {/* The thread plays itself. A still screenshot of a finished
                answer shows the output and hides the thing worth showing,
                which is that this is a conversation: a link goes in, a review
                comes back, and then the questions people actually ask get
                answered without starting over.
                Timed steps rather than a video: it is a few hundred bytes of
                state, it stays sharp at any width, and it respects a reader
                who has asked for less motion. */}
            {/* justify-end, so the thread grows upward off the top edge the way
                a real one does. Left to fill from the top, the last answer -
                the one the whole sequence exists to deliver - was the message
                cropped by the frame's fixed height. */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-end space-y-3">
              {SCRIPT.slice(0, step).map((m, i) => (
                <div key={i} className="animate-msg-land">
                  {m.role === 'shot' ? (
                    /* A screenshot, sent the way people actually send one:
                       the picture first, the question under it, both inside
                       the creator's own bubble. */
                    <div className="flex justify-end">
                      <div className="max-w-[80%] flex flex-col items-end gap-1.5">
                        <div className="rounded-[12px] overflow-hidden p-2.5 w-[168px]" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
                          <p className="label-mono mb-1.5" style={{ fontSize: '8px' }}>Viewed vs swiped away</p>
                          <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="w-full h-[34px]" aria-hidden="true">
                            <rect x="0" y="4" width="38" height="10" rx="1.5" fill="var(--text-faint)" opacity="0.5" />
                            <rect x="0" y="19" width="93" height="10" rx="1.5" fill="#FF4444" opacity="0.75" />
                          </svg>
                          <div className="flex justify-between mt-1.5">
                            <span className="font-mono" style={{ fontSize: '8px', color: 'var(--text-faint)' }}>viewed 62%</span>
                            <span className="font-mono" style={{ fontSize: '8px', color: '#FF4444' }}>swiped 38%</span>
                          </div>
                        </div>
                        <span className="rounded-[14px] px-3 py-1.5 text-[11.5px]" style={{ background: 'var(--bg-raised)', color: 'var(--text)' }}>
                          {m.text}
                        </span>
                      </div>
                    </div>
                  ) : m.role === 'user' ? (
                    <div className="flex justify-end">
                      <span
                        className={`rounded-[14px] px-3 py-1.5 text-[11.5px] truncate max-w-[80%] ${m.mono ? 'font-mono' : ''}`}
                        style={{ background: 'var(--bg-raised)', color: 'var(--text)' }}
                      >
                        {m.text}
                      </span>
                    </div>
                  ) : m.role === 'working' ? (
                    <p className="label-mono">{m.text}</p>
                  ) : m.role === 'card' ? (
                    <div className="p-3.5 sm:p-4" style={plate}>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span className="text-[26px] leading-none font-semibold tracking-tight tabular-nums" style={{ color: 'var(--text)' }}>62</span>
                        <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>/ 100</span>
                      </div>
                      <p className="text-[11.5px] leading-relaxed mb-3.5" style={{ color: 'var(--text-muted)' }}>
                        The idea lands, the open does not. You set up a payoff the thumbnail already gave away.
                      </p>
                      <p className="label-mono mb-1.5">Fix</p>
                      <ul className="space-y-1">
                        <li className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text)' }}>Cut the first 1.4s. Open on the reaction at 0:03.</li>
                      </ul>
                    </div>
                  ) : (
                    <div className="flex justify-start">
                      <span
                        className="rounded-[14px] px-3 py-2 text-[11.5px] leading-relaxed max-w-[88%]"
                        style={{ background: 'var(--bg-raised)', color: 'var(--text)' }}
                      >
                        {m.text}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* The composer, same shape as the one in the hero above it. */}
            <div className="flex-shrink-0 mt-3 flex items-center gap-2 px-3 py-2" style={composer}>
              <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
              <span className="flex-1 text-[11.5px] truncate" style={{ color: 'var(--text-faint)' }}>Ask about the fixes, or send another link</span>
              <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
                <ArrowUp className="w-3 h-3" style={{ color: 'var(--on-accent)' }} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Competitors: the feed only ever shows shorts that beat the channel's own
// median views per day, so the multiple is the whole card, the same way it is
// in CompetitorsFeed.
function CompetitorsFrame() {
  const rows = [
    { ch: 'nikocado', title: 'i ate the whole menu in one sitting', mult: '7.4x', vpd: '412k / day' },
    { ch: 'sidemen clips', title: 'he guessed it in three words', mult: '3.1x', vpd: '96k / day' },
    { ch: 'mrwhosetheboss', title: 'the phone nobody was allowed to review', mult: '2.2x', vpd: '61k / day' },
  ];
  return (
    <div className="overflow-hidden" style={{ background: 'var(--bg-app)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-lg)' }}>
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
        {/* nowrap, and the second chip only appears once there is room for it:
            "4 channels tracked" beside two pills wrapped onto a second line on
            a phone and ran into them. */}
        <p className="label-mono flex-1 whitespace-nowrap truncate">Feed · 4 channels</p>
        <span className="chip" data-on="true">Outliers</span>
        <span className="chip hidden md:inline-flex">Saved</span>
      </div>
      <div className="px-4 sm:px-5">
        {rows.map((r, i) => (
          <div key={r.title} className="flex items-center gap-4 py-3.5" style={i < rows.length - 1 ? { borderBottom: '1px solid var(--line)' } : undefined}>
            <div className="w-9 h-12 sm:w-10 sm:h-14 rounded-[6px] flex-shrink-0" style={{ background: 'var(--bg-raised-hover)', border: '1px solid var(--line)' }} />
            <div className="flex-1 min-w-0">
              <p className="label-mono mb-1">{r.ch}</p>
              <p className="text-[12.5px] truncate" style={{ color: 'var(--text)' }}>{r.title}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--process)' }}>{r.mult}</p>
              <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{r.vpd}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Analytics: the app's Tile row, then a retention curve with the drop marked.
//
// The shape is the one this product exists for: a normal opening slide, then a
// cliff, then a long flat tail. The marker sits ON the cliff and the label is
// the timestamp that cliff falls at, worked out from the same duration printed
// under the axis - an earlier version put "0:07" at the 55% mark of a 31-second
// video, which is the kind of detail a creator checks first.
const DURATION_S = 31;
const CURVE = [
  100, 96, 90, 85, 82, 79, 77, 75, 73, 71,
  52, 49, 47, 46, 45, 44, 43, 43, 42, 41,
  41, 40, 40, 39, 39, 38, 38, 37, 37, 36,
  36, 35, 35, 34, 34, 33, 33, 32, 32, 31, 30,
];
// The first sample after the fall, i.e. the point the marker names.
const DROP_AT = 10;
const DROP_LABEL = `0:${String(Math.round((DROP_AT / (CURVE.length - 1)) * DURATION_S)).padStart(2, '0')}`;

function AnalyticsFrame() {
  // 0..108 rather than 0..150: on the old scale the entire curve sat in the
  // top third of the box and the cliff read as a scratch.
  const y = (v: number) => (1 - v / 108) * 100;
  const points = CURVE.map((v, i) => `${(i / (CURVE.length - 1)) * 100},${y(v)}`).join(' ');
  const dropX = (DROP_AT / (CURVE.length - 1)) * 100;

  return (
    <div className="p-4 sm:p-5" style={{ background: 'var(--bg-app)', border: '1px solid var(--line-strong)', borderRadius: 'var(--r-lg)' }}>
      {/* The connected state, said out loud. Everything in this frame is real
          YouTube data and there was nothing on it saying so, which is the one
          thing that separates these numbers from numbers any tool can invent. */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
          style={{ background: 'rgba(255,0,0,0.10)', border: '1px solid rgba(255,0,0,0.28)', color: '#FF4444' }}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#FF0000' }} />
          YouTube connected
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-4">
        {[
          { label: 'Views, 28d', value: '1.24M', sub: '+18%' },
          { label: 'Avg. view %', value: '61%', sub: '+4pt' },
          { label: 'Subs, 28d', value: '3,910', sub: '+22%' },
        ].map(t => (
          <div key={t.label} className="p-3 sm:p-4 min-w-0" style={plate}>
            <p className="label-mono mb-2 truncate">{t.label}</p>
            <p className="text-[18px] sm:text-[22px] leading-none font-semibold tracking-tight tabular-nums" style={{ color: 'var(--text)' }}>{t.value}</p>
            <p className="font-mono text-[10px] mt-2" style={{ color: 'var(--process)' }}>{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="p-4" style={plate}>
        <p className="label-mono mb-3">Retention · last short</p>
        <div className="relative">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-[86px] sm:h-[110px]" aria-hidden="true">
            <line x1="0" y1={y(100)} x2="100" y2={y(100)} stroke="var(--line)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1={y(50)} x2="100" y2={y(50)} stroke="var(--line)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
            <polyline
              points={points}
              fill="none"
              stroke="var(--text)"
              strokeWidth="1.4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <line x1={dropX} y1="0" x2={dropX} y2="100" stroke="var(--line-strong)" strokeWidth="0.8" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* The callout is HTML, not SVG text: the viewBox is stretched
              non-uniformly, which would squash any glyph drawn inside it. */}
          <div className="absolute top-0 -translate-x-1/2" style={{ left: `${dropX}%` }}>
            <span className="font-mono text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-raised-hover)', color: 'var(--text)', border: '1px solid var(--line-strong)' }}>
              {DROP_LABEL}
            </span>
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>0:00</span>
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>0:{DURATION_S}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────

// The same four rows, in the same order, with the same numbering as the app's
// hub (HomePage.tsx). Someone who signs up lands on this list again, which is
// the point: the page is not a brochure for the product, it is the product's
// first screen with the door still shut.
// The three moves, in the order a week actually goes. This was four tabs with
// a sentence each - Analyze, Projects, Analytics, Competitors - which is the
// product's own filing system, not anything the reader turned up wanting. They
// are still the tabs inside; the page just stops asking anyone to learn them.
//
// One line each, and each line names a thing: a median, a hook, a second. A
// sentence that could describe any tool describes nothing, to a reader or to a
// crawler.
const surfaces: { index: string; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    index: '01',
    icon: <Users className="w-[18px] h-[18px]" />,
    label: 'Steal what already worked',
    desc: 'Only the shorts that beat the channel they came from.',
  },
  {
    index: '02',
    icon: <VideoIcon className="w-[18px] h-[18px]" />,
    label: 'Make it yours',
    desc: 'The idea comes back as your hook and your script, scored before you film.',
  },
  {
    index: '03',
    icon: <GraphUp className="w-[18px] h-[18px]" />,
    label: 'Post it, then find out why',
    desc: 'Your retention curve, the second people left, and what to cut next time.',
  },
];

// Verbatim Discord messages, quoted as such. One per surface, so each lands on
// a different problem rather than three people praising the same thing.
const testimonials: { quote: string; name: string; on: string }[] = [
  {
    quote: 'added 4 competitors yesterday and the tool literally picked out the exact 2 shorts that blew up on their channels lol',
    name: 'alexvfx',
    on: 'Competitors',
  },
  {
    quote: 're-wrote the first 5 seconds based on the prompt, retention actually stayed flat through the intro',
    name: 'Yonatan',
    on: 'Analyze',
  },
  {
    quote: 'figured out people were swiping away right when I started doing the sponsor plug... that graph read is insane',
    name: 'd4wki',
    on: 'Analytics',
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {FAQS.map((f, i) => (
        <div key={f.q} style={{ borderBottom: '1px solid var(--line)' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start gap-4 py-4 text-left"
            aria-expanded={open === i}
          >
            <span className="flex-1 text-[15px] font-medium" style={{ color: 'var(--text)' }}>{f.q}</span>
            <ChevronDown
              className="w-4 h-4 flex-shrink-0 mt-0.5 transition-transform duration-200"
              style={{ color: 'var(--text-faint)', transform: open === i ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {/* Grid-rows trick rather than max-height: the answer opens to its
              real height, so a long one is not clipped and a short one leaves
              no dead space under it. */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: open === i ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <p className="text-[14px] leading-relaxed pb-4 pr-8 max-w-2xl" style={{ color: 'var(--text-muted)' }}>{f.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

type Interval = 'month' | 'year';

interface Plan {
  name: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  yearlyTotal: number;
  quotas: string[];
  // What the credit number actually converts to, spent one way at a time.
  // Only set where a concrete number is honest to show (Pro's ceiling is a
  // fair-use number that's deliberately not on this page, see credits.ts).
  breakdown?: { amount: string; label: string }[];
  features: string[];
  cta: string;
  highlight: boolean;
}

// Mirrors UpgradePage.tsx's live Stripe prices. yearlyTotal is 12x the
// monthly rate rounded up 11c to end in .99 (Plus has no further discount
// on top of that; Pro's yearlyMonthlyPrice is the real ~35% cut).
// breakdown amounts are 300 credits divided by each action's real cost in
// supabase/functions/_shared/credits.ts (video 5, hook 2, script 3,
// competitor items 1) — i.e. what 300 credits buys if spent entirely on
// that one thing, not an average. Keep in sync if CREDIT_COSTS changes.
const pricingPlans: Plan[] = [
  {
    name: 'Plus', monthlyPrice: 9.99, yearlyMonthlyPrice: 9.99, yearlyTotal: 119.99,
    // Competitors sits in `quotas` rather than `features` on purpose: quotas
    // render as the bold rows and features as the ticked ones, and this is the
    // one line that separates paid from the free trial (enforced server-side
    // in fetch-competitor-ideas / generate-outline, not just hidden in the UI).
    quotas: ['300 credits a month', 'Competitors unlocked'],
    breakdown: [
      { amount: '60', label: 'videos' },
      { amount: '150', label: 'hooks' },
      { amount: '100', label: 'scripts' },
      { amount: '300', label: 'ideas' },
    ],
    features: ['Retention read on your own videos', 'Channel context in every answer', 'Projects and saved ideas'],
    cta: 'Get Plus', highlight: false,
  },
  {
    name: 'Pro', monthlyPrice: 19.99, yearlyMonthlyPrice: 12.99, yearlyTotal: 155.99,
    quotas: ['Unlimited credits', 'Competitors unlocked'],
    features: ['Everything in Plus', 'Highest fair-use ceiling'],
    cta: 'Get Pro', highlight: true,
  },
];

const proPlan = pricingPlans.find(p => p.name === 'Pro')!;
// Computed from the same numbers the card displays, so it can never drift out
// of sync the way a hardcoded "50% off" string did once already in this app.
const proPercentOff = Math.round(((proPlan.monthlyPrice * 12 - proPlan.yearlyTotal) / (proPlan.monthlyPrice * 12)) * 100);

function BillingToggle({ interval, onChange }: { interval: Interval; onChange: (v: Interval) => void }) {
  return (
    <div className="flex items-center gap-3">
      {/* The app's segmented control, not a bespoke pill with a sliding thumb.
          Same .seg class Competitors and Analytics use for their filters. */}
      <div className="seg">
        {(['month', 'year'] as const).map(iv => (
          <button key={iv} onClick={() => onChange(iv)} data-on={interval === iv}>
            {iv === 'month' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>
      <span
        className="font-mono text-[11px] transition-opacity duration-200"
        style={{ color: 'var(--process)', opacity: interval === 'year' ? 1 : 0 }}
      >
        −{proPercentOff}%
      </span>
    </div>
  );
}

function PricingCard({ plan, interval, onSelect }: { plan: Plan; interval: Interval; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const price = interval === 'year' ? plan.yearlyMonthlyPrice : plan.monthlyPrice;
  return (
    <div
      className="relative flex flex-col p-5 sm:p-6 h-full"
      style={{
        background: 'var(--bg-raised)',
        // The highlight is one hairline going from --line to --line-strong.
        // It used to be a tinted gradient wash plus a 40%-opacity accent
        // border, which at a white accent is a glowing rectangle.
        border: `1px solid ${plan.highlight ? 'var(--line-strong)' : 'var(--line)'}`,
        borderRadius: 'var(--r-md)',
      }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-[15px] font-medium" style={{ color: 'var(--text)' }}>{plan.name}</span>
        {plan.highlight && <span className="label-mono">Most picked</span>}
      </div>

      <div className="flex items-baseline gap-1.5 mb-1">
        <span key={`${plan.name}-${interval}`} className="text-[34px] leading-none font-semibold tracking-tight tabular-nums animate-fade-in" style={{ color: 'var(--text)' }}>
          ${price.toFixed(2)}
        </span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-faint)' }}>/ mo</span>
      </div>
      <p className="font-mono text-[11px] mb-5" style={{ color: 'var(--text-faint)' }}>
        {interval === 'year' ? `$${plan.yearlyTotal.toFixed(2)} billed yearly` : 'billed monthly'}
      </p>

      <div className="space-y-2 mb-5">
        {plan.quotas.map(q => (
          <p key={q} className="text-[14px] font-medium" style={{ color: 'var(--text)' }}>{q}</p>
        ))}
      </div>

      {/* Converts the credit number into what people came here to check: how
          many videos, hooks, scripts that gets them. Each figure is 300
          credits spent entirely on that one action, so this is the floor if
          you split them, not an average. */}
      {plan.breakdown && (
        <div className="grid grid-cols-4 gap-px mb-5 overflow-hidden" style={{ background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
          {plan.breakdown.map(b => (
            <div key={b.label} className="px-2 py-2.5 text-center" style={{ background: 'var(--bg-raised)' }}>
              <span className="block font-mono text-[13px] tabular-nums" style={{ color: 'var(--text)' }}>{b.amount}</span>
              <span className="block text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{b.label}</span>
            </div>
          ))}
        </div>
      )}

      {plan.features.length > 2 && (
        <button
          onClick={() => setOpen(o => !o)}
          className="self-start inline-flex items-center gap-1.5 text-[12px] mb-4 transition-colors hover:text-[var(--text)]"
          style={{ color: 'var(--text-muted)' }}
        >
          What is included
          <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
      <ul className={`space-y-2 mb-5 ${plan.features.length > 2 && !open ? 'hidden' : 'block'}`}>
        {plan.features.map(f => (
          <li key={f} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-faint)' }} />
            {f}
          </li>
        ))}
      </ul>

      {/* The highlighted plan's button used to be `background: var(--accent)`
          with `color: white` — which was white on white from the moment the
          accent became white, i.e. an invisible label on the primary CTA. */}
      <button
        onClick={onSelect}
        className="mt-auto w-full py-2.5 rounded-[var(--r-sm)] text-sm font-semibold transition-opacity hover:opacity-90"
        style={plan.highlight
          ? { background: 'var(--accent)', color: 'var(--on-accent)' }
          : { background: 'transparent', color: 'var(--text)', border: '1px solid var(--line-strong)' }}
      >
        {plan.cta}
      </button>
    </div>
  );
}

// ─── Section head ─────────────────────────────────────────────────────────────
// PageHead's three notes — mono eyebrow, display line, one sentence — in the
// same order at the same sizes as every screen in the app.
function Head({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-8 sm:mb-10">
      <p className="label-mono mb-4">{eyebrow}</p>
      <h2 className="display max-w-2xl" style={{ color: 'var(--text)' }}>{title}</h2>
      {sub && <p className="text-[15px] mt-3 max-w-md leading-relaxed text-balance" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

const navLinks: { label: string; id: string }[] = [
  { label: 'Product', id: 'product' },
  { label: 'Pricing', id: 'pricing' },
  { label: 'FAQ', id: 'faq' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const [authModal, setAuthModal] = useState<null | 'login' | 'signup'>(null);
  const [heroGate, setHeroGate] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<Interval>('year');
  const [heroUrl, setHeroUrl] = useState('');
  const [heroError, setHeroError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mirrors extractVideoId in AnalysisChat exactly, so nothing this accepts
  // gets rejected on the other side (and vice versa). Screening here means a
  // channel or playlist link is caught before the visitor is asked to sign up,
  // instead of failing after.
  const looksLikeVideoLink = (url: string) => {
    const t = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return true;
    return /[?&]v=([^&]+)/.test(t) || /shorts\/([^?&/\n]+)/.test(t) || /youtu\.be\/([^?&/\n]+)/.test(t);
  };

  // This page only ever renders for guests (App.tsx routes anyone with a
  // session straight to the Dashboard), so there is no logged-in branch to
  // take here. The link is stashed, signup opens, and AnalysisChat picks the
  // key up on mount and runs the analysis without asking for it again.
  const handleHeroAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = heroUrl.trim();
    if (!trimmed) return;
    if (!looksLikeVideoLink(trimmed)) {
      setHeroError('That does not look like a video link. Paste a short, e.g. youtube.com/shorts/...');
      return;
    }
    setHeroError('');
    localStorage.setItem('chumoku_pending_video_url', trimmed);
    // Show the work starting before asking for anything. The signup form comes
    // up on the last step, from inside the gate.
    setHeroGate(trimmed);
  };

  // The page scrolls in a div, not the window, so anchor hrefs would jump the
  // wrong box — scroll the section into view manually instead.
  const scrollTo = (id: string) => {
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative" style={{ background: 'var(--bg-app)', color: 'var(--text)', height: '100dvh' }}>
      <div ref={scrollRef} className="relative h-full overflow-y-auto overflow-x-hidden">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav
          className="sticky top-0 z-40 w-full"
          style={{ background: 'rgba(10,10,11,0.78)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--line)' }}
        >
          <div className={`${SECTION} flex items-center gap-4 py-3.5`}>
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2 font-black uppercase tracking-[0.14em] text-[14px] whitespace-nowrap"
              style={{ color: 'var(--text)' }}
            >
              <img src="/chumoku-mark.png" alt="" className="h-[14px] w-auto flex-shrink-0" />
              Chumoku
            </button>

            <div className="hidden md:flex items-center gap-1 ml-6">
              {navLinks.map(link => (
                <button
                  key={link.label}
                  onClick={() => scrollTo(link.id)}
                  className="px-2.5 py-1.5 text-[13px] transition-colors hover:text-[var(--text)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {link.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => setAuthModal('login')}
                className="hidden sm:inline-flex px-3 py-1.5 text-[13px] transition-colors hover:text-[var(--text)]"
                style={{ color: 'var(--text-muted)' }}
              >
                Sign in
              </button>
              <button
                onClick={() => setAuthModal('signup')}
                className="px-3.5 py-1.5 text-[13px] font-semibold rounded-[var(--r-sm)] whitespace-nowrap transition-opacity hover:opacity-90"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                Get started
              </button>
              <button
                onClick={() => setMobileMenu(o => !o)}
                aria-label={mobileMenu ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenu}
                className="md:hidden p-1.5 ml-0.5"
                style={{ color: 'var(--text-muted)' }}
              >
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileMenu && (
            <div className="md:hidden animate-fade-in" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-app)' }}>
              <div className={`${SECTION} py-2`}>
                {navLinks.map(link => (
                  <button
                    key={link.label}
                    onClick={() => scrollTo(link.id)}
                    className="w-full text-left py-3 text-[14px]"
                    style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--line)' }}
                  >
                    {link.label}
                  </button>
                ))}
                <button onClick={() => { setMobileMenu(false); setAuthModal('login'); }} className="w-full text-left py-3 text-[14px]" style={{ color: 'var(--text-muted)' }}>
                  Sign in
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────────
            The one screen with the grid on it, and the grid is the app's:
            112px cell, --line hairline, the same surface Analyze is drawn on.
            Everything below this is flat, exactly like every other tab.

            What used to be here: three drifting blurred blobs, a glow along
            the bottom edge, a rotating quote pill, a marquee of four invented
            widgets, and a haloed input. None of it existed in the product. */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 grid-surface pointer-events-none" aria-hidden="true" />
          {/* Fades the grid out into the flat page rather than cutting it at a
              hard line across the screen. */}
          <div
            className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-app))' }}
            aria-hidden="true"
          />

          <div className={`relative ${SECTION} pt-16 sm:pt-28 pb-10 sm:pb-14`}>
            <p className="label-mono mb-5 animate-fade-in">Shorts only</p>

            {/* Bright line, then the same sentence continuing in the muted
                weight. One headline doing the job the headline plus a
                subheading used to split between them. */}
            <h1
              className="animate-fade-in-up font-semibold max-w-3xl"
              style={{ fontSize: 'clamp(2.1rem, 1.2rem + 3.4vw, 3.9rem)', letterSpacing: '-0.035em', lineHeight: 1.05 }}
            >
              {/* Each half on its own line. Left to wrap on its own the break
                  landed inside the phrase - "your AI" ending one line and
                  "content producer" starting the next - which reads as the
                  text having run out of room rather than as two lines. */}
              <span className="block" style={{ color: 'var(--text)' }}>Meet Chumoku,</span>
              <span className="block text-balance" style={{ color: 'var(--text-muted)' }}>your AI content producer.</span>
            </h1>

            <p className="animate-fade-in-up delay-100 text-[15px] sm:text-base leading-relaxed mt-5 mb-8 max-w-lg" style={{ color: 'var(--text-muted)' }}>
              The only AI you need to grow a Shorts channel.
            </p>

            {/* The only CTA above the fold, and it is the app's composer, not a
                marketing input: same plate, same radius, same round send. */}
            <form onSubmit={handleHeroAnalyze} autoComplete="off" className="animate-fade-in-up delay-200 max-w-xl">
              <div className="flex items-center gap-2 pl-4 pr-2 py-2" style={composer}>
                <input
                  type="text"
                  value={heroUrl}
                  onChange={e => { setHeroUrl(e.target.value); if (heroError) setHeroError(''); }}
                  placeholder="youtube.com/shorts/..."
                  className="flex-1 min-w-0 py-1.5 text-[14px]"
                  style={inputReset}
                />
                <button
                  type="submit"
                  aria-label="Analyze"
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-90"
                  style={{ background: 'var(--accent)' }}
                >
                  <ArrowUp className="w-4 h-4" style={{ color: 'var(--on-accent)' }} />
                </button>
              </div>
              <p className="label-mono mt-3" style={heroError ? { color: 'rgb(var(--danger-rgb))' } : undefined}>
                {heroError || '20 free credits · no card'}
              </p>
            </form>
          </div>

          {/* The product, big, cropped by the fold. This is the whole first
              impression: not a claim about the app, the app. */}
          <div className={`relative ${SECTION} pb-16 sm:pb-24`}>
            <div className="animate-fade-in-up delay-300">
              <AppFrame />
            </div>
          </div>
        </header>

        {/* ── Product ─────────────────────────────────────────────────────────
            The hub's list, verbatim: same four rows, same numbering, same
            hairlines. Signing up lands you on this screen again. */}
        <section id="product" className={`${SECTION} py-16 sm:py-24 scroll-mt-16`}>
          <Reveal>
            <Head
              eyebrow="The loop"
              title="Steal, adapt, improve."
              sub="One credit balance across all three."
            />
          </Reveal>

          <Reveal delay={60}>
            <div style={{ borderTop: '1px solid var(--line)' }}>
              {surfaces.map(s => (
                <div key={s.label} className="flex items-start gap-5 py-5" style={{ borderBottom: '1px solid var(--line)' }}>
                  <span className="font-mono text-[11px] pt-1 w-6 flex-shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
                    {s.index}
                  </span>
                  <span className="pt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{s.icon}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium mb-1" style={{ color: 'var(--text)' }}>{s.label}</span>
                    <span className="block text-[13px] leading-relaxed text-balance" style={{ color: 'var(--text-muted)' }}>{s.desc}</span>
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── Competitors ─────────────────────────────────────────────────── */}
        <section className={`${SECTION} pb-16 sm:pb-24`}>
          <Reveal>
            <Head
              eyebrow="Competitors"
              title="Their breakouts, not their uploads."
              sub="Ranked against that channel's own median."
            />
          </Reveal>
          <Reveal delay={60}><CompetitorsFrame /></Reveal>
        </section>

        {/* ── Analytics ───────────────────────────────────────────────────── */}
        <section className={`${SECTION} pb-16 sm:pb-24`}>
          <Reveal>
            <Head
              eyebrow="Analytics"
              title="Improve on real data, not guesses."
              sub="Connect once. Every answer reads your own retention."
            />
          </Reveal>
          <Reveal delay={60}><AnalyticsFrame /></Reveal>
        </section>

        {/* ── Proof ───────────────────────────────────────────────────────── */}
        <section className={`${SECTION} pb-16 sm:pb-24`}>
          <Reveal>
            <Head eyebrow="From the Discord" title="Not a wall of five stars." sub="Verbatim messages, one per surface, from people who were using it anyway." />
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 70}>
                <div className="p-5 h-full flex flex-col" style={plate}>
                  <p className="text-[13.5px] leading-relaxed flex-1" style={{ color: 'var(--text)' }}>&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                    <DiscordIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
                    <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{t.name}</span>
                    <span className="label-mono ml-auto">{t.on}</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Pricing ─────────────────────────────────────────────────────── */}
        <section id="pricing" className={`${SECTION} pb-16 sm:pb-24 scroll-mt-16`}>
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8 sm:mb-10">
              <div>
                <p className="label-mono mb-4">Pricing</p>
                <h2 className="display" style={{ color: 'var(--text)' }}>One balance, not four limits.</h2>
              </div>
              <BillingToggle interval={billingInterval} onChange={setBillingInterval} />
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
            {pricingPlans.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 70}>
                <PricingCard plan={plan} interval={billingInterval} onSelect={() => setAuthModal('signup')} />
              </Reveal>
            ))}
          </div>

          {/* The free tier as a row, not a third card: it is the contrast that
              makes the paid cards land, but equal card weight would sell it as
              a real option. The numbers match CREDIT_LIMITS.free in
              supabase/functions/_shared/credits.ts (20, one time, never
              resets) and the Competitors gate really is enforced server-side
              for free accounts. */}
          <Reveal delay={140}>
            <div
              className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1.5"
              style={{ border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)' }}
            >
              <span className="text-[13.5px] font-medium" style={{ color: 'var(--text)' }}>Free</span>
              <span className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>20 credits, one time, no card</span>
              <span className="label-mono sm:ml-auto">No Competitors</span>
            </div>
          </Reveal>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <section id="faq" className={`${SECTION} pb-16 sm:pb-24 scroll-mt-16`}>
          <Reveal><Head eyebrow="Questions" title="Before you sign up." /></Reveal>
          <Reveal delay={60}><FAQSection /></Reveal>
        </section>

        {/* ── Close ───────────────────────────────────────────────────────── */}
        <section className={`${SECTION} pb-16 sm:pb-24`}>
          <Reveal>
            <div className="p-8 sm:p-12" style={plate}>
              <p className="label-mono mb-4">Start</p>
              <h2 className="display max-w-lg mb-3" style={{ color: 'var(--text)' }}>Start with your next short.</h2>
              <p className="text-[15px] leading-relaxed max-w-md mb-7" style={{ color: 'var(--text-muted)' }}>
                Connect the channel, read the last video, and know what to change before you film the next one.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setAuthModal('signup')}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 font-semibold rounded-[var(--r-sm)] text-[14px] transition-opacity hover:opacity-90"
                  style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
                >
                  Get started
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <a
                  href="https://discord.com/invite/N8S6C95Ry2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-[14px] transition-colors hover:text-[var(--text)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Join the Discord
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="label-mono mt-6">20 free credits · no card</p>
            </div>
          </Reveal>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{ borderTop: '1px solid var(--line)' }}>
          <div className={`${SECTION} py-10 flex flex-col sm:flex-row sm:items-center gap-6`}>
            <div className="flex items-center gap-2 font-black uppercase tracking-[0.14em] text-[13px]" style={{ color: 'var(--text-muted)' }}>
              <img src="/chumoku-mark.png" alt="" className="h-[12px] w-auto opacity-60" />
              Chumoku
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto text-[13px]">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-1.5 transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>
                <Mail className="w-3.5 h-3.5" />{SUPPORT_EMAIL}
              </a>
              <a href="/privacy" className="transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>Privacy</a>
              <a href="/terms" className="transition-colors hover:text-[var(--text)]" style={{ color: 'var(--text-muted)' }}>Terms</a>
            </div>
          </div>
          <div className={`${SECTION} pb-10`}>
            <p className="label-mono">© {new Date().getFullYear()} Chumoku</p>
          </div>
        </footer>
      </div>

      {heroGate && (
        <HeroAnalysisGate
          url={heroGate}
          onNeedAccount={() => setAuthModal('signup')}
          onBack={() => {
            localStorage.removeItem('chumoku_pending_video_url');
            setHeroGate(null);
            setAuthModal(null);
          }}
        />
      )}

      {authModal && (
        <AuthModal
          initialMode={authModal}
          onClose={() => setAuthModal(null)}
          context={
            heroGate && authModal === 'signup'
              ? { title: 'Your breakdown is ready', sub: 'Create an account to see it. 20 free credits, no card.' }
              : undefined
          }
        />
      )}
    </div>
  );
}
