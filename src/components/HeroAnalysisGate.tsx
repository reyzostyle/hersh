import { useEffect } from 'react';
import { AddOutlineIcon as Plus, ArrowUpOutlineIcon as ArrowUp } from '@solar-icons/react';
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

// A still of the Analyze screen. The real one fetches history and credits on
// mount, which needs an account; behind a blurred modal this reads the same and
// asks nothing of a server.
//
// It has to be a still of the CURRENT screen, not the one that used to be here.
// This was still drawing the old Analysis page - a bold "Analysis" heading, a
// History button and a URL field beside an Analyze button - none of which have
// existed since Analyze became a conversation. Someone pasting a link on the
// landing page got a two-second look at a product that is not the one they were
// about to sign up for.
function AnalysisScreenStill({ url }: { url: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-5 select-none pointer-events-none">
      <p className="label-mono mb-4">Analyze</p>
      <h1 className="display mb-8 text-center" style={{ color: 'var(--text)' }}>What are we looking at?</h1>

      <div className="w-full max-w-2xl">
        {/* The composer, with the pasted link already sitting in it. */}
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}
        >
          <Plus className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
          <span className="flex-1 min-w-0 text-[14px] truncate" style={{ color: 'var(--text)' }}>{url}</span>
          <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
            <ArrowUp className="w-3.5 h-3.5" style={{ color: 'var(--on-accent)' }} />
          </span>
        </div>
        <p className="label-mono mt-2.5 text-center">5 credits a video, 3 a script, 2 a hook</p>
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
      <AppShell activeTab="analyze" onTabChange={() => {}}>
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
