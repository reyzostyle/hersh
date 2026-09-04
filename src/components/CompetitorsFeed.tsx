import { useState } from 'react';
import { LightbulbOutlineIcon as Lightbulb, TrashBinMinimalisticOutlineIcon as Trash2, RefreshOutlineIcon as Loader2, AddOutlineIcon as Plus, RefreshOutlineIcon as RefreshCw, AltArrowUpOutlineIcon as ChevronUp, UsersGroupRoundedOutlineIcon as Users } from '@solar-icons/react';
import {
  sortAndFilterFeed,
  type CompetitorChannel, type FeedItem, type IdeaFilter, type IdeaSort, type PoolVideo,
} from '../lib/competitors';
import { CompetitorVideoCard } from './CompetitorVideoCard';
import { CompetitorsChannels } from './CompetitorsChannels';
import { ErrorNotice } from './ErrorNotice';
import { Empty } from './Page';

interface Props {
  items: FeedItem[];
  counts: Record<IdeaFilter, number>;
  pool: PoolVideo[];
  channels: CompetitorChannel[];
  filter: IdeaFilter;
  onFilterChange: (f: IdeaFilter) => void;
  onOpen: (item: FeedItem) => void;
  onDismiss: (item: FeedItem) => void;
  onSave: (item: FeedItem) => void;
  onClear: (visible: FeedItem[]) => void;
  clearing: boolean;
  addingChannel: boolean;
  addError: string;
  removingId: string | null;
  syncingChannelId: string | null;
  onAddChannel: (url: string) => void;
  onRemoveChannel: (channel: CompetitorChannel) => void;
  onAutoFind: () => void;
  channelLimit: number;
  refreshing: boolean;
  fetchError: string;
  fetchNotice: string;
  onRefresh: () => void;
  adaptForProfile: boolean;
  onAdaptChange: (v: boolean) => void;
}

const SORTS: { value: IdeaSort; label: string }[] = [
  { value: 'outlier', label: 'Top outliers' },
  { value: 'views', label: 'Most viewed' },
  { value: 'recent', label: 'Newest' },
];

const TABS: { id: IdeaFilter; label: string }[] = [
  { id: 'new', label: 'Inbox' },
  { id: 'saved', label: 'Saved' },
  { id: 'dismissed', label: 'Dismissed' },
];

// One row of controls above the grid, and the channel list stays out of the way
// until you ask for it. There used to be four rows before the first card: a
// channel list that is identity rather than a filter, a Feed/Saved switch in
// the page header AND an Inbox/Dismissed switch below it for the same axis, and
// a multiplier floor nobody set twice.
export function CompetitorsFeed({
  items, counts, pool, channels, filter, onFilterChange, onOpen, onDismiss, onSave,
  onClear, clearing,
  addingChannel, addError, removingId, syncingChannelId, onAddChannel, onRemoveChannel,
  onAutoFind, channelLimit, refreshing, fetchError, fetchNotice, onRefresh,
  adaptForProfile, onAdaptChange,
}: Props) {
  const [manageOpen, setManageOpen] = useState(false);
  const [sort, setSort] = useState<IdeaSort>('outlier');

  const visible = sortAndFilterFeed(items, { floor: 0, sort, channelId: null });
  const nothingAnywhere = counts.new + counts.saved + counts.dismissed === 0;

  return (
    <div className="space-y-3">
      {/* One row on a desktop, two on a phone. It used to be one row that
          scrolled sideways, which put Refresh - the button this screen exists
          to press - off the right edge behind a horizontal swipe nobody
          expects. The filters keep their own scroll on the first line, and the
          controls sit on the second where they are always reachable.
          sm:contents dissolves the second wrapper on a desktop, so the row
          above the phone breakpoint is exactly what it was. */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
        <div className="overflow-x-auto pb-0.5 -mb-0.5 sm:overflow-visible sm:pb-0 sm:mb-0 sm:flex-shrink-0">
          <div className="seg w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => onFilterChange(t.id)} data-on={filter === t.id}>
                {t.label} ({counts[t.id]})
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:contents">
        <select
          value={sort}
          onChange={e => setSort(e.target.value as IdeaSort)}
          className="flex-shrink-0 px-2.5 py-[7px] rounded-[var(--r-sm)] text-xs font-medium focus:outline-none cursor-pointer"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text-muted)' }}
        >
          {SORTS.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--bg-raised)' }}>{s.label}</option>)}
        </select>

        <div className="flex items-center gap-2 ml-auto flex-shrink-0 pl-2">
          {filter === 'new' && visible.length > 0 && (
            <button
              onClick={() => onClear(visible)}
              disabled={clearing}
              title="Dismiss everything on screen. The next best outliers take their place."
              className="p-[7px] rounded-[var(--r-sm)] transition-colors disabled:opacity-50"
              style={{ border: '1px solid rgba(var(--danger-rgb),0.25)', color: 'rgb(var(--danger-rgb))' }}
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={() => setManageOpen(o => !o)} className="chip" style={{ borderStyle: 'dashed' }}>
            {manageOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {channels.length === 0 ? 'Add channel' : 'Manage'}
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Check the tracked channels for new outliers. Costs nothing."
            className="btn-primary flex items-center gap-1.5 px-3 py-[7px] rounded-[var(--r-sm)] text-xs font-medium disabled:opacity-40"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {refreshing ? 'Checking' : 'Refresh'}
          </button>
        </div>
        </div>
      </div>

      {manageOpen && (
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
      )}

      {fetchError && <ErrorNotice message={fetchError} />}
      {fetchNotice && (
        <p className="text-[13px] rounded-[var(--r-sm)] px-4 py-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--line)', color: 'var(--text-muted)' }}>
          {fetchNotice}
        </p>
      )}

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {visible.map(item => (
            <CompetitorVideoCard
              key={item.video_id}
              item={item}
              onOpen={() => onOpen(item)}
              onDismiss={() => onDismiss(item)}
              onSave={() => onSave(item)}
            />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Empty icon={<Users className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
          Add a competitor channel to start tracking what actually works on their channel.
        </Empty>
      ) : nothingAnywhere ? (
        <Empty icon={<Lightbulb className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
          Nothing pooled yet. Hit Refresh - it costs nothing.
        </Empty>
      ) : (
        <Empty icon={<Lightbulb className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />}>
          {filter === 'new' ? 'Inbox zero.' : filter === 'saved' ? 'Nothing saved yet.' : 'Nothing dismissed.'}
        </Empty>
      )}
    </div>
  );
}
