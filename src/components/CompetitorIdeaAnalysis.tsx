import { useState } from 'react';
import { Loader2, Sparkles, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { type CompetitorIdea } from '../lib/competitors';
import { useIdeaGeneration } from '../lib/useIdeaGeneration';
import { ErrorNotice } from './ErrorNotice';

// The AI half of an idea: what the competitor did, the angle rewritten for
// you, and the outline. Full script generation was dropped 2026-08-23 — the
// value is the concept and the structure, and a whole generated script just
// buried both. `competitor_ideas.script` is still read nowhere but remains in
// the schema so existing rows aren't destroyed.
export function CompetitorIdeaAnalysis({ idea, onUpdated, stickyActions = false }: {
  idea: CompetitorIdea;
  onUpdated: (updated: CompetitorIdea) => void;
  // In the drawer the angle text is long enough to push the button off
  // screen, so "Create Outline" looked like it didn't exist unless you
  // scrolled. Pinned to the bottom of the drawer's scroll area instead.
  stickyActions?: boolean;
}) {
  const [outlineOpen, setOutlineOpen] = useState(true);
  // What the competitor did is background; your angle is the actionable part,
  // so only the latter is open by default.
  const [conceptOpen, setConceptOpen] = useState(false);
  const { generatingOutline, error, errorIsPlanLimit, generateOutline } = useIdeaGeneration(idea, onUpdated);

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

      {/* Outline. Open by default now that it's the end of the chain rather
          than a step on the way to a script. */}
      {idea.outline && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(var(--ok-rgb),0.2)' }}>
          <button
            onClick={() => setOutlineOpen(!outlineOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-emerald-500/5 transition-colors"
            style={{ background: 'rgba(var(--ok-rgb),0.06)' }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Outline</span>
            </div>
            {outlineOpen ? <ChevronUp className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-emerald-500" />}
          </button>
          {outlineOpen && (
            <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ background: 'rgba(var(--ok-rgb),0.03)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-1">Hook (first 3s)</p>
                <p className="text-emerald-100 text-sm italic">"{idea.outline.hook}"</p>
              </div>
              {idea.outline.sections.map((section, i) => (
                <div key={i} className="pl-2" style={{ borderLeft: '2px solid rgba(var(--ok-rgb),0.3)' }}>
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

      {error && (
        errorIsPlanLimit
          ? <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
          : <ErrorNotice message={error} />
      )}

      {!idea.outline && (
        <div
          className={`flex gap-2 flex-wrap ${stickyActions ? 'sticky bottom-0 -mx-4 px-4 py-3' : ''}`}
          style={stickyActions
            ? { background: 'linear-gradient(180deg, rgba(11,18,31,0) 0%, #0B121F 35%)', borderTop: '1px solid rgba(255,255,255,0.06)' }
            : undefined}
        >
          <button
            onClick={() => generateOutline()}
            disabled={generatingOutline}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(var(--ok-rgb),0.12)', color: '#6ee7b7', border: '1px solid rgba(var(--ok-rgb),0.25)' }}
          >
            {generatingOutline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generatingOutline ? 'Creating outline...' : 'Create Outline'}
          </button>
        </div>
      )}
    </div>
  );
}
