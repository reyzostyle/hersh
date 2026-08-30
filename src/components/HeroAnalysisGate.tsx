import { useEffect } from 'react';
import { Sparkles, History } from 'lucide-react';
import { AppShell } from './AppShell';
import { AnalysisProgressModal } from './AnalysisProgressModal';

// The gate between pasting a link on the landing page and having an account.
//
// It puts the visitor straight into the app: the real shell, the real analysis
// screen behind it, and the same progress modal a signed-in analysis uses. The
// account is asked for at the end of that run, not at the start.
//
// The analysis itself cannot have started yet - the function needs a signed-in
// user, spends credits and writes a row against a user id - so the stages here
// are a stand-in, run faster than the real thing. The link is already in
// localStorage, so signing up drops the visitor into the genuine analysis with
// nothing to re-enter.
const SPEED = 4;

// A still of the analysis screen. The real one fetches history and credits on
// mount, which needs an account; behind a blurred modal this reads the same
// and asks nothing of a server.
function AnalysisScreenStill({ url }: { url: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 select-none pointer-events-none">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Analysis</h1>
          <p className="text-sm text-gray-500">Paste a YouTube URL or upload your video file</p>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <History className="w-4 h-4" /> History
        </div>
      </div>

      <div
        className="rounded-xl p-4 sm:p-5"
        style={{
          background: 'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.04))',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex-1 px-4 py-2.5 rounded-lg text-sm text-gray-300 truncate"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {url}
          </div>
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Sparkles className="w-4 h-4" /> Analyze
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroAnalysisGate({
  url,
  onNeedAccount,
  onBack,
}: {
  url: string;
  onNeedAccount: () => void;
  onBack: () => void;
}) {
  // Escape goes back to the landing page rather than trapping someone who
  // pasted a link by accident.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-40">
      <AppShell activeTab="hooks" onTabChange={() => {}}>
        <AnalysisScreenStill url={url} />
      </AppShell>

      <AnalysisProgressModal
        open
        mode="url"
        done={false}
        speed={SPEED}
        onStagesComplete={onNeedAccount}
      />
    </div>
  );
}
