import { Heart, Lightbulb, Trash2, Loader2 } from 'lucide-react';
import { CompetitorIdeaCard, type CompetitorIdea } from './CompetitorIdeaCard';

export type IdeaFilter = 'new' | 'saved' | 'dismissed';

// The feed is an inbox, not a stream: "New" only holds ideas you haven't ruled
// on yet, so it empties as you triage instead of growing forever. Anything left
// untouched this long is stale enough to drop out on its own — the row stays in
// the database so the same video is never analyzed (or paid for) twice.
const STALE_AFTER_DAYS = 21;

function isStale(idea: CompetitorIdea): boolean {
  const published = idea.video_published_at ?? idea.created_at;
  if (!published) return false;
  const ageDays = (Date.now() - new Date(published).getTime()) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS;
}

export function filterIdeas(ideas: CompetitorIdea[], filter: IdeaFilter): CompetitorIdea[] {
  if (filter === 'saved') return ideas.filter(i => i.liked === true);
  if (filter === 'dismissed') return ideas.filter(i => i.liked === false);
  return ideas.filter(i => i.liked == null && !isStale(i));
}

interface Props {
  ideas: CompetitorIdea[];
  hasChannels: boolean;
  filter: IdeaFilter;
  onFilterChange: (f: IdeaFilter) => void;
  onIdeaUpdated: (updated: CompetitorIdea) => void;
  isPro: boolean;
  onClear: () => void;
  clearingIdeas: boolean;
}

export function CompetitorsFeed({ ideas, hasChannels, filter, onFilterChange, onIdeaUpdated, isPro, onClear, clearingIdeas }: Props) {
  const visibleIdeas = filterIdeas(ideas, filter);
  const inboxCount = filterIdeas(ideas, 'new').length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-8 space-y-4 sm:space-y-5 animate-fade-in-up">
      {ideas.length > 0 ? (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {(['new', 'saved', 'dismissed'] as IdeaFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => onFilterChange(f)}
                  className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                  style={filter === f
                    ? { background: 'rgba(255,255,255,0.1)', color: '#e5e7eb' }
                    : { color: '#6b7280' }
                  }
                >
                  {f === 'saved' && <Heart className="w-3 h-3 inline mr-1 -mt-0.5" fill="currentColor" />}
                  {f} ({filterIdeas(ideas, f).length})
                </button>
              ))}
            </div>
            {filter === 'new' && inboxCount > 0 && (
              <button
                onClick={onClear}
                disabled={clearingIdeas}
                title="Dismiss all unreviewed ideas"
                className="p-2 rounded-lg transition-all disabled:opacity-50 flex-shrink-0"
                style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
              >
                {clearingIdeas ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          {visibleIdeas.length > 0 ? (
            <div className="space-y-4">
              {visibleIdeas.map(idea => (
                <CompetitorIdeaCard key={idea.id} idea={idea} onUpdated={onIdeaUpdated} isPro={isPro} />
              ))}
            </div>
          ) : (
            <EmptyState>
              {filter === 'new'
                ? 'Inbox zero. New ideas land here when a competitor beats their own average.'
                : filter === 'saved'
                  ? 'Nothing saved yet. Tap the heart on an idea to keep it.'
                  : 'Nothing dismissed.'}
            </EmptyState>
          )}
        </>
      ) : hasChannels ? (
        <EmptyState>No ideas yet. Head to Channels and hit "Find new ideas" to pull the shorts that beat their channel's average.</EmptyState>
      ) : (
        <EmptyState>Add competitor channels in the Channels tab to start tracking their content.</EmptyState>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
    >
      <Lightbulb className="w-8 h-8 text-gray-700" />
      <p className="text-gray-500 text-sm">{children}</p>
    </div>
  );
}
