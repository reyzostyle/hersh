import { useState } from 'react';
import { Loader2, Sparkles, ChevronDown, ChevronUp, Lightbulb, Lock, FileText } from 'lucide-react';
import { getSessionToken } from '../lib/supabase';
import { callFunction, type CompetitorIdea } from '../lib/competitors';
import { ErrorNotice } from './ErrorNotice';

// The AI half of an idea: what the competitor did, the angle rewritten for
// you, and the outline/script generation on top. Extracted so the feed's
// detail drawer and the Scripts workspace card share one copy of the
// generation logic — credit exhaustion, upgrade redirects and error states
// all behave identically wherever an idea is opened.
export function CompetitorIdeaAnalysis({ idea, onUpdated, isPro, stickyActions = false }: {
  idea: CompetitorIdea;
  onUpdated: (updated: CompetitorIdea) => void;
  isPro: boolean;
  // In the drawer the angle text is long enough to push the buttons off
  // screen, so "Create Outline" looked like it didn't exist unless you
  // scrolled. Pinned to the bottom of the drawer's scroll area instead.
  stickyActions?: boolean;
}) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  // What the competitor did is background; your angle is the actionable part,
  // so only the latter is open by default.
  const [conceptOpen, setConceptOpen] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [error, setError] = useState('');
  // Distinguishes "user hit their credit limit" (a plain, actionable message)
  // from an actual backend failure (routed through ErrorNotice) — both land
  // in the same `error` state, so the render needs to know which is which.
  const [errorIsPlanLimit, setErrorIsPlanLimit] = useState(false);

  const generate = async (
    endpoint: string,
    setBusy: (v: boolean) => void,
    onDone: () => void
  ) => {
    setBusy(true);
    setError('');
    setErrorIsPlanLimit(false);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction(endpoint, token, { ideaId: idea.id });
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return;
      }
      if (data.error === 'limit_reached') {
        setErrorIsPlanLimit(true);
        setError("You've used all your credits for this month.");
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      onUpdated(data.idea);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* What they did */}
      {idea.concept && (
        <div>
          <button
            onClick={() => setConceptOpen(!conceptOpen)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-400 transition-colors"
          >
            What they did
            {conceptOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {conceptOpen && <p className="text-gray-300 text-sm leading-relaxed mt-1.5">{idea.concept}</p>}
        </div>
      )}

      {/* Your angle */}
      {idea.adapted_idea && (
        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">Your angle</p>
          </div>
          <p className="text-violet-100 text-sm leading-relaxed">{idea.adapted_idea}</p>
        </div>
      )}

      {/* Outline */}
      {idea.outline && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(52,211,153,0.2)' }}>
          <button
            onClick={() => setOutlineOpen(!outlineOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-emerald-500/5 transition-colors"
            style={{ background: 'rgba(52,211,153,0.06)' }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Outline</span>
            </div>
            {outlineOpen ? <ChevronUp className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-emerald-500" />}
          </button>
          {outlineOpen && (
            <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ background: 'rgba(52,211,153,0.03)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-1">Hook (first 3s)</p>
                <p className="text-emerald-100 text-sm italic">"{idea.outline.hook}"</p>
              </div>
              {idea.outline.sections.map((section, i) => (
                <div key={i} className="pl-2" style={{ borderLeft: '2px solid rgba(52,211,153,0.3)' }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-semibold text-emerald-400">{section.title}</p>
                    <span className="text-[10px] text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{section.duration}</span>
                  </div>
                  <p className="text-gray-300 text-sm">{section.content}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-1">CTA</p>
                <p className="text-emerald-100 text-sm">"{idea.outline.cta}"</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Script */}
      {idea.script && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setScriptOpen(!scriptOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs font-semibold text-gray-300">Full Script</span>
            </div>
            {scriptOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {scriptOpen && (
            <div className="px-3 pb-3 pt-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <pre className="text-white text-sm whitespace-pre-wrap font-sans leading-relaxed">{idea.script}</pre>
            </div>
          )}
        </div>
      )}

      {error && (
        errorIsPlanLimit
          ? <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
          : <ErrorNotice message={error} />
      )}

      {/* Action buttons */}
      <div
        className={`flex gap-2 flex-wrap ${stickyActions ? 'sticky bottom-0 -mx-4 px-4 py-3' : ''}`}
        style={stickyActions
          ? { background: 'linear-gradient(180deg, rgba(11,18,31,0) 0%, #0B121F 35%)', borderTop: '1px solid rgba(255,255,255,0.06)' }
          : undefined}
      >
        {!idea.outline && (
          <button
            onClick={() => generate('generate-outline', setGeneratingOutline, () => setOutlineOpen(true))}
            disabled={generatingOutline}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.25)' }}
          >
            {generatingOutline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generatingOutline ? 'Creating outline...' : 'Create Outline'}
          </button>
        )}
        {idea.outline && !idea.script && (
          isPro ? (
            <button
              onClick={() => generate('generate-competitor-script', setGeneratingScript, () => setScriptOpen(true))}
              disabled={generatingScript}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: 'rgba(14,164,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,164,233,0.25)' }}
            >
              {generatingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {generatingScript ? 'Writing script...' : 'Write Script'}
            </button>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Lock className="w-3.5 h-3.5" />
              Write Script (Pro only)
            </button>
          )
        )}
        {idea.outline && idea.script && !scriptOpen && (
          <button
            onClick={() => setScriptOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <FileText className="w-3.5 h-3.5" />
            View script
          </button>
        )}
      </div>
    </div>
  );
}
