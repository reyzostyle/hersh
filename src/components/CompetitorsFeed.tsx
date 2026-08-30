import { useState } from 'react';
import { LightbulbOutlineIcon as Lightbulb, TrashBinMinimalisticOutlineIcon as Trash2, RefreshOutlineIcon as Loader2, AddOutlineIcon as Plus, RefreshOutlineIcon as RefreshCw, AltArrowUpOutlineIcon as ChevronUp, UsersGroupRoundedOutlineIcon as Users } from '@solar-icons/react';
import { Check } from './BrandIcons';
import {
  filterIdeas, sortAndFilterIdeas,
  type CompetitorIdea, type CompetitorChannel, type IdeaFilter, type OutlierFloor, type IdeaSort,
} from '../lib/competitors';
import { CompetitorVideoCard } from './CompetitorVideoCard';
import { CompetitorsChannels } from './CompetitorsChannels';
import { ErrorNotice } from './ErrorNotice';

interface Props {
  ideas: CompetitorIdea[];
  channels: CompetitorChannel[];
  filter: IdeaFilter;
  onFilterChange: (f: IdeaFilter) => void;
  onIdeaUpdated: (updated: CompetitorIdea) => void;
  onOpenIdea: (id: string) => void;
  onSaveIdea: (idea: CompetitorIdea) => void;
  onClear: () => void;
  clearingIdeas: boolean;
  addingChannel: boolean;
  addError: string;
  removingId: string | null;
  syncingChannelId: string | null;
  onAddChannel: (url: string) => void;
  onRemoveChannel: (channel: CompetitorChannel) => void;
  fetchingIdeas: boolean;
  fetchError: string;
  fetchNotice: string;
  onFetchIdeas: (adaptForProfile: boolean) => void;
}

const FLOORS: { value: OutlierFloor; label: string }[] = [
  { value: 0, label: 'All' },
  { value: 2, label: '2x+' },
  { value: 5, label: '5x+' },
];

const SORTS: { value: IdeaSort; label: string }[] = [
  { value: 'outlier', label: 'Top outliers' },
  { value: 'recent', label: 'Newest' },
  { value: 'views', label: 'Most viewed' },
];

