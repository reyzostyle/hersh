import { useState } from 'react';
import { FileText } from 'lucide-react';
import { CompetitorIdeaCard } from './CompetitorIdeaCard';
import { type CompetitorIdea } from '../lib/competitors';

type ScriptFilter = 'all' | 'outline' | 'script';

function filterByStage(ideas: CompetitorIdea[], filter: ScriptFilter): CompetitorIdea[] {
  const withWork = ideas.filter(i => i.outline || i.script);
  if (filter === 'outline') return withWork.filter(i => i.outline && !i.script);
  if (filter === 'script') return withWork.filter(i => i.script);
  return withWork;
}

interface Props {
  ideas: CompetitorIdea[];
  onIdeaUpdated: (updated: CompetitorIdea) => void;
  isPro: boolean;
}

// A reference library, not an inbox: no dismiss/triage story here, just the
// outlines and scripts already generated, for reuse when you sit down to film.
export function CompetitorsScripts({ ideas, onIdeaUpdated, isPro }: Props) {
  const [filter, setFilter] = useState<ScriptFilter>('all');
  const all = filterByStage(ideas, 'all');
  const visible = filterByStage(ideas, filter);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-8 space-y-4 sm:space-y-5 animate-fade-in-up">
      {all.length > 0 ? (
        <>
          <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {([
              ['all', `All (${filterByStage(ideas, 'all').length})`],
              ['outline', `Outline only (${filterByStage(ideas, 'outline').length})`],
              ['script', `Full script (${filterByStage(ideas, 'script').length})`],
            ] as [ScriptFilter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all"
                style={filter === f ? { background: 'rgba(255,255,255,0.1)', color: '#e5e7eb' } : { color: '#6b7280' }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            {visible.map(idea => (
              <CompetitorIdeaCard key={idea.id} idea={idea} onUpdated={onIdeaUpdated} isPro={isPro} />
            ))}
          </div>
        </>
      ) : (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
        >
          <FileText className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm">Outlines and scripts you generate from the Feed show up here for reuse.</p>
        </div>
      )}
    </div>
  );
}
