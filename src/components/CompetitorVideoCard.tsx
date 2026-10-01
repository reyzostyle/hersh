import { formatViews, type FeedItem } from '../lib/competitors';
import { Skeleton } from './Page';
import { ShortThumb } from './ShortThumb';

// A card in the Ideas feed, rebuilt 2026-09-30 around one question: is this an
// idea for ME?
//
// It used to lead with the other channel's title in 13px text, which is
// someone else's video, not an idea - Ivan could not tell from the grid whether
// any card suited his channel until he paid a credit to find out. Now the frame
// and how far it beat its channel are what you see first (they are also what
// reads on camera), and the text is THIS creator's version in one line, with a
// quiet mark when it does not fit their channel. The source title drops to a
// caption.
//
// While the pitch is still being written the line is a skeleton, so the grid
// fills in rather than arrives.
export function CompetitorVideoCard({ item, pitching, readOnly, thumb, onOpen, onDismiss, onSave }: {
  item: FeedItem;
  pitching?: boolean;
  // A pre-cropped 4:5 image to use instead of YouTube's letterboxed frame
  // (the landing ships its own, see scripts/landing-thumbs.py).
  thumb?: string;
  // The landing page shows real cards with nothing behind them: no buttons,
  // and not announced as a control.
  readOnly?: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  onSave: () => void;
}) {
  const idea = item.idea;
  const isSaved = idea?.liked === true;
  const isDismissed = idea?.liked === false;
  const pitch = idea?.pitch;
  const fit = idea?.fit;

  return (
    <div
      className="idea-card group"
      style={{ opacity: isDismissed ? 0.5 : 1 }}
      onClick={readOnly ? undefined : onOpen}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onKeyDown={readOnly ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      data-readonly={readOnly ? 'true' : undefined}
    >
      <div className="idea-card__media">
        <ShortThumb videoId={item.video_id} src={thumb} />
        {item.outlier_score != null && item.outlier_score < 1000 && (
          <span className="idea-card__mult" title="Views against this channel's usual">
            {item.outlier_score}×
          </span>
        )}
      </div>

      <div className="idea-card__body">
        {pitch ? (
          <p className="idea-card__pitch">{pitch}</p>
        ) : pitching ? (
          <div className="flex flex-col gap-1.5 py-0.5" aria-label="Writing your version">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : (
          <p className="idea-card__pitch" style={{ color: 'var(--text-muted)' }}>{item.video_title || 'Untitled video'}</p>
        )}

        <p className="idea-card__meta">
          {fit === 'yes' && <span className="idea-card__fit">Fits your channel</span>}
          {fit === 'stretch' && <span>Stretch</span>}
          {fit === 'no' && <span>Not your niche</span>}
          {fit && ' · '}
          {[item.channel_name, item.video_views != null ? formatViews(item.video_views) : null].filter(Boolean).join(' · ')}
        </p>

        {/* stopPropagation so keeping or dropping never also opens the card. */}
        {!readOnly && <div className="idea-card__actions" onClick={e => e.stopPropagation()}>
          <button onClick={onSave} data-on={isSaved}>{isSaved ? 'Saved' : 'Save'}</button>
          <button onClick={onDismiss}>{isDismissed ? 'Restore' : 'Dismiss'}</button>
        </div>}
      </div>
    </div>
  );
}
