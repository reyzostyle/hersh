import { useState } from 'react';
import { VideocameraOutlineIcon as VideoIcon, MagicWandOutlineIcon as Wand2, DocumentTextOutlineIcon as FileText } from '@solar-icons/react';
import { HookAnalysis } from './HookAnalysis';
import { HookLab } from './HookLab';
import { ScriptLab } from './ScriptLab';

type AnalyzeMode = 'video' | 'hook' | 'script';

const SUB_MODE_KEY = 'hershy_analyze_submode';

const modes: { id: AnalyzeMode; label: string; icon: React.ReactNode }[] = [
  { id: 'video', label: 'Video', icon: <VideoIcon className="w-4 h-4" /> },
  { id: 'hook', label: 'Hook', icon: <Wand2 className="w-4 h-4" /> },
  { id: 'script', label: 'Script', icon: <FileText className="w-4 h-4" /> },
];

function readSavedMode(): AnalyzeMode {
  const saved = localStorage.getItem(SUB_MODE_KEY);
  return saved === 'hook' || saved === 'script' || saved === 'video' ? saved : 'video';
}

// Analyze is one of the pillars with a left sub-panel — Video/Hook/Script
// share the same "score it, tell me what to fix" mechanic on three different
// inputs (Competitors got its own Feed/Channels/Scripts split too).
export function AnalyzeHub() {
  const [mode, setMode] = useState<AnalyzeMode>(readSavedMode);

  const select = (m: AnalyzeMode) => {
    setMode(m);
    localStorage.setItem(SUB_MODE_KEY, m);
  };

  return (
    <div className="h-full flex">
      {/* Desktop sub-nav. pt-16 (not the usual py-5) clears AppShell's
          fixed sidebar-collapse toggle, which floats at top-4 just past the
          sidebar edge — exactly where this column's first button would
          otherwise sit. */}
      <div className="hidden lg:flex lg:flex-col w-44 flex-shrink-0 px-3 pt-16 pb-5 gap-0.5" style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => select(m.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === m.id
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Mobile sub-nav: horizontal pills instead of a column */}
        <div className="lg:hidden flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => select(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                mode === m.id ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {mode === 'video' && <HookAnalysis />}
          {mode === 'hook' && <HookLab />}
          {mode === 'script' && <ScriptLab />}
        </div>
      </div>
    </div>
  );
}
