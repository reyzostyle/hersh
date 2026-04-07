import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

function AuthCallbackHandler() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setStatus('error');
      setErrorMsg('Authorization was denied.');
      setTimeout(() => {
        window.history.replaceState({}, '', '/');
      }, 2000);
      return;
    }

    if (!code) {
      window.history.replaceState({}, '', '/');
      return;
    }

    if (user) {
      const redirectUri = `${window.location.origin}/auth/callback`;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-oauth-callback`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, userId: user.id, redirectUri }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to connect YouTube account');
          window.history.replaceState({}, '', '/');
        })
        .catch((err) => {
          setStatus('error');
          setErrorMsg(err.message || 'Failed to connect YouTube account');
          setTimeout(() => {
            window.history.replaceState({}, '', '/');
          }, 3000);
        });
    } else {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            setStatus('error');
            setErrorMsg(error.message || 'Sign in failed');
            setTimeout(() => {
              window.history.replaceState({}, '', '/');
            }, 3000);
          } else {
            window.history.replaceState({}, '', '/');
          }
        });
    }
  }, [user]);

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

  const isAuthCallback = window.location.pathname === '/auth/callback';

  if (isAuthCallback) {
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
