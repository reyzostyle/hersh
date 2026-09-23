import { useEffect, useState } from 'react';

// What a steal is doing while it runs, as a checklist rather than a progress
// card: done steps ticked, the current one shimmering like the chat's working
// line, the rest waiting, and the seconds underneath. The card it replaced
// showed a percentage that was a guess dressed as a measurement, floating in
// the middle of an empty panel.
const STEAL_STEPS: { label: string; ms: number }[] = [
  { label: 'Fetching the Short', ms: 1500 },
  { label: 'Working out why it worked', ms: 6000 },
  { label: 'Stripping it down to the format', ms: 5000 },
  { label: 'Watching it frame by frame', ms: 7000 },
  { label: 'Rebuilding it for your channel', ms: 6000 },
  { label: 'Writing your outline', ms: 0 },
];

export function StealProgress() {
  const [at, setAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    // The last step has no duration: it stays current until the answer lands.
    let acc = 0;
    const timers = STEAL_STEPS.slice(0, -1).map((step, i) => {
      acc += step.ms;
      return setTimeout(() => setAt(i + 1), acc);
    });
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { timers.forEach(clearTimeout); clearInterval(tick); };
  }, []);

  return (
    <div className="px-5 pt-10 pb-8">
      <p className="label-mono mb-5">Stealing the format</p>
      <ol className="space-y-3" aria-live="polite">
        {STEAL_STEPS.map((step, i) => {
          const done = i < at;
          const current = i === at;
          return (
            <li key={step.label} className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      border: `1px solid ${done ? 'transparent' : current ? 'var(--text-muted)' : 'var(--line-strong)'}`,
                      background: done ? 'rgba(var(--process-rgb),0.15)' : 'transparent',
                      transition: 'background 0.3s ease, border-color 0.3s ease',
                    }}>
                {done && (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" aria-hidden="true">
                    <path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="var(--process)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`text-[14px] ${current ? 'text-working font-medium' : ''}`}
                    style={current ? undefined : { color: done ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="font-mono text-[11px] mt-6 tabular-nums" style={{ color: 'var(--text-faint)' }}>
        {elapsed}s · usually under a minute
      </p>
    </div>
  );
}
