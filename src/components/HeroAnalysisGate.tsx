import { useState, useEffect } from 'react';
import { Check, Loader2, ArrowLeft, Lock } from 'lucide-react';

// The gate between pasting a link on the landing page and having an account.
//
// The real analysis cannot run yet: the function needs a signed-in user, spends
// credits and writes a row against a user id. So this shows the work being set
// up, and asks for an account at the last step. The link is already in
// localStorage by the time this mounts, so signing up drops the visitor
// straight into the running analysis with nothing to re-enter.
const STEPS = [
  { label: 'Reading the link', ms: 700 },
  { label: 'Watching the video', ms: 1500 },
  { label: 'Listening to the audio', ms: 1200 },
  { label: 'Timing the cuts', ms: 1100 },
  { label: 'Scoring the hook', ms: 900 },
];


export function HeroAnalysisGate({
  url,
  onNeedAccount,
  onBack,
}: {
  url: string;
  onNeedAccount: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(4);

  useEffect(() => {
    const timers: number[] = [];
    let elapsed = 0;
    STEPS.forEach((s, i) => {
      elapsed += s.ms;
      timers.push(
        window.setTimeout(() => {
          setStep(i + 1);
          // Stops short of full on purpose: the last stretch is the part that
          // needs an account, and a bar sitting at 100% behind a signup form
          // would be claiming work that hasn't happened.
          setProgress(Math.round(((i + 1) / STEPS.length) * 88));
          if (i === STEPS.length - 1) onNeedAccount();
        }, elapsed),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [onNeedAccount]);

  const shortUrl = url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 52);

  return (
    <div className="fixed inset-0 z-40 bg-[#0F1115] overflow-auto">
      <div className="max-w-lg mx-auto px-6 pt-16 pb-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 mb-2">
          Analyzing
        </p>
        <p className="text-sm text-gray-300 font-mono truncate mb-8">{shortUrl}</p>

        <div className="h-1 rounded-full overflow-hidden mb-8" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%`, background: '#0EA4E9' }}
          />
        </div>

        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.label} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: done ? 'rgba(14,164,233,0.15)' : 'rgba(255,255,255,0.05)' }}
                >
                  {done ? (
                    <Check className="w-3 h-3 text-[#0EA4E9]" />
                  ) : active ? (
                    <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                  ) : null}
                </div>
                <span className={`text-sm ${done ? 'text-gray-400' : active ? 'text-white' : 'text-gray-600'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {step >= STEPS.length && (
          <div
            className="mt-8 rounded-xl p-4 flex items-start gap-3 animate-fade-in-up"
            style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.18)' }}
          >
            <Lock className="w-4 h-4 text-[#0EA4E9] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300 text-balance">
              Your breakdown is ready to run. Create an account to see it, 20 free credits, no card.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
