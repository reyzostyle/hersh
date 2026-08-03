import { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, Zap, ArrowRight, ChevronRight, ChevronDown, Activity, Sparkles, Play, Heart, Eye, MessageCircle, Twitter, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// ─── Shared styles ────────────────────────────────────────────────────────────

// No backdrop-filter: blur over the static app background caused Chromium
// ghost bands on sibling repaints; the blue underlay replaces its tint.
const glass: React.CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025) 45%, rgba(255,255,255,0.035)), linear-gradient(180deg, rgba(14,80,133,0.05), rgba(14,80,133,0.03))',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.11), 0 10px 34px -14px rgba(0,0,0,0.6)',
};

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  outline: 'none',
};

// ─── Scroll reveal hook ────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

function AuthModal({ initialMode, onClose }: { initialMode: 'login' | 'signup'; onClose: () => void }) {
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
      redirectTo: 'https://hershymedia.com/auth/callback?type=recovery',
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8 animate-scale-in"
        style={{ background: 'rgba(10,15,26,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-gray-500 hover:text-white rounded-lg">
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <p className="text-white font-bold text-xl mb-1">
            {emailSent ? 'Almost there!' : mode === 'forgot' ? 'Reset password' : mode === 'login' ? 'Welcome back' : 'Start for free'}
          </p>
          <p className="text-gray-500 text-sm">
            {emailSent ? 'Confirm your email to activate your account.' : mode === 'forgot' ? "We'll send you a reset link." : mode === 'login' ? 'Sign in to your Hershy account.' : 'No credit card required.'}
          </p>
        </div>

        {emailSent ? (
          <div className="text-center py-4 animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <span className="text-emerald-400 text-2xl">✓</span>
            </div>
            <p className="text-white font-bold text-lg mb-2">Check your email</p>
            <p className="text-gray-400 text-sm mb-1">We sent a confirmation link to</p>
            <p className="text-white font-medium text-sm mb-4">{email}</p>
            <div className="rounded-xl p-3 mb-5 text-left" style={{ background: 'rgba(14,164,233,0.08)', border: '1px solid rgba(14,164,233,0.2)' }}>
              <p className="text-[#0EA4E9] text-xs leading-relaxed">
                ⚠️ Open the link on <strong>this device</strong>. Clicking it on your phone while Hershy is open on PC won't log you in here automatically.
              </p>
            </div>
            <button
              onClick={() => { setEmailSent(false); setMode('login'); setPassword(''); }}
              className="w-full py-2.5 text-white rounded-xl font-semibold text-sm mb-3"
              style={{ background: '#0EA4E9' }}
            >
              I confirmed my email, Sign in
            </button>
            <button onClick={handleGoogle} disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Or continue with Google
            </button>
            <p className="text-gray-600 text-xs mt-3">No email? Check spam or <button onClick={() => { setEmailSent(false); setMode('signup'); }} className="text-gray-400 hover:text-white underline">try again</button>.</p>
          </div>
        ) : mode === 'forgot' ? (
          resetSent ? (
            <div className="text-center py-4 animate-fade-in">
              <div className="text-emerald-400 text-2xl mb-3">✓</div>
              <p className="text-white font-medium mb-1">Check your email</p>
              <p className="text-gray-400 text-sm mb-5">Reset link sent to <strong>{email}</strong></p>
              <button onClick={() => { setMode('login'); setResetSent(false); }} className="text-sm" style={{ color: '#0EA4E9' }}>Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email" required className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
              {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-3">{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-50" style={{ background: '#0EA4E9' }}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => setMode('login')} className="text-sm text-gray-500 hover:text-gray-300">Back to sign in</button>
              </div>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-3 mb-4">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email" required className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password" required className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
              {mode === 'login' && (
                <div className="text-right">
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-xs text-gray-500 hover:text-gray-300">
                    Forgot password?
                  </button>
                </div>
              )}
              {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-3">{error}</p>}
              <button type="submit" disabled={loading || googleLoading} className="w-full py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-50" style={{ background: '#0EA4E9' }}>
                {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="text-xs text-gray-600 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>

            <button onClick={handleGoogle} disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              {googleLoading ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </button>

            <div className="mt-5 text-center">
              <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                className="text-sm text-gray-500 hover:text-gray-300">
                {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Demo section ─────────────────────────────────────────────────────────────

const DEMO_WEAK_SPOTS = [
  "Opens with context, not tension. \"In today's video...\" loses people before the first second.",
  'No pattern interrupt in the first 3 seconds. A static talking head gives no reason to stop.',
  'Ends cleanly instead of leaving tension that loops viewers back to the top.',
];

const DEMO_HOOKS = [
  { hook: "I tracked every hour of my day for 30 days. Here's the one thing I cut that changed everything.", reasoning: 'Specific number + mystery outcome. Forces the viewer to stay for the reveal.' },
  { hook: "Your morning routine isn't the problem. This 4pm habit is.", reasoning: 'Pattern interrupt. Audience expects morning advice, gets an unexpected angle. Strong reason to keep watching.' },
  { hook: "I used to wake up at 5am and still felt exhausted. One change fixed it.", reasoning: 'Personal story with relatable failure state + implied solution. Low resistance to watch.' },
];

function DemoSection() {
  const [activeHook, setActiveHook] = useState(0);
  const { ref, visible } = useReveal();

  return (
    <div ref={ref} className={`w-full max-w-4xl mx-auto px-4 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.15)', border: '1px solid rgba(255,0,0,0.2)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#FF4444">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm text-white font-medium">Why Your Morning Routine Is Sabotaging Your Day</p>
          <p className="text-xs text-gray-500">247K views · 0:58 · @productivitylab</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl p-4 sm:p-5 md:col-span-2 motion-card" style={glass}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Overall Assessment</p>
            <div className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(251,146,60,0.15)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.25)' }}>Score: 42</div>
          </div>
          <div className="space-y-2.5 text-sm text-gray-300 leading-relaxed">
            <p className="text-white font-medium">The hook tells instead of hooks. It describes the topic instead of creating tension.</p>
            <div className="hidden sm:grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
              {[
                { label: 'Hook', text: 'Opens with a category statement. No unresolved tension to pull the viewer forward.' },
                { label: 'Structure', text: "Payoff arrives at 0:38. That's 65% of the Short used for setup." },
                { label: 'Pacing', text: 'Static talking-head, no cuts in the first 8 seconds. Thumb already swiping.' },
              ].map(({ label, text }) => (
                <div key={label} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-gray-400 font-medium text-xs mb-1">{label}</p>
                  <p className="text-gray-400 text-xs leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4 sm:p-5 motion-card" style={glass}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Weak Spots</p>
          <ul className="space-y-3">
            {DEMO_WEAK_SPOTS.map((spot, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-400 leading-relaxed">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-xs font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>{i + 1}</span>
                {spot}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl p-4 sm:p-5 motion-card" style={glass}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">New Hook Ideas</p>
          <div className="flex gap-1.5 mb-4">
            {DEMO_HOOKS.map((_, i) => (
              <button key={i} onClick={() => setActiveHook(i)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${activeHook === i ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                style={activeHook === i ? { background: 'rgba(14,164,233,0.2)', border: '1px solid rgba(14,164,233,0.35)' } : { border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Hook {i + 1}
              </button>
            ))}
          </div>
          <div className="space-y-3 animate-fade-in min-h-[150px] sm:min-h-[104px]" key={activeHook}>
            <p className="text-sm font-medium leading-relaxed" style={{ color: '#38BDF8' }}>
              "{DEMO_HOOKS[activeHook].hook}"
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">{DEMO_HOOKS[activeHook].reasoning}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper with scroll reveal ────────────────────────────────────────

function RevealSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
      }}
    >
      {children}
    </div>
  );
}

// ─── Decorative Shorts wall (hero background) ─────────────────────────────────

function ShortsWall() {
  const cards = [
    { src: '/shorts/lake.jpg', views: '2.4M', likes: '180K', rotate: -7, z: 1, mobile: false },
    { src: '/shorts/car.jpg', views: '890K', likes: '62K', rotate: -3.5, z: 2, mobile: true },
    { src: '/shorts/setup.jpg', views: '3.1M', likes: '254K', rotate: 0, z: 3, mobile: true },
    { src: '/shorts/football.jpg', views: '1.2M', likes: '97K', rotate: 3.5, z: 2, mobile: false },
    { src: '/shorts/fortnite.jpg', views: '560K', likes: '41K', rotate: 7, z: 1, mobile: true },
  ];
  return (
    <div
      className="flex relative -mt-4 items-end justify-center gap-2 lg:gap-3 pointer-events-none select-none"
      aria-hidden="true"
      style={{
        zIndex: 0,
        opacity: 0.6,
        WebkitMaskImage: 'linear-gradient(to top, black 82%, transparent 100%)',
        maskImage: 'linear-gradient(to top, black 82%, transparent 100%)',
      }}
    >
      {cards.map((c, i) => (
        <div
          key={i}
          className={`relative rounded-xl overflow-hidden w-[92px] h-[156px] sm:w-[116px] sm:h-[196px] ${c.mobile ? '' : 'hidden sm:block'}`}
          style={{
            transform: `rotate(${c.rotate}deg)`,
            transformOrigin: 'bottom center',
            zIndex: c.z,
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          }}
        >
          <img src={c.src} alt="" className="w-full h-full object-cover" loading="lazy" />
          {/* dark gradient for stats legibility */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 38%, transparent 60%)' }} />
          {/* play icon */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: 18 }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>
              <Play className="w-3.5 h-3.5 text-white" fill="white" />
            </div>
          </div>
          {/* stats */}
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-3 text-white text-[10px] font-semibold tracking-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
            <span className="flex items-center gap-1 leading-none"><Eye className="w-3 h-3 flex-shrink-0" />{c.views}</span>
            <span className="flex items-center gap-1 leading-none"><Heart className="w-2.5 h-2.5 flex-shrink-0" fill="white" />{c.likes}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Pricing card (collapsible features) ──────────────────────────────────────

interface Plan {
  name: string; price: string; quotas: string[]; period: string;
  features: string[]; cta: string; popular: boolean; highlight: boolean;
}

function PricingCard({ plan, onSelect }: { plan: Plan; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative flex flex-col rounded-xl p-4 sm:p-5 h-full motion-card"
      style={{
        // No backdrop-filter: blur over the static app background caused
        // Chromium ghost bands on sibling repaints
        background: plan.highlight
          ? 'linear-gradient(rgba(14,164,233,0.06), rgba(14,164,233,0.06)), linear-gradient(180deg, rgba(14,80,133,0.05), rgba(14,80,133,0.03))'
          : 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.04)), linear-gradient(180deg, rgba(14,80,133,0.05), rgba(14,80,133,0.03))',
        border: plan.highlight ? '1px solid rgba(14,164,233,0.4)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 text-white text-xs font-semibold rounded-full" style={{ background: '#0EA4E9' }}>Most Popular</span>
        </div>
      )}
      <div className="mb-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Zap className={`w-4 h-4 ${plan.highlight ? 'text-[#0EA4E9]' : 'text-gray-500'}`} />
          <span className="text-white font-semibold">{plan.name}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white">{plan.price}</span>
          <span className="text-sm text-gray-500">{plan.period}</span>
        </div>
        {/* Monthly quotas — the numbers people actually compare */}
        <div className="mt-2.5 space-y-1.5">
          {plan.quotas.map(q => (
            <p key={q} className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: plan.highlight ? '#0EA4E9' : 'rgba(255,255,255,0.35)' }} />
              {q}
            </p>
          ))}
        </div>
      </div>

      {/* Toggle — mobile only; on desktop features are always shown */}
      <button
        onClick={() => setOpen(o => !o)}
        className="sm:hidden self-start inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-white transition-colors mb-3"
      >
        What's included
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <ul className={`space-y-2 mb-4 ${open ? 'block' : 'hidden'} sm:block`}>
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-400">
            <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: plan.highlight ? '#0EA4E9' : '#4B5563' }} />
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        className="mt-auto w-full py-2.5 rounded-lg text-sm font-semibold"
        style={plan.highlight
          ? { background: '#0EA4E9', color: 'white' }
          : { background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {plan.cta}
      </button>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

export function LandingPage() {
  const [authModal, setAuthModal] = useState<null | 'login' | 'signup'>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bottom glow fades out as you scroll down the first screen
  const glowOpacity = Math.max(0, 1 - scrollTop / 160);

  return (
    <div className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1B2A 100%)', color: 'white', height: '100dvh' }}>
      {/* Dot grid — anchored to the non-scrolling outer container, so it never moves */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ zIndex: 0 }}>
        <defs>
          <pattern id="lp-dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#0EA4E9" fillOpacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lp-dot-grid)" />
      </svg>

      {/* Bottom glow — entices scrolling, fades out as you scroll */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-44"
        style={{
          zIndex: 1,
          opacity: glowOpacity,
          transition: 'opacity 0.2s ease-out',
          background: 'radial-gradient(90% 130% at 50% 100%, rgba(255,255,255,0.10), rgba(255,255,255,0) 62%)',
        }}
      />

      <div
        ref={scrollRef}
        className="relative z-10 h-full overflow-y-auto overflow-x-hidden"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >

        {/* ── Navbar ─────────────────────────────────────────────────────────── */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto animate-fade-in">
          <button onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className="font-black text-white uppercase tracking-[0.15em] sm:tracking-[0.2em] text-base sm:text-lg whitespace-nowrap">
            <span className="sm:hidden">HERSHY</span>
            <span className="hidden sm:inline">HERSHY MEDIA</span>
          </button>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setAuthModal('login')}
              className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-lg whitespace-nowrap"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Log in / Sign up
            </button>
          </div>
        </nav>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="relative w-full flex flex-col items-center justify-center text-center px-6 pb-12 min-h-[calc(100dvh-136px)] md:min-h-[calc(100vh_-_150px)]">

          {/* Left pills */}
          <div className="hidden lg:flex flex-col gap-3 absolute left-8 top-1/2 -translate-y-1/2 items-start" style={{ opacity: 0.35 }}>
            <span className="text-xs px-3 py-1.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>Hook score: 88</span>
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>Curiosity gap</span>
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.15)', color: '#FB923C' }}>2 weak spots found</span>
            <span className="text-xs px-3 py-1.5 rounded-full text-emerald-400" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>Retention drop at 0:04</span>
          </div>

          {/* Right pills */}
          <div className="hidden lg:flex flex-col gap-3 absolute right-8 top-1/2 -translate-y-1/2 items-end" style={{ opacity: 0.35 }}>
            <span className="text-xs px-3 py-1.5 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>Scroll-stop: 9/10</span>
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(14,164,233,0.08)', border: '1px solid rgba(14,164,233,0.18)', color: '#38BDF8' }}>3 hook rewrites</span>
            <span className="text-xs px-3 py-1.5 rounded-full text-emerald-400" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>New hook angle ready</span>
            <span className="text-xs px-3 py-1.5 rounded-full text-gray-500" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>AVG retention: 67%</span>
          </div>

          {/* Center content */}
          <div className="relative z-10 max-w-3xl w-full">
            <h1 className="animate-fade-in-up font-black text-white leading-[1.05] mb-5 text-balance" style={{ fontSize: 'clamp(2.3rem, 7vw, 5rem)', letterSpacing: '-0.02em' }}>
              Every flop has a reason.
            </h1>

            <p className="animate-fade-in-up delay-100 text-base sm:text-lg text-gray-500 leading-relaxed mb-10 max-w-md sm:max-w-lg mx-auto text-balance">
              Find out what cost you the views, and fix it before the next upload.
            </p>

            <div className="animate-fade-in-up delay-200 flex flex-col items-center">
              <button
                onClick={() => setAuthModal('signup')}
                className="flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-4 text-white font-semibold rounded-xl text-sm sm:text-base hover:opacity-90 animate-glow-pulse"
                style={{ background: '#0EA4E9' }}
              >
                Get started free
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <ShortsWall />
        </section>

        {/* ── Proof: a real analysis, not a description of one ──────────────── */}
        <section className="pt-5 sm:pt-6 pb-10 sm:pb-24 px-6 max-w-4xl mx-auto">
          <RevealSection className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-balance">This one scored 42</h2>
            <p className="text-gray-500 text-sm">Here is exactly what came back.</p>
          </RevealSection>
          <DemoSection />
        </section>

        {/* ── What changes for you ──────────────────────────────────────────── */}
        <section className="pb-10 sm:pb-24 px-6 max-w-4xl mx-auto">
          <RevealSection className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-balance">What changes for you</h2>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-3 sm:gap-4">
            {[
              {
                icon: <Sparkles className="w-5 h-5 text-[#0EA4E9]" />,
                iconBg: 'rgba(14,164,233,0.12)',
                iconBorder: 'rgba(14,164,233,0.2)',
                title: 'You find out before you post',
                desc: 'Upload the draft and get the notes while you can still re-record.',
              },
              {
                icon: <Activity className="w-5 h-5 text-emerald-400" />,
                iconBg: 'rgba(52,211,153,0.12)',
                iconBorder: 'rgba(52,211,153,0.2)',
                title: 'You see where they left',
                desc: 'Connect your channel and read the real retention curve, not a guess.',
              },
              {
                icon: <Zap className="w-5 h-5 text-amber-400" />,
                iconBg: 'rgba(251,191,36,0.12)',
                iconBorder: 'rgba(251,191,36,0.2)',
                title: 'You stop repeating it',
                desc: 'The same weak pattern across your videos gets named, so you can drop it.',
              },
            ].map((item, i) => (
              <RevealSection key={item.title} delay={i * 100}>
                <div className="rounded-2xl p-5 sm:p-6 h-full motion-card flex flex-col gap-3" style={glass}>
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: item.iconBg, border: `1px solid ${item.iconBorder}` }}>
                    {item.icon}
                  </div>
                  <h3 className="text-white font-semibold text-base">{item.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section className="pb-10 sm:pb-24 px-6 max-w-4xl mx-auto">
          <RevealSection className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-balance">How it works</h2>
            <p className="text-gray-500 text-sm">Three steps. Under 2 minutes.</p>
          </RevealSection>

          <div className="grid md:grid-cols-3 gap-3 sm:gap-4">
            {[
              { step: '01', title: 'Paste your Short URL', desc: 'Any Shorts link, or upload a file before it goes live.' },
              { step: '02', title: 'AI analyzes the video', desc: 'Gemini analyzes every second. No manual work.' },
              { step: '03', title: 'Get your fix list', desc: 'Hook score, weak spots, and 3 ready-to-record rewrites.' },
            ].map((item, i) => (
              <RevealSection key={i} delay={i * 100}>
                <div className="relative rounded-xl p-4 sm:p-5 h-full motion-card" style={glass}>
                  <h3 className="text-white font-semibold mb-1.5 flex items-baseline gap-2">
                    <span className="text-xs font-mono font-bold flex-shrink-0" style={{ color: '#0EA4E9' }}>{item.step}</span>
                    {item.title}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed text-balance">{item.desc}</p>
                  {i < 2 && (
                    <div className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                      <ChevronRight className="w-4 h-4 text-gray-700" />
                    </div>
                  )}
                </div>
              </RevealSection>
            ))}
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────────── */}
        <section className="pb-10 sm:pb-24 px-6 max-w-4xl mx-auto">
          <RevealSection className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-balance">Simple pricing</h2>
            <p className="text-gray-500 text-sm">Start free. Upgrade when you need more.</p>
          </RevealSection>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: 'Free', price: '$0', quotas: ['3 video analyses to start', '10 hook checks / month'], period: 'free forever', features: ['Hook score & rewrites', 'Weak spot breakdown', 'Video file upload'], cta: 'Start free', popular: false, highlight: false },
              { name: 'Plus', price: '$19', quotas: ['30 video analyses / month', '50 hook checks / month'], period: '/month', features: ['Everything in Free', 'Channel profile context', 'Retention insights on your videos'], cta: 'Get Plus', popular: true, highlight: true },
              { name: 'Pro', price: '$29', quotas: ['100 video analyses / month', '200 hook checks / month'], period: '/month', features: ['Everything in Plus', 'Highest monthly limits'], cta: 'Get Pro', popular: false, highlight: false },
            ].map((plan, i) => (
              <RevealSection key={plan.name} delay={i * 80}>
                <PricingCard plan={plan} onSelect={() => setAuthModal('signup')} />
              </RevealSection>
            ))}
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────────── */}
        <section className="pb-10 sm:pb-24 px-6 text-center">
          <RevealSection>
            <div className="max-w-md mx-auto rounded-2xl p-7 sm:p-8 motion-card" style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.2)' }}>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 text-balance">Stop guessing. Start improving.</h2>
              <button
                onClick={() => setAuthModal('signup')}
                className="flex w-full items-center justify-center gap-2 px-7 py-3.5 text-white font-semibold rounded-xl text-sm hover:opacity-90"
                style={{ background: '#0EA4E9' }}
              >
                Start free
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </RevealSection>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="px-6 py-8 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-4 text-xs">
            <a href="https://discord.com/invite/N8S6C95Ry2" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />Discord
            </a>
            <a href="https://x.com/reyzostyle" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors">
              <Twitter className="w-3.5 h-3.5" />@reyzostyle
            </a>
            <a href="mailto:hershymedia@gmail.com" className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors">
              <Mail className="w-3.5 h-3.5" />hershymedia@gmail.com
            </a>
          </div>
          <div className="flex items-center justify-center gap-4 mb-3 text-xs">
            <a href="/privacy" className="text-gray-500 hover:text-white transition-colors">Privacy Policy</a>
            <span className="text-gray-700">·</span>
            <a href="/terms" className="text-gray-500 hover:text-white transition-colors">Terms of Service</a>
          </div>
          <p className="text-xs text-gray-700">© {new Date().getFullYear()} Hershy Media. All rights reserved.</p>
        </footer>
      </div>

      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  );
}