// One screen for the whole discovery job: who you track, what came back, and
// which of it is worth keeping. Saved ideas moved out to their own folder
// view — this stays a triage inbox, so it empties as you work.
export function CompetitorsFeed({
  ideas, channels, filter, onFilterChange, onIdeaUpdated, onOpenIdea, onSaveIdea, onClear, clearingIdeas,
  addingChannel, addError, removingId, syncingChannelId, onAddChannel, onRemoveChannel,
  fetchingIdeas, fetchError, fetchNotice, onFetchIdeas,
}: Props) {
  const [manageOpen, setManageOpen] = useState(false);
  const [floor, setFloor] = useState<OutlierFloor>(0);
  const [sort, setSort] = useState<IdeaSort>('outlier');
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  // On by default: the angle being written for your channel is the point of
  // the feature. Off gives a plain read of the format instead, for anyone
  // whose profile settings would bend every idea the same way.
  const [adaptForProfile, setAdaptForProfile] = useState(true);

  const triaged = filterIdeas(ideas, filter);
  const visibleIdeas = sortAndFilterIdeas(triaged, { floor, sort, channelId: channelFilter });
  const inboxCount = filterIdeas(ideas, 'new').length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-8 space-y-3 animate-fade-in-up">
      {/* ── Tracked channels ───────────────────────────────────────────────
          Avatars double as the channel filter, so narrowing the feed to one
          competitor is a single tap instead of a control that has to be
          explained. */}
      <div className="flex items-center gap-2 flex-wrap">
        {channels.length > 0 && (
          <button
            onClick={() => setChannelFilter(null)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={channelFilter === null
              ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            All
          </button>
        )}
        {channels.map(c => {
          const active = channelFilter === c.channel_id;
          return (
            <button
              key={c.id}
              onClick={() => setChannelFilter(active ? null : c.channel_id)}
              title={c.channel_name || c.channel_id}
              className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium transition-all max-w-[180px]"
              style={active
                ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {c.channel_thumbnail ? (
                <img src={c.channel_thumbnail} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
              )}
              <span className="truncate">{c.channel_name || c.channel_id}</span>
              {syncingChannelId === c.id && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
            </button>
          );
        })}

        <button
          onClick={() => setManageOpen(o => !o)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af', border: '1px dashed rgba(255,255,255,0.14)' }}
        >
          {manageOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {channels.length === 0 ? 'Add channel' : 'Manage'}
        </button>

        {channels.length > 0 && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              onClick={() => setAdaptForProfile(v => !v)}
              title="Write each angle for your niche, using your channel profile"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all"
              style={adaptForProfile
                ? { background: 'rgba(var(--wash-rgb),0.14)', color: 'rgb(var(--wash-rgb))', border: '1px solid rgba(var(--wash-rgb),0.3)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span
                className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                style={adaptForProfile
                  ? { background: 'rgb(var(--wash-rgb))' }
                  : { border: '1px solid rgba(255,255,255,0.25)' }}
              >
                {adaptForProfile && <Check className="w-2.5 h-2.5 text-white" />}
              </span>
              Adapt for my profile
            </button>

            <button
              onClick={() => onFetchIdeas(adaptForProfile)}
              disabled={fetchingIdeas}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: 'rgba(var(--accent-rgb),0.15)', border: '1px solid rgba(var(--accent-rgb),0.35)', color: 'var(--accent-soft)' }}
            >
              {fetchingIdeas ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {fetchingIdeas ? 'Finding...' : 'Find new ideas'}
            </button>
          </div>
        )}
      </div>

      {manageOpen && (
        <CompetitorsChannels
          channels={channels}
          ideas={ideas}
          addingChannel={addingChannel}
          addError={addError}
          removingId={removingId}
          syncingChannelId={syncingChannelId}
          onAddChannel={onAddChannel}
          onRemoveChannel={onRemoveChannel}
        />
      )}

      {fetchError && <ErrorNotice message={fetchError} />}
      {fetchNotice && (
        <p className="text-gray-400 text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {fetchNotice}
        </p>
      )}

      {ideas.length > 0 ? (
        <>
          {/* Two independent axes: whether you've ruled on it, and how hard it
              beat its channel. Keeping them separate is what lets you sweep
              the inbox for 5x+ only. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {(['new', 'dismissed'] as IdeaFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => onFilterChange(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                  style={filter === f
                    ? { background: 'rgba(255,255,255,0.1)', color: '#e5e7eb' }
                    : { color: '#6b7280' }}
                >
                  {f} ({filterIdeas(ideas, f).length})
                </button>
              ))}
            </div>

            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {FLOORS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFloor(f.value)}
                  title="Filter by how far the video beat its own channel's pace"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all tabular-nums"
                  style={floor === f.value
                    ? { background: 'rgba(var(--ok-rgb),0.15)', color: '#6ee7b7' }
                    : { color: '#6b7280' }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={e => setSort(e.target.value as IdeaSort)}
              className="px-2.5 py-2 rounded-xl text-xs font-medium text-gray-300 focus:outline-none cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {SORTS.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--bg-raised)' }}>{s.label}</option>)}
            </select>

            {filter === 'new' && inboxCount > 0 && (
              <button
                onClick={onClear}
                disabled={clearingIdeas}
                title="Dismiss all unreviewed ideas"
                className="p-2 rounded-lg transition-all disabled:opacity-50 flex-shrink-0 sm:ml-auto"
                style={{ background: 'rgba(var(--danger-rgb),0.10)', border: '1px solid rgba(var(--danger-rgb),0.25)', color: '#f87171' }}
              >
                {clearingIdeas ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {visibleIdeas.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {visibleIdeas.map(idea => (
                <CompetitorVideoCard
                  key={idea.id}
                  idea={idea}
                  onOpen={() => onOpenIdea(idea.id)}
                  onLike={value => onIdeaUpdated({ ...idea, liked: idea.liked === value ? null : value })}
                  onUpdated={onIdeaUpdated}
                  onSave={() => onSaveIdea(idea)}
                />
              ))}
            </div>
          ) : (
            <EmptyState>
              {floor > 0 || channelFilter
                ? 'Nothing matches these filters. Try lowering the multiplier or switching back to All channels.'
                : filter === 'new'
                  ? 'Inbox zero. New ideas land here when a competitor beats their own average.'
                  : 'Nothing dismissed.'}
            </EmptyState>
          )}
        </>
      ) : channels.length > 0 ? (
        <EmptyState>No ideas yet. Hit "Find new ideas" to pull the shorts that beat their channel's average.</EmptyState>
      ) : (
        <EmptyState icon={<Users className="w-8 h-8 text-gray-700" />}>
          Add a competitor channel to start tracking what actually works on their channel.
        </EmptyState>
      )}
    </div>
  );
}

function EmptyState({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
    >
      {icon ?? <Lightbulb className="w-8 h-8 text-gray-700" />}
      <p className="text-gray-500 text-sm max-w-sm">{children}</p>
    </div>
  );
}
