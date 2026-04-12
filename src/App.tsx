import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase, getSessionToken } from './lib/supabase';

function AuthCallbackHandler() {
  const [status, setStatus] = useState<'processing' | 'error' | 'success'>('processing');
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
          // Password reset — redirect to settings so user can set new password
          window.history.replaceState({}, '', '/settings');
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

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
