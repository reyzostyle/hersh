import { EyeOutlineIcon as Eye, SlashCircleOutlineIcon as Dismissed, GraphUpOutlineIcon as TrendingUp, BookmarkOutlineIcon as Bookmark } from '@solar-icons/react';
import { Check } from './BrandIcons';
import { formatViews, formatDate, type FeedItem } from '../lib/competitors';

// A tile in the grid, and nothing more. It used to carry a preview of the
// written angle and two more buttons, which made every card a small document
// you had to read to get past. Triage is a glance: how hard it beat its
// channel, what it was, keep or drop. Everything else happens on the video's
// own screen.
export function CompetitorVideoCard({ item, onOpen, onDismiss, onSave }: {
  item: FeedItem;
  onOpen: () => void;
  onDismiss: () => void;
  onSave: () => void;
}) {
  const idea = item.idea;
  const isSaved = idea?.liked === true;
  const isDismissed = idea?.liked === false;

  return (
    <div
      className="group rounded-[var(--r-md)] p-3.5 flex flex-col gap-2.5 transition-colors cursor-pointer"
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        opacity: isDismissed ? 0.5 : 1,
      }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {item.outlier_score != null && (
          <span
            className="flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded flex-shrink-0 tabular-nums"
            style={{ background: 'rgba(var(--process-rgb),0.12)', color: 'var(--process)' }}
            title="Views against this channel's median"
          >
            <TrendingUp className="w-3 h-3" />
            {item.outlier_score}x
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 flex-shrink-0 font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-faint)' }}>
          {item.video_views !== null && (
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatViews(item.video_views)}</span>
          )}
          {item.video_published_at && <span>{formatDate(item.video_published_at)}</span>}
        </span>
      </div>

      <p className="text-[13px] font-medium leading-snug line-clamp-2" style={{ color: 'var(--text)' }}>
        {item.video_title || 'Untitled video'}
      </p>

      <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{item.channel_name}</p>

      {/* stopPropagation so keeping or dropping never also opens the card. */}
      <div className="flex items-center gap-1 mt-auto pt-1" onClick={e => e.stopPropagation()}>
        <button
          onClick={onSave}
          title={isSaved ? 'Saved' : 'Save'}
          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-[var(--r-sm)] transition-colors"
          style={isSaved
            ? { background: 'rgba(var(--process-rgb),0.12)', color: 'var(--process)' }
            : { color: 'var(--text-faint)' }}
        >
          {isSaved ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
          {isSaved ? 'Saved' : 'Save'}
        </button>

        <button
          onClick={onDismiss}
          title={isDismissed ? 'Put back' : 'Dismiss'}
          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-[var(--r-sm)] transition-colors hover:text-[var(--text)]"
          style={{ color: 'var(--text-faint)' }}
        >
          <Dismissed className="w-3 h-3" />
          {isDismissed ? 'Restore' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}
