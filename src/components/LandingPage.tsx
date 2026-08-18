import { useState, useEffect, useRef } from 'react';

import { X, Check, Loader2, Zap, ChevronRight, ChevronDown, MessageCircle, Twitter, Mail, TrendingUp, Lightbulb, FileText, Wand2, Video as VideoIcon, Users, Play, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// lucide-react has no brand marks, so the real Discord glyph is inlined here
// (official logo path, viewBox 0 0 24 24) rather than standing in with a
// generic chat-bubble icon.
function DiscordIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

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

// ─── Section wrapper with scroll reveal ────────────────────────────────────────

function RevealSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      /* `rv`/`rv-in` drive the micro-animations inside the card (see index.css)
         so they fire when the card arrives, not on page load. */
      className={`rv ${visible ? 'rv-in' : ''} ${className}`}
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

// ─── Pricing card (collapsible features) ──────────────────────────────────────

type Interval = 'month' | 'year';

interface Plan {
  name: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  yearlyTotal: number;
  quotas: string[];
  features: string[];
  cta: string;
  popular: boolean;
  highlight: boolean;
}

// Mirrors UpgradePage.tsx's live Stripe prices. yearlyTotal is 12x the
// monthly rate rounded up 11c to end in .99 (Plus has no further discount
// on top of that; Pro's yearlyMonthlyPrice is the real ~35% cut).
const pricingPlans: Plan[] = [
  {
    name: 'Plus', monthlyPrice: 9.99, yearlyMonthlyPrice: 9.99, yearlyTotal: 119.99,
    quotas: ['300 credits / month', 'Video, Hook & Script checks', 'Competitor ideas, outlines & scripts'],
    features: ['Hook score & rewrites', 'Weak spot breakdown', 'Channel profile context', 'Retention insights on your videos'],
    cta: 'Get Plus', popular: false, highlight: false,
  },
  {
    name: 'Pro', monthlyPrice: 19.99, yearlyMonthlyPrice: 12.99, yearlyTotal: 155.99,
    quotas: ['Unlimited credits', 'Same coverage as Plus', 'Highest fair-use ceiling'],
    features: ['Everything in Plus', 'Highest monthly limits'],
    cta: 'Get Pro', popular: true, highlight: true,
  },
];

const proPlanForDiscount = pricingPlans.find(p => p.name === 'Pro')!;
const proPercentOff = Math.round(
  ((proPlanForDiscount.monthlyPrice * 12 - proPlanForDiscount.yearlyTotal) / (proPlanForDiscount.monthlyPrice * 12)) * 100
);

// Sliding pill with a real percentage, not a copy-pasted claim — computed
// from the same numbers the card displays, so it can never drift out of
// sync the way a hardcoded "50% off" string did once already in this app.
function BillingToggle({ interval, onChange, percentOff }: { interval: Interval; onChange: (v: Interval) => void; percentOff: number }) {
  return (
    /* The badge sits under the switch, not beside it: as a sibling it shifted
       the switch off the section's centre line. */
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative flex w-56 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Track content is the full width minus the 4px padding either side,
            and each half is exactly the thumb's width — so the year position
            is a plain 100% of the thumb, with no extra pixels to overshoot. */}
        <div
          className="absolute top-1 bottom-1 rounded-full transition-transform duration-300"
          style={{ width: 'calc(50% - 4px)', background: '#0EA4E9', transform: interval === 'year' ? 'translateX(100%)' : 'translateX(0)' }}
        />
        {(['month', 'year'] as const).map(iv => (
          <button
            key={iv}
            onClick={() => onChange(iv)}
            className={`relative z-10 flex-1 py-1.5 rounded-full text-sm font-medium transition-colors duration-300 ${interval === iv ? 'text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {iv === 'month' ? 'Monthly' : 'Yearly'}
          </button>
        ))}
      </div>
      <span
        className="text-xs font-semibold px-2 py-1 rounded-full transition-all duration-300"
        style={{
          background: 'rgba(52,211,153,0.12)', color: '#6ee7b7',
          opacity: interval === 'year' ? 1 : 0,
          transform: interval === 'year' ? 'scale(1)' : 'scale(0.85)',
        }}
      >
        Save {percentOff}%
      </span>
    </div>
  );
}

function PricingCard({ plan, interval, onSelect }: { plan: Plan; interval: Interval; onSelect: () => void }) {
  const [open, setOpen] = useState(false);
  const displayPrice = interval === 'year' ? plan.yearlyMonthlyPrice : plan.monthlyPrice;
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
        <div className="flex items-baseline gap-1 overflow-hidden">
          <span key={`${plan.name}-${interval}`} className="text-3xl font-bold text-white animate-fade-in-up">${displayPrice.toFixed(2)}</span>
          <span className="text-sm text-gray-500">/month</span>
        </div>
        <p className="text-xs text-gray-600 mt-0.5">
          {interval === 'year' ? `$${plan.yearlyTotal.toFixed(2)} billed yearly` : 'billed monthly'}
        </p>
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

// ─── Tools grid ───────────────────────────────────────────────────────────────
// Fast overview before the deep dives: what exists, in one scan. Each mini
// mockup mirrors the real in-app component it represents (same badge shapes,
// same accent colors) rather than an invented dashboard look, so it reads as
// "this is a screenshot of the real thing" rather than concept art.

// Every tile shows real words and real numbers. The earlier versions used
// anonymous grey bars for the text, which read as a half-loaded skeleton
// rather than a product — the single biggest "this looks unfinished" tell
// on the page.

const mockShell: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
};

function MiniIdeaCard() {
  return (
    <div className="rounded-lg p-2.5 h-full flex flex-col justify-center" style={mockShell}>
      <div className="flex gap-2 items-center">
        <div className="w-10 h-[26px] rounded flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#233246,#0f172a)' }}>
          <Play className="w-2.5 h-2.5 text-white/70" fill="currentColor" />
        </div>
        <p className="flex-1 min-w-0 text-[10.5px] leading-tight text-gray-200 truncate">3 hooks I stole from MrBeast</p>
        <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 pop-in" style={{ background: 'rgba(52,211,153,0.14)', color: '#6ee7b7' }}>
          <TrendingUp className="w-2.5 h-2.5" />2.4x
        </span>
      </div>
      <p className="text-[9.5px] text-gray-600 mt-1.5">@growthlab · 96K views</p>
    </div>
  );
}

function MiniRetention() {
  return (
    <div className="rounded-lg p-2.5 h-full flex flex-col justify-center" style={mockShell}>
      {/* preserveAspectRatio="none" stretches the curve to the tile width, so
          every stroke carries vector-effect to keep its width honest. The drop
          marker is an HTML dot rather than an SVG circle for the same reason:
          a circle would come out as an ellipse under the same stretch. */}
      <div className="relative">
        <svg viewBox="0 0 100 34" className="w-full h-[38px] wipe-in" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lp-ret-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0EA4E9" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#0EA4E9" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points="0,4 18,7 34,9 44,10 52,23 68,26 84,29 100,30 100,34 0,34"
            fill="url(#lp-ret-fill)"
          />
          <polyline
            points="0,4 18,7 34,9 44,10 52,23 68,26 84,29 100,30"
            fill="none"
            stroke="#0EA4E9"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="48" y1="0" x2="48" y2="34"
            stroke="#F87171" strokeWidth="1" strokeDasharray="2 2" opacity="0.55"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="absolute w-[7px] h-[7px] rounded-full animate-dot-pulse"
          style={{ left: '48%', top: '48%', marginLeft: -3.5, marginTop: -3.5, background: '#F87171' }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9.5px] text-gray-600">Retention</span>
        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>
          drop at 0:11
        </span>
      </div>
    </div>
  );
}

function MiniHookScore() {
  return (
    <div className="rounded-lg p-2.5 h-full flex items-center gap-2.5" style={mockShell}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold pop-in" style={{ background: 'rgba(14,164,233,0.14)', color: '#38bdf8', border: '2px solid rgba(14,164,233,0.35)' }}>91</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold text-gray-200 leading-tight">Strong open</p>
        <p className="text-[9.5px] text-gray-600 leading-tight mt-0.5">3 rewrites ready</p>
      </div>
    </div>
  );
}

function MiniScriptBars() {
  const rows = [
    { label: 'Hook', pct: 92, color: '#38bdf8' },
    { label: 'Middle', pct: 58, color: '#fbbf24' },
    { label: 'CTA', pct: 31, color: '#f87171' },
  ];
  return (
    <div className="rounded-lg p-2.5 h-full flex flex-col justify-center gap-[7px]" style={mockShell}>
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-1.5">
          <span className="text-[9.5px] text-gray-500 w-[30px] flex-shrink-0">{r.label}</span>
          <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <span
              className="block h-full rounded-full grow-bar"
              style={{ width: `${r.pct}%`, background: r.color, animationDelay: `${i * 110}ms` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

const tools: { icon: React.ReactNode; name: string; desc: string; mock: React.ReactNode }[] = [
  { icon: <Users className="w-4 h-4" />, name: 'Competitors', desc: 'Track your rivals. Only the shorts beating their own average get through.', mock: <MiniIdeaCard /> },
  { icon: <VideoIcon className="w-4 h-4" />, name: 'Video Review', desc: 'Paste a link. Get the exact seconds people left, and what to do about it.', mock: <MiniRetention /> },
  { icon: <Wand2 className="w-4 h-4" />, name: 'Hook Lab', desc: 'Score the first line. Get three rewrites that still sound like you.', mock: <MiniHookScore /> },
  { icon: <FileText className="w-4 h-4" />, name: 'Script Lab', desc: 'Find the weak spots before you shoot a single frame.', mock: <MiniScriptBars /> },
];

function ToolsGrid() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {tools.map((tool, i) => (
        <RevealSection key={tool.name} delay={i * 80}>
          {/* The mock sits in a fixed-height box so the title and body line up
              across all four cards — the mocks are different heights, which
              previously left each card's text starting at its own offset. */}
          <div className="rounded-xl p-3.5 h-full flex flex-col motion-card" style={glass}>
            <div className="h-[78px] mb-3.5">{tool.mock}</div>
            <div className="flex items-center gap-1.5 mb-2">
              <span style={{ color: '#0EA4E9' }}>{tool.icon}</span>
              <h3 className="text-white font-semibold text-sm">{tool.name}</h3>
            </div>
            <p className="text-gray-500 text-xs leading-relaxed">{tool.desc}</p>
          </div>
        </RevealSection>
      ))}
    </div>
  );
}

// ─── Hero ticker ──────────────────────────────────────────────────────────────
// Constant motion under the hero CTA, and it replaces the old decorative
// thumbnail wall with something that actually says what the product does.
// Built from the same mini mockups the Tools grid uses — i.e. shapes lifted
// from real in-app components, not invented stat pills.

const tickerItems: { label: string; mock: React.ReactNode }[] = [
  { label: 'Outlier found', mock: <MiniIdeaCard /> },
  { label: 'Retention read', mock: <MiniRetention /> },
  { label: 'Hook scored', mock: <MiniHookScore /> },
  { label: 'Script checked', mock: <MiniScriptBars /> },
];

function HeroTicker() {
  return (
    <div className="marquee-mask w-full overflow-hidden py-1" aria-hidden="true">
      {/* The item list is rendered twice — the CSS loop translates the track by
          exactly -50%, so the second copy lands where the first began. */}
      <div className="marquee-track items-center gap-3 min-[2200px]:gap-5">
        {[0, 1].map(copy =>
          tickerItems.map((item, i) => (
            <div key={`${copy}-${i}`} className="w-[186px] min-[2200px]:w-[236px] flex-shrink-0">
              <div className="h-[78px] min-[2200px]:h-[100px]">{item.mock}</div>
              <p className="mt-1.5 text-[10px] min-[2200px]:text-[12px] font-medium uppercase tracking-[0.12em] text-gray-600 text-center">
                {item.label}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Competitors spotlight ──────────────────────────────────────────────────
// The differentiator gets its own deep dive because it's the feature people
// actually react to (see the Discord quotes). Rebuilt 2026-08-17: the previous
// version wrapped the card in fake browser chrome with floating annotation
// bubbles pinned around it, and Ivan read the whole thing as unfinished /
// obviously generated. Now it's one finished card next to plain prose — the
// explanations that used to float are just a list, and nothing on screen is a
// placeholder.

const competitorPoints: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <TrendingUp className="w-4 h-4" />,
    title: 'Scored against itself',
    desc: "2.4x is against that channel's own median views per day. A small channel's breakout gets in; a big channel's routine upload does not.",
  },
  {
    icon: <Lightbulb className="w-4 h-4" />,
    title: 'Re-angled for your niche',
    desc: 'You get the format rebuilt around your topic, so it lands as your video instead of a copy of someone else’s.',
  },
  {
    icon: <FileText className="w-4 h-4" />,
    title: 'Straight into a script',
    desc: 'Pick one and it becomes an outline, then a word-for-word script written in your voice.',
  },
];

function CompetitorsSpotlight() {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-center">
      {/* The card, at the size it actually appears in the Feed */}
      <div className="rounded-2xl p-4 sm:p-5 motion-card" style={glass}>
        <div className="flex gap-3">
          <div className="w-[74px] h-[46px] rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#233246,#0f172a)' }}>
            <Play className="w-4 h-4 text-white/70" fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium leading-snug mb-2">3 hooks I stole from MrBeast (and why they work)</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(52,211,153,0.14)', color: '#6ee7b7' }}>
                <TrendingUp className="w-3 h-3" />2.4x
              </span>
              <span className="text-xs text-gray-500">@growthlab · 96K views</span>
            </div>
          </div>
        </div>
        <div className="mt-3.5 rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">Your angle</p>
          </div>
          <p className="text-violet-100 text-xs leading-relaxed">Same hook-swap format, rebuilt around 3 editing tricks from your niche instead.</p>
        </div>
      </div>

      <div className="space-y-5">
        {competitorPoints.map(p => (
          <div key={p.title} className="flex gap-3">
            <span className="mt-0.5 flex-shrink-0" style={{ color: '#0EA4E9' }}>{p.icon}</span>
            <div className="min-w-0">
              <h4 className="text-white font-semibold text-sm mb-1">{p.title}</h4>
              <p className="text-gray-500 text-[13px] leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Real-data block (YouTube connection) ────────────────────────────────────
// The one claim on this page that isn't a description of a feature but of a
// data source, so every line here is checked against what the backend really
// does. `analyze-with-gemini` calls the YouTube **Analytics** API for
// `averageViewPercentage` + an `audienceWatchRatio` curve over
// `elapsedVideoTimeRatio`, then feeds the biggest drop segments to the model
// as timestamps. Do NOT widen this into "all your analytics": impressions,
// CTR and traffic sources are not pulled. Retention is own-channel only
// (`ids=channel==MINE`), and YouTube's own data lags a day or two.

// Kept short and declarative. An earlier version explained that Google had
// verified the app and that the scopes are read-only — Ivan cut both: that's
// baseline for any real product, and spelling it out reads as a small tool
// arguing it deserves to be trusted.
const realDataPoints: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <TrendingUp className="w-4 h-4" />,
    title: 'The real curve, not a guess',
    desc: 'The same retention graph YouTube Studio shows you, read second by second.',
  },
  {
    icon: <Zap className="w-4 h-4" />,
    title: 'Two clicks to connect',
    desc: 'Connect once. Every analysis after that runs on your own numbers.',
  },
  {
    icon: <Check className="w-4 h-4" />,
    title: 'Fixes tied to timestamps',
    desc: 'Not "improve your hook" — what to change at 0:11, and why they left there.',
  },
];

function RealDataBlock() {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-center">
      <div className="rounded-2xl p-4 sm:p-5 motion-card" style={glass}>
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: 'rgba(52,211,153,0.14)', color: '#6ee7b7' }}>
            <Check className="w-3 h-3" />Your video
          </span>
          <span className="text-[11px] text-gray-600">from YouTube Analytics</span>
        </div>

        <div className="relative">
          <svg viewBox="0 0 100 40" className="w-full h-[104px] wipe-in" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lp-real-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0EA4E9" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#0EA4E9" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points="0,3 16,6 32,8 43,9 52,27 68,30 84,33 100,35 100,40 0,40" fill="url(#lp-real-fill)" />
            <polyline
              points="0,3 16,6 32,8 43,9 52,27 68,30 84,33 100,35"
              fill="none" stroke="#0EA4E9" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            />
            <line x1="47.5" y1="0" x2="47.5" y2="40" stroke="#F87171" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" vectorEffect="non-scaling-stroke" />
          </svg>
          <span
            className="absolute w-2.5 h-2.5 rounded-full animate-dot-pulse"
            style={{ left: '47.5%', top: '45%', marginLeft: -5, marginTop: -5, background: '#F87171' }}
          />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] text-gray-600 mb-0.5">Avg. viewed</p>
            <p className="text-sm font-bold text-white">41%</p>
          </div>
          <div className="flex-1 rounded-lg px-3 py-2" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)' }}>
            <p className="text-[10px] text-gray-600 mb-0.5">Biggest drop</p>
            <p className="text-sm font-bold" style={{ color: '#F87171' }}>0:11</p>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {realDataPoints.map(p => (
          <div key={p.title} className="flex gap-3">
            <span className="mt-0.5 flex-shrink-0" style={{ color: '#0EA4E9' }}>{p.icon}</span>
            <div className="min-w-0">
              <h4 className="text-white font-semibold text-sm mb-1">{p.title}</h4>
              <p className="text-gray-500 text-[13px] leading-relaxed">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

// The product's thesis: four tools that are actually one loop around a single
// upload. Deliberately NOT a card grid — a grid says "four separate features",
// which is exactly the reading this section exists to kill. A rail with
// numbered stops says "sequence", and the phase labels say where the upload
// itself sits in it.
const pipelineSteps: { phase?: string; tag: string; title: string; desc: string }[] = [
  {
    phase: 'Before you film',
    tag: 'Competitors',
    title: 'Start from what already worked',
    desc: 'Track rival channels and get only the videos that beat their own average, not their latest uploads. The outlier is the signal.',
  },
  {
    tag: 'Competitors',
    title: 'Turn the winner into your script',
    desc: 'The proven format gets re-angled for your niche, then written out as an outline and a word-for-word script in your voice.',
  },
  {
    tag: 'Analyze',
    title: 'Catch the problems before the camera',
    desc: 'Score the hook and the script while a rewrite still costs you nothing. Weak spots get named, with three angles to replace them.',
  },
  {
    phase: 'After you post',
    tag: 'Analyze',
    title: 'Read the drop-off, not a guess',
    desc: 'Connect your channel and Hershy pulls your real retention curve, finds the exact seconds people left, and tells you what to change next time.',
  },
];

function PipelineSection() {
  return (
    <div className="relative">
      {/* The rail itself. Fades downward so it reads as flow, not a border. */}
      <div
        aria-hidden="true"
        className="absolute left-[15px] top-3 bottom-3 w-px"
        style={{ background: 'linear-gradient(180deg, rgba(14,164,233,0.45), rgba(14,164,233,0.06))' }}
      />

      {pipelineSteps.map((step, i) => (
        <RevealSection key={step.title} delay={i * 90}>
          {step.phase && (
            <p className={`text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-600 mb-3 pl-[46px] ${i > 0 ? 'mt-4' : ''}`}>
              {step.phase}
            </p>
          )}
          <div className="relative flex gap-5 pb-8 last:pb-0">
            <div
              className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: '#0B121F', border: '1px solid rgba(14,164,233,0.35)' }}
            >
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#0EA4E9' }}>{i + 1}</span>
            </div>
            {/* The rail spans the full section so it lines up with the panels
                above, but the copy stays capped for a readable line length. */}
            <div className="pt-1 min-w-0 max-w-2xl">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-1.5">
                <h3 className="text-white font-semibold text-[15px] sm:text-base">{step.title}</h3>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(14,164,233,0.10)', color: '#38BDF8' }}
                >
                  {step.tag}
                </span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
            </div>
          </div>
        </RevealSection>
      ))}
    </div>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

// Verbatim Discord messages, quoted as such. One per pillar of the product, so
// each card lands on a different problem rather than four people praising the
// same feature. `tool` labels which part the quote is about and `note` is the
// takeaway for anyone scrolling past without reading the quotes themselves.
const testimonials: { quote: string[]; name: string; tool: string; note: string }[] = [
  {
    quote: [
      'bro I used to spend like 3 hours every night looking at what other channels posted',
      'added 4 competitors yesterday and the tool literally picked out the exact 2 shorts that blew up on their channels lol',
    ],
    name: 'alexvfx',
    tool: 'Competitors',
    note: 'Saved hours on trend research. Found 2 winning concepts in under 2 minutes.',
  },
  {
    quote: [
      'the script feedback told me my hook was way too slow at second 3',
      're-wrote the first 5 seconds based on the prompt, retention actually stayed flat through the intro',
    ],
    name: 'shindy',
    tool: 'Script Lab',
    note: 'Fixed a weak hook before filming. Saw a direct improvement in early retention.',
  },
  {
    quote: [
      'wait so it actually overlays the script over the retention dip?',
      'figured out people were swiping away right when I started doing the sponsor plug... that graph read is insane',
    ],
    name: 'd4wki',
    tool: 'Video Review',
    note: 'Identified the exact second viewers dropped off using automated graph analysis.',
  },
  {
    quote: [
      'usually ai scripts sound like a corporate robot talking to toddlers',
      'this actually kept my slang and structure, just adapted the competitor idea to my niche',
    ],
    name: 'yonatan',
    tool: 'Competitors',
    note: 'Generated a ready-to-film script without losing personal creator voice.',
  },
];

function TestimonialsSection() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {testimonials.map((t, i) => (
        <RevealSection key={t.name} delay={i * 100}>
          <div className="rounded-2xl p-5 sm:p-6 h-full flex flex-col motion-card" style={glass}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.25)' }}>
                <DiscordIcon className="w-4 h-4" style={{ color: '#8ea1ff' }} />
              </div>
              <span className="text-sm font-semibold text-white">{t.name}</span>
              <span className="text-[10px] text-gray-600 ml-auto">Discord</span>
            </div>
            <div className="space-y-2.5 mb-5 flex-1">
              {t.quote.map(line => (
                <p key={line} className="text-gray-200 text-sm sm:text-[15px] leading-relaxed">&ldquo;{line}&rdquo;</p>
              ))}
            </div>
            {/* The takeaway carries the tool name too, so someone scrolling
                past the quotes still sees which part of the product this is. */}
            <div className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.15)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#38BDF8' }}>{t.tool}</p>
              <p className="text-xs text-gray-400 leading-relaxed">{t.note}</p>
            </div>
          </div>
        </RevealSection>
      ))}
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const faqs: { q: string; a: string }[] = [
  {
    q: 'What does Hershy actually do?',
    a: 'Your shorts producer. It steals the ideas already working on your competitors\' channels, rebuilds them for yours, checks the hook and script before you film, then reads your real retention curve after you post and tells you exactly where people left. Shorts only. That\'s the whole point.',
  },
  {
    // Second on purpose: connecting the channel is the thing that separates
    // Hershy from a chat wrapper, so it gets asked before the feature list.
    // Every claim below matches `analyze-with-gemini` — retention curve via
    // the YouTube Analytics API, own channel only, read-only scopes.
    q: 'What happens when I connect my YouTube?',
    a: 'You get your real numbers instead of an opinion. Hershy reads the same audience-retention curve YouTube Studio shows you, finds the exact seconds viewers dropped off, and writes every fix against those timestamps. It takes two clicks, and everything else works without connecting anything.',
  },
  {
    q: 'What tools are included?',
    a: 'Competitors (rival-channel tracking and idea extraction), Video Review (retention analysis on any Short), Hook Lab (hook scoring and rewrites), and Script Lab (full-script breakdown before you film). One credit balance covers all four.',
  },
  {
    q: 'Can I start for free?',
    a: 'Yes. New accounts get 50 credits, no card required - enough for a couple of video reviews or a handful of hook and script checks. No monthly refill on the free tier; upgrade when you need more.',
  },
  {
    q: 'How does Competitors find ideas?',
    a: 'It compares every recent short from a tracked channel against that channel\'s own median views per day, and only surfaces the ones that clearly beat it. A big channel posting a normal video stays out; a small channel with a breakout gets in. The idea then gets rewritten for your niche, not just copied.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, from your billing portal, and you keep access until the period you already paid for runs out. No contract, no cancellation call.',
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    /* One panel with dividers rather than six bare rows: the rest of the page
       is built out of glass cards, and a borderless list sat outside that
       language. Full section width so its edges line up with every other
       panel — the answers keep their own max-width so the lines stay short. */
    <div className="rounded-2xl overflow-hidden" style={glass}>
      {faqs.map((f, i) => (
        <div key={f.q} style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.07)' } : undefined}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 px-4 sm:px-5 py-4 text-left group"
            aria-expanded={open === i}
          >
            <span className="text-white font-medium text-sm sm:text-[15px] group-hover:text-[#38BDF8] transition-colors">{f.q}</span>
            <ChevronDown
              className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}
              style={{ color: open === i ? '#0EA4E9' : '#4b5563' }}
            />
          </button>
          {open === i && (
            <p className="text-gray-500 text-sm leading-relaxed px-4 sm:px-5 pb-4 pr-8 sm:pr-12 max-w-3xl animate-fade-in">{f.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Short forms of the SAME verbatim Discord lines quoted in full further down
// the page — nothing here is written for the landing page. Rotating them keeps
// the hero moving without needing more proof than actually exists; when a
// reviews channel exists, add real lines here rather than inventing filler.
// `short` is only set on the two lines too long for a phone-width pill, and is
// a plain prefix cut — no rewording, and desktop always shows the full line.
const heroQuotes: { text: string; short?: string; name: string }[] = [
  { text: 'bro i dont even check analytics myself anymore', short: 'i dont even check analytics myself', name: 'astro' },
  { text: 'feels like cheating tbh', name: 'desire' },
  { text: 'cut my editing time in half', name: 'c4ctus' },
  { text: 'saved me like 2 hours of scrolling for inspo', short: 'saved me like 2 hours of scrolling', name: 'abdalla' },
  { text: 'just followed ai advice', name: '90mh' },
];

function HeroQuotes() {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  // Fades the current line fully out, swaps the text while it's invisible,
  // then fades back in. Crossfading two stacked copies instead left both
  // half-visible mid-transition, which read as a ghosted double image.
  useEffect(() => {
    let swap: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => {
      setShown(false);
      swap = setTimeout(() => {
        setI(n => (n + 1) % heroQuotes.length);
        setShown(true);
      }, 320);
    }, 3800);
    return () => { clearInterval(tick); clearTimeout(swap); };
  }, []);

  const q = heroQuotes[i];
  return (
    <div className="animate-fade-in flex justify-center mb-6 px-2">
      {/* Always the full max width, so swapping to a shorter quote never
          resizes the pill under the headline. */}
      <div
        className="flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full w-full max-w-[330px] sm:max-w-[520px]"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8ea1ff' }} />
        <span
          className="flex-1 min-w-0 flex items-center justify-center gap-1.5 transition-opacity duration-300"
          style={{ opacity: shown ? 1 : 0 }}
        >
          <span className="text-[12px] sm:text-[13px] text-gray-300 truncate">
            <span className="sm:hidden">&ldquo;{q.short ?? q.text}&rdquo;</span>
            <span className="hidden sm:inline">&ldquo;{q.text}&rdquo;</span>
          </span>
          <span className="text-[12px] sm:text-[12.5px] text-gray-600 flex-shrink-0">· {q.name}</span>
        </span>
      </div>
    </div>
  );
}

const navLinks: { label: string; id?: string; href?: string }[] = [
  { label: 'Tools', id: 'tools' },
  { label: 'System', id: 'system' },
  { label: 'Reviews', id: 'reviews' },
  { label: 'Pricing', id: 'pricing' },
  { label: 'FAQ', id: 'faq' },
  // Points at the on-page section, not straight out to Discord: the section
  // says what's actually in there before sending anyone off-site.
  { label: 'Community', id: 'community' },
];

export function LandingPage() {
  const [authModal, setAuthModal] = useState<null | 'login' | 'signup'>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [billingInterval, setBillingInterval] = useState<Interval>('year');
  const [heroUrl, setHeroUrl] = useState('');
  const [heroError, setHeroError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  // The placeholder carries a concrete example, but the full one doesn't fit a
  // phone-width field, so the example is dropped below sm rather than clipped
  // mid-URL. Placeholders can't be styled per breakpoint in CSS.
  const [wideField, setWideField] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setWideField(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [menuClosing, setMenuClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Flips the nav icon back to the hamburger as soon as the fold-up starts,
  // rather than at unmount, so the icon and the panel move together.
  const menuOpen = mobileMenu && !menuClosing;

  // Keeps the sheet mounted long enough to play its fold-up, so closing is
  // animated instead of the panel blinking out of existence.
  const closeMenu = () => {
    setMenuClosing(true);
    setTimeout(() => { setMobileMenu(false); setMenuClosing(false); }, 220);
  };

  // Mirrors extractVideoId in HookAnalysis exactly, so nothing this accepts
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
  // take here. The link is stashed, signup opens, and HookAnalysis picks the
  // key up on mount and runs the analysis without asking for it again.
  const handleHeroAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = heroUrl.trim();
    if (!trimmed) return;
    if (!looksLikeVideoLink(trimmed)) {
      setHeroError('That does not look like a video link. Paste a Short, e.g. youtube.com/shorts/...');
      return;
    }
    setHeroError('');
    localStorage.setItem('hershy_pending_video_url', trimmed);
    setAuthModal('signup');
  };

  // Bottom glow fades out as you scroll down the first screen
  const glowOpacity = Math.max(0, 1 - scrollTop / 160);

  // The page scrolls in a div, not the window, so anchor hrefs would jump the
  // wrong box — scroll the section into view manually instead.
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

      {/* Ambient color drift behind the hero. Sits above the dot grid but under
          the content, and never stops moving, so the first screen has life
          before the visitor touches anything. Blue + violet only — the two
          accents already in the product, at low enough opacity to stay dark. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div
          className="absolute rounded-full animate-drift-a"
          style={{
            top: '-16%', left: '-10%', width: '58vw', height: '58vw', maxWidth: 760, maxHeight: 760,
            background: 'radial-gradient(circle, rgba(14,164,233,0.20), rgba(14,164,233,0) 68%)',
            filter: 'blur(46px)',
          }}
        />
        <div
          className="absolute rounded-full animate-drift-b"
          style={{
            top: '-8%', right: '-14%', width: '52vw', height: '52vw', maxWidth: 680, maxHeight: 680,
            background: 'radial-gradient(circle, rgba(139,92,246,0.18), rgba(139,92,246,0) 68%)',
            filter: 'blur(52px)',
          }}
        />
        <div
          className="absolute rounded-full animate-drift-c"
          style={{
            top: '22%', left: '28%', width: '46vw', height: '46vw', maxWidth: 600, maxHeight: 600,
            background: 'radial-gradient(circle, rgba(56,189,248,0.13), rgba(56,189,248,0) 70%)',
            filter: 'blur(58px)',
          }}
        />
      </div>

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

        {/* ── Navbar ─────────────────────────────────────────────────────────
            Sticky inside the scroll container (not the window), since the page
            scrolls in this div rather than the body. */}
        <nav
          className="sticky top-0 z-40 w-full flex-shrink-0 animate-fade-in"
          style={{ background: 'rgba(10,15,26,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Three equal columns rather than justify-between: the brand and the
              CTA are different widths, so a flex row pushed the link group
              visibly off-centre. The grid pins the middle column to the true
              centre of the bar no matter what flanks it. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 sm:px-6 py-3.5 max-w-6xl mx-auto w-full">
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2 font-black text-white uppercase tracking-[0.14em] text-[15px] sm:text-lg whitespace-nowrap justify-self-start"
            >
              <img src="/hersh-mark.png" alt="" className="h-[15px] sm:h-[17px] w-auto flex-shrink-0" />
              HERSHY
            </button>

            <div className="hidden md:flex items-center gap-0.5 justify-self-center">
              {navLinks.map(link => (
                link.href ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-[13.5px] font-medium text-gray-400 hover:text-white transition-colors rounded-lg whitespace-nowrap"
                  >
                    {link.label}
                  </a>
                ) : (
                  <button
                    key={link.label}
                    onClick={() => scrollTo(link.id!)}
                    className="px-3 py-1.5 text-[13.5px] font-medium text-gray-400 hover:text-white transition-colors rounded-lg whitespace-nowrap"
                  >
                    {link.label}
                  </button>
                )
              ))}
            </div>
            {/* Keeps the 3-column grid intact once the links are hidden, so the
                brand and CTA stay pinned to the same edges on phones. */}
            <div className="md:hidden" />

            <div className="flex items-center justify-self-end">
              {/* Phones get the hamburger alone — the CTA there was competing
                  with the hero's paste field for the same tap. */}
              <button
                onClick={() => setAuthModal('login')}
                className="hidden md:flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg whitespace-nowrap hover:opacity-90 transition-opacity"
                style={{ background: '#0EA4E9' }}
              >
                Get started
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              {/* The only thing that changes when the menu opens. Both icons
                  render inside the same 24x24 box, so the bar's height never
                  shifts and the brand beside it does not move a pixel — the
                  menu used to draw its own copy of the logo on top of this
                  one, which is what made it look like it jumped and faded. */}
              <button
                onClick={() => (menuOpen ? closeMenu() : setMobileMenu(true))}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                className="md:hidden -mr-1 p-1.5 text-white"
              >
                <span className="w-6 h-6 flex items-center justify-center">
                  {menuOpen ? (
                    <X className="w-6 h-6" />
                  ) : (
                    <svg width="24" height="16" viewBox="0 0 24 16" fill="none" aria-hidden="true">
                      <path d="M1 1.5h22M1 8h22M1 14.5h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </div>
        </nav>

        {/* ── Mobile menu ──────────────────────────────────────────────────────
            Sits INSIDE the scroll container at z-30 so the sticky nav (z-40)
            keeps painting over it: the navbar stays put and only its icon
            swaps. One uniform blurred layer over the whole viewport, with no
            second tint behind the links, so there's no visible seam where the
            panel would otherwise end. */}
        {mobileMenu && (
          <div className="fixed inset-0 z-30 md:hidden" onClick={closeMenu}>
            <div
              className={`absolute inset-0 ${menuClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
              style={{ background: 'rgba(6,10,18,0.66)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            />
            {/* Unfolds down from behind the navbar and folds back up on close */}
            <div
              className={`absolute inset-x-0 top-0 ${menuClosing ? 'animate-fold-up' : 'animate-unfold-down'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col px-5 pt-[70px] pb-6">
                {navLinks.map(link => (
                  link.href ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeMenu}
                      className="py-3 text-[17px] text-gray-200 active:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <button
                      key={link.label}
                      /* Scrolls only once the sheet is gone: scrollIntoView while
                         a full-screen overlay is still up lands on the wrong offset. */
                      onClick={() => { closeMenu(); setTimeout(() => scrollTo(link.id!), 260); }}
                      className="py-3 text-left text-[17px] text-gray-200 active:text-white transition-colors"
                    >
                      {link.label}
                    </button>
                  )
                ))}

                {/* Set apart from the anchors above with a hairline and the
                    brand tint: it's the one entry that does something rather
                    than jumping down the page. */}
                <button
                  onClick={() => { closeMenu(); setAuthModal('login'); }}
                  className="mt-2 pt-5 py-3 text-left text-[17px] font-medium transition-colors"
                  style={{ color: '#38BDF8', borderTop: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Exactly the viewport minus the nav. It used to be cut 100px shorter
            so the next section would peek and invite a scroll, but what peeked
            was a half-cropped heading that read as broken; the explicit "See
            how it works" cue at the bottom of the hero does that job instead. */}
        <div className="flex flex-col min-h-[calc(100dvh-65px)]">
          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <section className="relative w-full flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 pt-8 pb-6">

          {/* Center content */}
          <div className="relative z-10 max-w-3xl w-full">
            {/* Social proof sits above the headline, and it's a real verbatim
                Discord line from a real user (the same one quoted in full
                further down) — never an invented "trusted by N creators" count. */}
            <HeroQuotes />

            {/* Never wraps: the break after "posting" split the line in a way
                that read as a layout bug. The vw term is tuned so all 19
                characters still fit at 360px wide. */}
            <h1 className="animate-fade-in-up font-black text-white leading-[1.05] mb-5 whitespace-nowrap" style={{ fontSize: 'clamp(1.75rem, 8.2vw, 5rem)', letterSpacing: '-0.02em' }}>
              Stop posting blind.
            </h1>

            <p className="animate-fade-in-up delay-100 text-base sm:text-lg text-gray-500 leading-relaxed mb-8 max-w-md sm:max-w-xl mx-auto text-balance">
              Your shorts producer. It steals what already works, rebuilds it for your channel, and tells you exactly where the last one lost people.
            </p>

            {/* The paste field is the only hero CTA now — the button above it
                was a second door to the same signup and split attention. */}
            <div className="animate-fade-in-up delay-200 flex flex-col items-center gap-3">
              <form onSubmit={handleHeroAnalyze} className="w-full max-w-lg flex items-center gap-2 rounded-2xl p-2" style={glass}>
                <input
                  type="text"
                  value={heroUrl}
                  onChange={e => { setHeroUrl(e.target.value); if (heroError) setHeroError(''); }}
                  placeholder={wideField ? 'Paste a YouTube Shorts link (e.g. youtube.com/shorts/...)' : 'Paste a Shorts link'}
                  aria-invalid={!!heroError}
                  className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm sm:text-[15px] text-white placeholder-gray-500 outline-none"
                />
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2.5 text-white font-semibold rounded-xl text-sm whitespace-nowrap hover:opacity-90 flex-shrink-0 animate-glow-pulse"
                  style={{ background: '#0EA4E9' }}
                >
                  <Sparkles className="w-4 h-4" />
                  Analyze
                </button>
              </form>

              {heroError
                ? <p className="text-xs" style={{ color: '#F87171' }}>{heroError}</p>
                : <p className="text-xs text-gray-600">50 free credits · no card required</p>}
            </div>
          </div>

          {/* Ticker and cue travel as one block pinned to the bottom of the
              hero. The cue alone on mt-auto sat on the last visible line but
              tore a gap open above itself on tall phones; grouped, the slack
              collects above the ticker and the cue stays a fixed step under
              it, still inside the first screen. */}
          <div className="relative z-10 w-full mt-auto pt-12 flex flex-col items-center">
            <div className="w-full max-w-4xl min-[2200px]:max-w-6xl animate-fade-in delay-300">
              <HeroTicker />
            </div>

            <button
              onClick={() => scrollTo('tools')}
              className="mt-8 flex flex-col items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors animate-fade-in delay-500"
            >
              See how it works
              <ChevronDown className="w-4 h-4 animate-float" />
            </button>
          </div>
          </section>
        </div>

        {/* ── 1. Tools: everything that exists, then the flagship up close ───── */}
        <section id="tools" className="pt-8 sm:pt-14 pb-10 sm:pb-16 px-6 max-w-4xl mx-auto scroll-mt-20">
          <RevealSection className="mb-8 sm:mb-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#0EA4E9' }}>The tools</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 text-balance leading-tight">
              Four tools. Shorts and nothing else.
            </h2>
            <p className="text-gray-500 text-sm sm:text-[15px] leading-relaxed">
              No long-form. No podcasts. No everything-app. That's exactly why it can name the second people left instead of handing you another generic content tip.
            </p>
          </RevealSection>

          <ToolsGrid />

          <RevealSection className="mt-12 sm:mt-16 mb-6 sm:mb-8 max-w-2xl">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2 text-balance">Steal what already works</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Forget "what's trending". Hershy surfaces the shorts beating <em className="not-italic text-gray-300">their own channel's average</em>, then rebuilds the angle for yours.
            </p>
          </RevealSection>
          <RevealSection>
            <CompetitorsSpotlight />
          </RevealSection>
        </section>

        {/* ── 2. System: the real-data claim, then the loop it feeds ─────────── */}
        <section id="system" className="pb-10 sm:pb-24 px-6 max-w-4xl mx-auto scroll-mt-20">
          <RevealSection className="mb-8 sm:mb-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: '#0EA4E9' }}>The system</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 text-balance leading-tight">
              It runs on your real numbers.
            </h2>
            <p className="text-gray-500 text-sm sm:text-[15px] leading-relaxed">
              Connect your channel and the guessing stops. Every drop Hershy names comes off your own retention data, so the notes are about your video, not your topic.
            </p>
          </RevealSection>

          <RevealSection>
            <RealDataBlock />
          </RevealSection>

          <RevealSection className="mt-12 sm:mt-20 mb-8 sm:mb-12 max-w-2xl">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-2 text-balance">How it connects</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Every upload feeds the next one - the idea becomes a script, the script gets checked before you film, and what actually happened after you post shapes the next idea.
            </p>
          </RevealSection>

          <PipelineSection />
        </section>

        {/* ── 3. Reviews ────────────────────────────────────────────────────── */}
        <section id="reviews" className="pb-12 sm:pb-24 px-6 max-w-4xl mx-auto scroll-mt-20">
          <RevealSection className="mb-8 sm:mb-12 max-w-xl">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-balance">From the Discord</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Not a wall of five-star reviews. Just what people said after using it.
            </p>
          </RevealSection>
          <TestimonialsSection />
        </section>

        {/* ── Pricing ───────────────────────────────────────────────────────── */}
        <section id="pricing" className="pb-10 sm:pb-24 px-6 max-w-4xl mx-auto scroll-mt-20">
          <RevealSection className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-balance">Simple pricing</h2>
            <p className="text-gray-500 text-sm">Pick the plan that fits, cancel anytime.</p>
          </RevealSection>
          <RevealSection className="mb-8 sm:mb-12">
            <BillingToggle interval={billingInterval} onChange={setBillingInterval} percentOff={proPercentOff} />
          </RevealSection>
          {/* Same 2-up grid at the same width as the Reviews cards, so the
              two sections' card edges land on the same vertical lines. */}
          <div className="grid sm:grid-cols-2 gap-4">
            {pricingPlans.map((plan, i) => (
              <RevealSection key={plan.name} delay={i * 80}>
                <PricingCard plan={plan} interval={billingInterval} onSelect={() => setAuthModal('signup')} />
              </RevealSection>
            ))}
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section id="faq" className="pb-14 sm:pb-24 px-6 max-w-4xl mx-auto scroll-mt-20">
          <RevealSection className="text-center mb-6 sm:mb-10">
            <h2 className="text-xl sm:text-2xl font-bold text-white text-balance">Questions</h2>
          </RevealSection>
          <RevealSection>
            <FAQSection />
          </RevealSection>
        </section>

        {/* ── 6. Community ──────────────────────────────────────────────────── */}
        <section id="community" className="pb-14 sm:pb-24 px-6 max-w-4xl mx-auto scroll-mt-20">
          <RevealSection>
            <div className="rounded-2xl p-6 sm:p-8 text-center motion-card" style={glass}>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2.5 text-balance">Updates land here first</h2>
              <p className="text-gray-500 text-sm leading-relaxed max-w-md mx-auto mb-6">
                New tools land there before they ship, and bugs posted there get looked at first. Codes drop in now and then too.
              </p>
              <a
                href="https://discord.com/invite/N8S6C95Ry2"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity"
                style={{ background: '#5865F2' }}
              >
                Join the Discord
                <DiscordIcon className="w-4 h-4" />
              </a>
            </div>
          </RevealSection>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="px-6 py-8 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-4 text-xs">
            <a href="https://discord.com/invite/N8S6C95Ry2" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors">
              <DiscordIcon className="w-3.5 h-3.5" />Discord
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
