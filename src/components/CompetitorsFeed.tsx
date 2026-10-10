import { useEffect, useState } from 'react';
import { LightbulbOutlineIcon as Lightbulb, AddOutlineIcon as Plus, AltArrowUpOutlineIcon as ChevronUp } from '@solar-icons/react';
import {
  itemFromIdea,
  type CompetitorChannel, type CompetitorIdea, type FeedItem, type IdeaFilter, type PoolVideo,
} from '../lib/competitors';
import { CompetitorVideoCard } from './CompetitorVideoCard';
import { CompetitorsChannels } from './CompetitorsChannels';
import { DailyStack } from './DailyStack';
import { ErrorNotice } from './ErrorNotice';
import { Empty, Seg, Collapse, Skeleton, Button } from './Page';

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
  // Today's ideas nobody has ruled on yet, best first.
  remaining: CompetitorIdea[];
  total: number;
  nextAt: string | null;
  // No brain and no connected channel: there is nothing to search for.
  needsProfile: boolean;
}

interface Props {
  today: Today;
  saved: FeedItem[];
  dismissed: FeedItem[];
  pool: PoolVideo[];
  channels: CompetitorChannel[];
  filter: IdeaFilter;
  onFilterChange: (f: IdeaFilter) => void;
  onOpen: (item: FeedItem) => void;
  onDismiss: (item: FeedItem) => void;
  onSave: (item: FeedItem) => void;
  addingChannel: boolean;
  addError: string;
  removingId: string | null;
  syncingChannelId: string | null;
  onAddChannel: (url: string) => void;
  onRemoveChannel: (channel: CompetitorChannel) => void;
  onAutoFind: () => void;
  channelLimit: number;
  fetchError: string;
  adaptForProfile: boolean;
  onAdaptChange: (v: boolean) => void;
}

type View = 'grid' | 'swipe';
const VIEW_KEY = 'chumoku:ideas-view';

function readView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'swipe' ? 'swipe' : 'grid'; } catch { return 'grid'; }
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
  today, saved, dismissed, pool, channels, filter, onFilterChange, onOpen, onDismiss, onSave,
  addingChannel, addError, removingId, syncingChannelId, onAddChannel, onRemoveChannel,
  onAutoFind, channelLimit, fetchError, adaptForProfile, onAdaptChange,
}: Props) {
  const [manageOpen, setManageOpen] = useState(false);
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

  const nextLabel = today.nextAt
    ? new Date(today.nextAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '9:00';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-0 overflow-x-auto pb-0.5 -mb-0.5">
          <Seg className="w-max" options={tabs} value={filter} onChange={onFilterChange} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {filter === 'new' && today.remaining.length > 0 && (
            <Seg
              options={[{ id: 'grid' as View, label: 'Grid' }, { id: 'swipe' as View, label: 'Swipe' }]}
              value={view}
              onChange={changeView}
            />
          )}
          <button onClick={() => setManageOpen(o => !o)} className="chip flex-shrink-0" style={{ borderStyle: 'dashed' }}>
            {manageOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            Channels
          </button>
        </div>
      </div>

      <Collapse open={manageOpen} className="!mt-0">
        <div className="pt-3">
          <CompetitorsChannels
            channels={channels}
            pool={pool}
            addingChannel={addingChannel}
            addError={addError}
            removingId={removingId}
            syncingChannelId={syncingChannelId}
            onAddChannel={onAddChannel}
            onRemoveChannel={onRemoveChannel}
            onAutoFind={onAutoFind}
            channelLimit={channelLimit}
            adaptForProfile={adaptForProfile}
            onAdaptChange={onAdaptChange}
          />
        </div>
      </Collapse>

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
        ) : today.remaining.length === 0 ? (
          <Empty icon={<Lightbulb className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
            {today.total > 0 ? `That's today's ${today.total}. Next ones at ${nextLabel}.` : `Nothing new today. Next ones at ${nextLabel}.`}
          </Empty>
        ) : (
          <>
            {left && (
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                New ideas in {left} · unsaved ones disappear
              </p>
            )}
            {view === 'swipe' ? (
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
                {today.remaining.map(idea => {
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
