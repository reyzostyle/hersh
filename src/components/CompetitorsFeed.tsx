import { useEffect, useState } from 'react';
import { LightbulbOutlineIcon as Lightbulb, RefreshOutlineIcon as Loader2, WidgetOutlineIcon as GridIcon, LayersOutlineIcon as StackIcon } from '@solar-icons/react';
import {
  itemFromIdea,
  type CompetitorIdea, type FeedItem, type IdeaFilter,
} from '../lib/competitors';
import { CompetitorVideoCard } from './CompetitorVideoCard';
import { DailyStack } from './DailyStack';
import { ErrorNotice } from './ErrorNotice';
import { Empty, Seg, Skeleton, Button } from './Page';
import { CREDIT_COSTS } from '../lib/useUsage';

// The Ideas tab, rebuilt 2026-10-10 around the daily drop.
//
// The inbox used to be every outlier the tracked channels had ever produced,
// which meant it showed the same cards for two weeks. Now it is today's ideas
// and nothing else: a fresh set at 9:00, found and pitched for this creator,
// and whatever is not saved by then is gone. That is the reason to open it
// every day, and the countdown says so.
//
// Grid and swipe are two ways through the same set, not two features.

export interface Today {
  loading: boolean;
  // Every idea of today's, ruled on or not: the grid keeps showing what was
  // saved or skipped in the swipe, marked, so the day's set stays visible.
  all: CompetitorIdea[];
  // Today's ideas nobody has ruled on yet, best first. What the swipe deals.
  remaining: CompetitorIdea[];
  total: number;
  nextAt: string | null;
  // No brain and no connected channel: there is nothing to search for.
  needsProfile: boolean;
  findingMore: boolean;
  moreNote: string;
  onMore: () => void;
}

interface Props {
  today: Today;
  saved: FeedItem[];
  dismissed: FeedItem[];
  filter: IdeaFilter;
  onFilterChange: (f: IdeaFilter) => void;
  onOpen: (item: FeedItem) => void;
  onDismiss: (item: FeedItem) => void;
  onSave: (item: FeedItem) => void;
  fetchError: string;
}

type View = 'grid' | 'swipe';
const VIEW_KEY = 'chumoku:ideas-view';

function readView(): View {
  // Swipe unless they chose the grid (2026-10-30: swipe is the default).
  try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'swipe'; } catch { return 'swipe'; }
}

// "5h 12m", "38m". Ticks once a minute: enough for a countdown in hours.
function useCountdown(to: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (!to) return null;
  const mins = Math.max(0, Math.round((new Date(to).getTime() - now) / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

export function CompetitorsFeed({
  today, saved, dismissed, filter, onFilterChange, onOpen, onDismiss, onSave, fetchError,
}: Props) {
  const [view, setView] = useState<View>(readView);
  const left = useCountdown(today.nextAt);

  const changeView = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-viewer nicety only */ }
  };

  const tabs: { id: IdeaFilter; label: string }[] = [
    { id: 'new', label: today.loading ? 'Today' : `Today (${today.remaining.length})` },
    { id: 'saved', label: `Saved (${saved.length})` },
    { id: 'dismissed', label: `Dismissed (${dismissed.length})` },
  ];

  // Researched ideas on demand, for credits (daily-ideas, MORE_OWN). Offered
  // all day, not only once the drop is used up.
  const moreLabel = today.findingMore ? 'Researching' : `5 more ideas · ${CREDIT_COSTS.more_ideas} credits`;

  const nextLabel = today.nextAt
    ? new Date(today.nextAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '9:00';

  return (
    <div className="space-y-3">
      {/* One row on every width, like the app: the filter scrolls if it has
          to, and the view toggle is two icons rather than two words. */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 overflow-x-auto pb-0.5 -mb-0.5" style={{ scrollbarWidth: 'none' }}>
          <Seg className="w-max" options={tabs} value={filter} onChange={onFilterChange} />
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {filter === 'new' && today.total > 0 && (
            <Seg
              options={[
                { id: 'grid' as View, label: <span className="flex items-center" title="Grid" aria-label="Grid"><GridIcon className="w-[18px] h-[18px]" /></span> },
                { id: 'swipe' as View, label: <span className="flex items-center" title="Swipe" aria-label="Swipe"><StackIcon className="w-[18px] h-[18px]" /></span> },
              ]}
              value={view}
              onChange={changeView}
            />
          )}
        </div>
      </div>

      {fetchError && <ErrorNotice message={fetchError} />}

      {filter === 'new' ? (
        today.loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="w-full" style={{ aspectRatio: '4 / 6.2', borderRadius: 'var(--r-lg)' }} />
            ))}
          </div>
        ) : today.needsProfile && today.total === 0 ? (
          <Empty icon={<Lightbulb className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
            <span className="block mb-3">Connect your YouTube or describe your channel, and new ideas arrive every morning.</span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('chumoku:navigate', { detail: 'settings' }))}
            >
              Open Settings
            </Button>
          </Empty>
        ) : today.total === 0 ? (
          <Empty icon={<Lightbulb className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
            <span className="block mb-3">{today.moreNote || `Nothing new today. Next ones at ${nextLabel}.`}</span>
            <Button variant="primary" size="sm" onClick={today.onMore} disabled={today.findingMore}>
              {today.findingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {moreLabel}
            </Button>
          </Empty>
        ) : (
          <>
            {today.remaining.length > 0 ? (
              <div className="flex items-center gap-3">
                <p className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  {today.moreNote || (left ? `New ideas in ${left} · unsaved ones disappear` : '')}
                </p>
                <button className="btn btn--text btn--sm flex-shrink-0" onClick={today.onMore} disabled={today.findingMore}>
                  {today.findingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {moreLabel}
                </button>
              </div>
            ) : (
              // Today's are all ruled on: say when the next ones come, and
              // offer more now for credits.
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-[var(--r-md)] px-4 py-3"
                style={{ background: 'var(--bg-raised)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
                <p className="flex-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  {today.moreNote || `That's all for today. Next ones at ${nextLabel}.`}
                </p>
                <Button variant="primary" size="sm" onClick={today.onMore} disabled={today.findingMore}>
                  {today.findingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {moreLabel}
                </Button>
              </div>
            )}
            {view === 'swipe' && today.remaining.length > 0 ? (
              <DailyStack
                remaining={today.remaining}
                total={today.total}
                nextAt={today.nextAt}
                loading={false}
                onSave={idea => onSave(itemFromIdea(idea))}
                onDismiss={idea => onDismiss(itemFromIdea(idea))}
                onOpen={idea => onOpen(itemFromIdea(idea))}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {today.all.map(idea => {
                  const item = itemFromIdea(idea);
                  return (
                    <CompetitorVideoCard
                      key={idea.video_id}
                      item={item}
                      onOpen={() => onOpen(item)}
                      onDismiss={() => onDismiss(item)}
                      onSave={() => onSave(item)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )
      ) : (
        (filter === 'saved' ? saved : dismissed).length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {(filter === 'saved' ? saved : dismissed).map(item => (
              <CompetitorVideoCard
                key={item.video_id}
                item={item}
                onOpen={() => onOpen(item)}
                onDismiss={() => onDismiss(item)}
                onSave={() => onSave(item)}
              />
            ))}
          </div>
        ) : (
          <Empty icon={<Lightbulb className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
            {filter === 'saved' ? 'Nothing saved yet.' : 'Nothing dismissed.'}
          </Empty>
        )
      )}
    </div>
  );
}
