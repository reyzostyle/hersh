import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Stars2OutlineIcon as Sparkles } from '@solar-icons/react';

interface Stage {
  label: string;
  duration: number;
  target: number;
}

const URL_STAGES: Stage[] = [
  { label: 'Fetching video info...', duration: 1500, target: 12 },
  { label: 'Watching your Short...', duration: 5000, target: 42 },
  { label: 'Analyzing hook strength...', duration: 3500, target: 62 },
  { label: 'Finding weak spots...', duration: 3000, target: 78 },
  { label: 'Generating new hook ideas...', duration: 3500, target: 92 },
  { label: 'Putting it all together...', duration: 2000, target: 98 },
];

const UPLOAD_STAGES: Stage[] = [
  { label: 'Uploading video...', duration: 3000, target: 25 },
  { label: 'Processing video file...', duration: 2000, target: 38 },
  { label: 'Watching your Short...', duration: 4000, target: 58 },
  { label: 'Analyzing hook strength...', duration: 3000, target: 74 },
  { label: 'Finding weak spots...', duration: 2500, target: 86 },
  { label: 'Generating new hook ideas...', duration: 2500, target: 96 },
];

const HOOK_STAGES: Stage[] = [
  { label: 'Reading your hook...', duration: 1200, target: 20 },
  { label: 'Scoring scroll-stop power...', duration: 2000, target: 45 },
  { label: 'Checking the curiosity gap...', duration: 2000, target: 65 },
  { label: 'Finding what holds it back...', duration: 2000, target: 82 },
  { label: 'Drafting fresh angles...', duration: 2500, target: 96 },
];

const SCRIPT_STAGES: Stage[] = [
  { label: 'Reading your script...', duration: 1500, target: 18 },
  { label: 'Scoring the hook...', duration: 2000, target: 42 },
  { label: 'Checking pacing and retention...', duration: 2000, target: 62 },
  { label: 'Judging the payoff...', duration: 2000, target: 78 },
  { label: 'Finding what holds it back...', duration: 2500, target: 96 },
];

interface Props {
  open: boolean;
  mode: 'url' | 'upload' | 'hook' | 'script';
  done: boolean;
  /** Divides every stage duration. The signed-out hero flow runs the same
   *  stages faster, because nothing is actually being analysed there yet. */
  speed?: number;
  /** Fires when the last stage has landed and the bar has stopped climbing. */
  onStagesComplete?: () => void;
}

export function AnalysisProgressModal({ open, mode, done, speed = 1, onStagesComplete }: Props) {
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState('');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!open) {
      setPercent(0);
      setLabel('');
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    const stages = mode === 'upload' ? UPLOAD_STAGES : mode === 'hook' ? HOOK_STAGES : mode === 'script' ? SCRIPT_STAGES : URL_STAGES;
    let elapsed = 0;

    stages.forEach((stage) => {
      const t1 = setTimeout(() => {
        setLabel(stage.label);
      }, elapsed);

      const t2 = setTimeout(() => {
        setPercent(stage.target);
      }, elapsed + 200 / speed);

      timersRef.current.push(t1, t2);
      elapsed += stage.duration / speed;
    });

    if (onStagesComplete) {
      timersRef.current.push(setTimeout(onStagesComplete, elapsed));
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [open, mode, speed]);

  useEffect(() => {
    if (done && open) {
      timersRef.current.forEach(clearTimeout);
      setLabel('Done!');
      setPercent(100);
    }
  }, [done]);

  if (!open) return null;

  const title = mode === 'hook' ? 'Analyzing your hook' : mode === 'script' ? 'Analyzing your script' : 'Analyzing your Short';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />
      <div
        className="relative w-full max-w-sm rounded-2xl p-8 flex flex-col items-center gap-6 animate-scale-in"
        style={{
          background: 'rgba(var(--surface-rgb),0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          willChange: 'transform',
        }}
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)' }}>
          <Sparkles className="w-5 h-5 text-[rgb(var(--wash-rgb))]" style={{ animation: 'spin 3s linear infinite' }} />
        </div>

        {/* Label */}
        <div className="text-center">
          <p className="text-white font-semibold text-sm mb-1">{title}</p>
          <p className="text-gray-500 text-xs h-4 transition-all duration-500">{label}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent}%`,
                background: 'var(--process)',
                transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </div>
          <p className="text-right text-[10px] text-gray-600 mt-1.5">{percent}%</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
