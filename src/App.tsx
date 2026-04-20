import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase, getSessionToken } from './lib/supabase';

function SetNewPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Minimum 6 characters'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = '/'; }, 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1B2A 100%)' }}>
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        {done ? (
          <div className="text-center">
            <div className="text-green-400 text-3xl mb-3">✓</div>
            <p className="text-white font-semibold">Password updated!</p>
            <p className="text-gray-400 text-sm mt-1">Redirecting...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-white font-semibold text-lg mb-1">Set new password</p>
              <p className="text-gray-400 text-sm mb-5">Choose a new password for your account.</p>
            </div>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="New password" required
              className="w-full px-4 py-2.5 rounded-xl text-white focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            />
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm password" required
              className="w-full px-4 py-2.5 rounded-xl text-white focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            />
            {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl p-3">{error}</p>}
            <button type="submit" disabled={saving} className="w-full py-3 text-white rounded-xl font-semibold disabled:opacity-50" style={{ background: '#0EA4E9' }}>
              {saving ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AuthCallbackHandler() {
  const [status, setStatus] = useState<'processing' | 'error' | 'success'>('processing');
  const [isRecovery, setIsRecovery] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setStatus('error');
      setErrorMsg('Authorization was denied.');
      setTimeout(() => window.history.replaceState({}, '', '/'), 2000);
      return;
    }

    if (!code) {
      window.history.replaceState({}, '', '/');
      return;
    }

    // Check if this is a YouTube OAuth callback (userId stored before redirect)
    const youtubeUserId = sessionStorage.getItem('youtube_oauth_user_id');

    if (youtubeUserId) {
      sessionStorage.removeItem('youtube_oauth_user_id');
      const redirectUri = 'https://hersh.live/auth/callback';

      getSessionToken().then(token => {
        if (!token) {
          setStatus('error');
          setErrorMsg('Not authenticated. Please sign in again.');
          setTimeout(() => window.history.replaceState({}, '', '/'), 4000);
          return Promise.reject(new Error('Not authenticated'));
        }
        return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-oauth-callback`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, redirectUri }),
        });
      }).then(async (res) => {
        if (!res) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to connect YouTube');
        setStatus('success');
        setTimeout(() => {
          window.history.replaceState({}, '', '/');
          window.location.reload();
        }, 1500);
      })
        .catch((err) => {
          setStatus('error');
          setErrorMsg(err.message || 'Failed to connect YouTube account');
          setTimeout(() => window.history.replaceState({}, '', '/'), 4000);
        });
      return;
    }

    // Otherwise it's a Supabase Auth callback (login, signup confirmation, or password reset)
    const type = params.get('type');
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setStatus('error');
          setErrorMsg(error.message || 'Sign in failed');
          setTimeout(() => window.history.replaceState({}, '', '/'), 3000);
        } else if (type === 'recovery') {
          setIsRecovery(true);
        } else {
          window.history.replaceState({}, '', '/');
        }
      })
      .catch((err: unknown) => {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Sign in failed');
        setTimeout(() => window.history.replaceState({}, '', '/'), 3000);
      });
  }, []);

  if (isRecovery) {
    return <SetNewPasswordForm />;
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-[#212121] flex flex-col items-center justify-center gap-3">
        <p className="text-emerald-400 text-sm font-medium">✓ YouTube account connected!</p>
        <p className="text-gray-500 text-xs">Redirecting...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#212121] flex flex-col items-center justify-center gap-3">
        <p className="text-red-400 text-sm">{errorMsg}</p>
        <p className="text-gray-500 text-xs">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#0EA4E9] animate-spin" />
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  // Save referral code to referral_signups once after signup.
  // UNIQUE(user_id) in DB ensures this is a no-op for users who already have a row,
  // so it's safe to attempt on every login — only the first ever insert sticks.
  useEffect(() => {
    if (!user) return;
    const refCode = localStorage.getItem('hersh_ref');
    if (!refCode) return;

    // Guard: only record for genuinely new accounts (first sign-in).
    // created_at ≈ last_sign_in_at (within 5 min) means this is the first session.
    const createdAt = new Date((user as any).created_at || 0).getTime();
    const lastSignIn = new Date((user as any).last_sign_in_at || 0).getTime();
    const isFirstSession =
      Number.isFinite(createdAt) && Number.isFinite(lastSignIn)
        ? Math.abs(lastSignIn - createdAt) < 5 * 60 * 1000
        : false;

    console.log('[referral] attempting insert', {
      userId: user.id,
      refCode,
      createdAt: (user as any).created_at,
      lastSignIn: (user as any).last_sign_in_at,
      isFirstSession,
    });

    if (!isFirstSession) {
      console.log('[referral] not first session, clearing ref');
      localStorage.removeItem('hersh_ref');
      return;
    }

    supabase
      .from('referral_signups')
      .insert({ user_id: user.id, referral_code: refCode })
      .then(({ error }) => {
        if (error) {
          console.error('[referral] insert failed:', error);
          // If it's a duplicate (user already has a row), clear ref too.
          if (error.code === '23505') localStorage.removeItem('hersh_ref');
          return;
        }
        console.log('[referral] signup recorded:', refCode);
        localStorage.removeItem('hersh_ref');
      });
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#212121] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#0EA4E9] animate-spin" />
      </div>
    );
  }

  if (window.location.pathname === '/auth/callback') {
    return <AuthCallbackHandler />;
  }

  return user ? <Dashboard /> : <AuthPage />;
}

// Capture ?ref=code on landing and save to localStorage
const urlRef = new URLSearchParams(window.location.search).get('ref');
if (urlRef) {
  localStorage.setItem('hersh_ref', urlRef);
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
