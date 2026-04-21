import { useState } from 'react';
import { X, Check, Loader2, Zap, ArrowRight, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// ─── Shared styles ────────────────────────────────────────────────────────────

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  outline: 'none',
};

// ─── Auth Modal ───────────────────────────────────────────────────────────────

function AuthModal({ initialMode, onClose }: { initialMode: 'login' | 'signup'; onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
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
      redirectTo: 'https://hersh.live/auth/callback?type=recovery',
    });
    setLoading(false);
    if (err) setError(err.message);
    else setResetSent(true);
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setGoogleLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{ background: 'rgba(13,27,42,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 text-gray-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div className="mb-6">
          <p className="text-white font-bold text-xl mb-1">
            {mode === 'forgot' ? 'Reset password' : mode === 'login' ? 'Welcome back' : 'Start for free'}
          </p>
          <p className="text-gray-500 text-sm">
            {mode === 'forgot' ? "We'll send you a reset link." : mode === 'login' ? 'Sign in to your Hersh account.' : 'No credit card required.'}
          </p>
        </div>

        {mode === 'forgot' ? (
          resetSent ? (
            <div className="text-center py-4">
              <div className="text-emerald-400 text-2xl mb-3">✓</div>
              <p className="text-white font-medium mb-1">Check your email</p>
              <p className="text-gray-400 text-sm mb-5">Reset link sent to <strong>{email}</strong></p>
              <button onClick={() => { setMode('login'); setResetSent(false); }} className="text-sm" style={{ color: '#0EA4E9' }}>Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email" required
                className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
              {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-3">{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-50" style={{ background: '#0EA4E9' }}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => setMode('login')} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Back to sign in</button>
              </div>
            </form>
          )
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-3 mb-4">
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email" required
                className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password" required
                className="w-full px-4 py-2.5 rounded-xl text-white text-sm"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
              {mode === 'login' && (
                <div className="text-right">
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
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

            <button
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              ) : (
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
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
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
  'Hook opens with context, not a hook — "In today\'s video I\'m going to show you..." kills retention before the first second is over. Lead with the outcome or the problem, never the setup.',
  'No visual pattern interrupt in the first 3 seconds. The static talking-head opening gives the viewer zero reason to stop scrolling.',
  'Ending has no loop mechanic — it closes cleanly instead of creating unresolved tension that pulls viewers back to the top.',
];

const DEMO_HOOKS = [
  { hook: 'I tracked every hour of my day for 30 days. Here\'s the one thing I cut that changed everything.', reasoning: 'Specific number + mystery outcome. Forces the viewer to stay for the reveal.' },
  { hook: 'Your morning routine isn\'t the problem. This 4pm habit is.', reasoning: 'Pattern interrupt — audience expects morning advice, gets an unexpected angle. Strong reason to keep watching.' },
  { hook: 'I used to wake up at 5am and still felt exhausted. One change fixed it.', reasoning: 'Personal story with relatable failure state + implied solution. Low resistance to watch.' },
];

function DemoSection() {
  const [activeHook, setActiveHook] = useState(0);

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* Video context strip */}
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
        <div className="ml-auto flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(251,146,60,0.15)', color: '#FB923C', border: '1px solid rgba(251,146,60,0.25)' }}>
            Score: 4/10
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Overall Assessment */}
        <div className="rounded-xl p-5 md:col-span-2" style={glass}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Overall Assessment</p>
          <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
            <p className="text-white font-medium">Real problem: the hook tells instead of hooks — it describes what the video is about instead of creating a reason to keep watching.</p>
            <div className="space-y-1.5 pl-3" style={{ borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
              <p><span className="text-gray-400 font-medium">Hook:</span> Opens with "Today I want to talk about morning routines" — a category statement, not a hook. The viewer has no unresolved tension pulling them forward.</p>
              <p><span className="text-gray-400 font-medium">Structure:</span> The payoff (the actual insight) doesn't arrive until 0:38. That's 65% of a Short used for setup. Retention likely drops below 30% before the key idea lands.</p>
              <p><span className="text-gray-400 font-medium">Pacing:</span> Static talking-head with no cuts in the first 8 seconds. On mobile, the thumb is already swiping.</p>
            </div>
            <p><span className="text-white font-medium">Fix this first:</span> Lead with the counterintuitive finding — not the topic. The insight is good, the delivery buries it.</p>
          </div>
        </div>

        {/* Weak Spots */}
        <div className="rounded-xl p-5" style={glass}>
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

        {/* New Hook Ideas */}
        <div className="rounded-xl p-5" style={glass}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">New Hook Ideas</p>
          <div className="flex gap-1.5 mb-4">
            {DEMO_HOOKS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveHook(i)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${activeHook === i ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                style={activeHook === i ? { background: 'rgba(14,164,233,0.2)', border: '1px solid rgba(14,164,233,0.35)' } : { border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Hook {i + 1}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <p className="text-sm text-white font-medium leading-relaxed" style={{ color: '#38BDF8' }}>
              "{DEMO_HOOKS[activeHook].hook}"
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">{DEMO_HOOKS[activeHook].reasoning}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

export function LandingPage() {
  const [authModal, setAuthModal] = useState<null | 'login' | 'signup'>(null);

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1B2A 100%)', color: 'white' }}>
      {/* Dot grid */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ zIndex: 0 }}>
        <defs>
          <pattern id="lp-dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#0EA4E9" fillOpacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lp-dot-grid)" />
      </svg>

      <div className="relative z-10">

        {/* ── Navbar ─────────────────────────────────────────────────────────── */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <span className="font-black text-white uppercase tracking-widest text-lg" style={{ letterSpacing: '0.2em' }}>HERSH</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuthModal('login')}
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-lg transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Log in
            </button>
            <button
              onClick={() => setAuthModal('signup')}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors"
              style={{ background: '#0EA4E9' }}
            >
              Start free
            </button>
          </div>
        </nav>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="text-center px-6 pt-16 pb-20 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8" style={{ background: 'rgba(14,164,233,0.1)', border: '1px solid rgba(14,164,233,0.25)', color: '#38BDF8' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0EA4E9] animate-pulse" />
            AI-powered hook analysis for YouTube Shorts
          </div>

          <h1 className="font-black text-white leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', letterSpacing: '-0.02em' }}>
            Your hooks are killing<br />your Shorts.
          </h1>

          <p className="text-lg text-gray-400 leading-relaxed mb-10 max-w-xl mx-auto">
            Hersh analyzes your YouTube Shorts with AI — shows exactly what's wrong with your hook and gives you 3 better versions ready to use.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setAuthModal('signup')}
              className="flex items-center gap-2 px-7 py-3.5 text-white font-semibold rounded-xl text-base transition-all hover:opacity-90"
              style={{ background: '#0EA4E9' }}
            >
              Start free
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-sm text-gray-600">No credit card required</p>
          </div>
        </section>

        {/* ── Demo ──────────────────────────────────────────────────────────── */}
        <section className="pb-24 px-4">
          <div className="text-center mb-10">
            <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">Example analysis</p>
            <h2 className="text-2xl font-bold text-white">See what you've been missing</h2>
            <p className="text-gray-500 text-sm mt-2">This is what Hersh shows you after analyzing a real Short.</p>
          </div>

          <div className="relative">
            {/* Blur gradient bottom overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-24 z-10 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #0A0F1A)' }} />
            <DemoSection />
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section className="pb-24 px-6 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white mb-2">How it works</h2>
            <p className="text-gray-500 text-sm">Three steps. Under 2 minutes.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                step: '01',
                title: 'Paste your Short URL',
                desc: 'Drop in any YouTube Shorts link. No downloads, no installs.',
                icon: '🔗',
              },
              {
                step: '02',
                title: 'AI watches your video',
                desc: 'Gemini watches the full Short. Claude reads every frame and the transcript.',
                icon: '👁️',
              },
              {
                step: '03',
                title: 'Get your fix list',
                desc: 'Hook score, exact weak spots, and 3 ready-to-record hook rewrites.',
                icon: '⚡',
              },
            ].map((item, i) => (
              <div key={i} className="relative rounded-xl p-6" style={glass}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs font-mono font-bold" style={{ color: '#0EA4E9' }}>{item.step}</span>
                </div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                {i < 2 && (
                  <div className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                    <ChevronRight className="w-4 h-4 text-gray-700" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing preview ───────────────────────────────────────────────── */}
        <section className="pb-24 px-6 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white mb-2">Simple pricing</h2>
            <p className="text-gray-500 text-sm">Start free. Upgrade when you need more.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: 'Free', price: '$0', analyses: '3 analyses', period: 'to get started', features: ['Hook score & assessment', 'Weak spot breakdown', '3 hook rewrites'], cta: 'Start free', popular: false, highlight: false },
              { name: 'Plus', price: '$8', analyses: '30 analyses', period: '/month', features: ['Hook score & assessment', 'Weak spot breakdown', '3 hook rewrites', 'Video file upload', 'Channel profile context'], cta: 'Get Plus', popular: true, highlight: true },
              { name: 'Pro', price: '$19', analyses: '100 analyses', period: '/month', features: ['Hook score & assessment', 'Weak spot breakdown', '3 hook rewrites', 'Video file upload', 'Channel profile context'], cta: 'Get Pro', popular: false, highlight: false },
            ].map(plan => (
              <div
                key={plan.name}
                className="relative flex flex-col rounded-xl p-5"
                style={{
                  background: plan.highlight ? 'rgba(14,164,233,0.06)' : 'rgba(255,255,255,0.04)',
                  border: plan.highlight ? '1px solid rgba(14,164,233,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-white text-xs font-semibold rounded-full" style={{ background: '#0EA4E9' }}>Most Popular</span>
                  </div>
                )}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className={`w-4 h-4 ${plan.highlight ? 'text-[#0EA4E9]' : 'text-gray-500'}`} />
                    <span className="text-white font-semibold">{plan.name}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-sm text-gray-500">{plan.period}</span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: plan.highlight ? '#38BDF8' : '#6B7280' }}>{plan.analyses}</p>
                </div>
                <ul className="flex-1 space-y-2 mb-5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-400">
                      <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: plan.highlight ? '#0EA4E9' : '#4B5563' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setAuthModal('signup')}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={plan.highlight
                    ? { background: '#0EA4E9', color: 'white' }
                    : { background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────────── */}
        <section className="pb-24 px-6 text-center">
          <div className="max-w-xl mx-auto rounded-2xl p-10" style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.2)' }}>
            <h2 className="text-2xl font-bold text-white mb-3">Stop guessing. Start improving.</h2>
            <p className="text-gray-400 text-sm mb-7">Paste your first Short URL in 30 seconds.</p>
            <button
              onClick={() => setAuthModal('signup')}
              className="inline-flex items-center gap-2 px-7 py-3.5 text-white font-semibold rounded-xl text-sm transition-all hover:opacity-90"
              style={{ background: '#0EA4E9' }}
            >
              Start free — no credit card required
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="px-6 py-8 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs text-gray-700">© {new Date().getFullYear()} Hersh. All rights reserved.</p>
        </footer>
      </div>

      {authModal && <AuthModal initialMode={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  );
}
