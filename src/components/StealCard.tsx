import type { CompetitorIdea } from '../lib/competitors';
import { ShortThumb } from './ShortThumb';
import { formatViews } from '../lib/competitors';

// The result of a steal, drawn to be filmed: a phone pointed at a laptop has
// to read it at arm's length. So it carries three things and nothing else -
// the video it came from, how far that video beat its own channel, and the
// hook. The outline is one tap away. 9:16 because that is the shape of the
// thing being stolen and of the phone filming it.

export interface StealCardProps {
  idea: Pick<CompetitorIdea, 'video_id' | 'video_thumbnail' | 'video_views' | 'channel_name' | 'outline'>;
  // Views over the source channel's median. null when there is no baseline;
  // the card then leads with raw views rather than inventing a ratio.
  multiplier: number | null;
  onOpen?: () => void;
}

export function StealCard({ idea, multiplier, onOpen }: StealCardProps) {
  // Four digits of multiplier is true for a tiny channel and reads as a bug;
  // the server already refuses tiny baselines, this covers rows scored before.
  const ratio = multiplier !== null && multiplier < 1000 ? multiplier : null;
  const big = ratio !== null ? `${ratio}×` : formatViews(idea.video_views);
  const bigLabel = ratio !== null ? 'more views than this channel usually gets' : 'views on the original';

  return (
    <article className="sc">
      <div className="sc__media"><ShortThumb videoId={idea.video_id} eager /></div>
      <div className="sc__body">
        <p className="sc__source">{idea.channel_name} · {formatViews(idea.video_views)} views</p>
        <p className="sc__big">{big}</p>
        <p className="sc__big-label">{bigLabel}</p>
        <p className="sc__hook">{idea.outline?.hook}</p>
        {onOpen && <button type="button" className="sc__open" onClick={onOpen}>View outline</button>}
      </div>
    </article>
  );
}
