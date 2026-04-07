import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

// Handles Supabase Auth callbacks (email magic link, Google OAuth via Supabase)
function AuthCallbackHandler() {
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
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

    // This is a Supabase Auth callback (email/Google sign-in)
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setStatus('error');
          setErrorMsg(error.message || 'Sign in failed');
          setTimeout(() => window.history.replaceState({}, '', '/'), 3000);
        } else {
          window.history.replaceState({}, '', '/');
        }
      });
  }, []);

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

// Shows success/error after YouTube OAuth (server-side callback redirects here)
function YouTubeCallbackResult() {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get('youtube_connected');
  const error = params.get('youtube_error');

  useEffect(() => {
    // Clean up URL and redirect to dashboard after a moment
    const timer = setTimeout(() => {
      window.history.replaceState({}, '', '/');
      window.location.reload();
    }, connected ? 1500 : 4000);
    return () => clearTimeout(timer);
  }, [connected]);

  return (
    <div className="min-h-screen bg-[#212121] flex flex-col items-center justify-center gap-3">
      {connected ? (
        <>
          <p className="text-emerald-400 text-sm font-medium">✓ YouTube account connected!</p>
          <p className="text-gray-500 text-xs">Redirecting...</p>
        </>
      ) : (
        <>
          <p className="text-red-400 text-sm">Failed to connect YouTube: {error}</p>
          <p className="text-gray-500 text-xs">Redirecting...</p>
        </>
      )}
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

  const params = new URLSearchParams(window.location.search);

  // YouTube OAuth server-side callback result
  if (params.has('youtube_connected') || params.has('youtube_error')) {
    return <YouTubeCallbackResult />;
  }

  // Supabase Auth callback
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
