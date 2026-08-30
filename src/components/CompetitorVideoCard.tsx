import { Eye, EyeOff, TrendingUp, Sparkles, Loader2, FolderPlus, ExternalLink, Check } from 'lucide-react';
import { formatViews, formatDate, type CompetitorIdea } from '../lib/competitors';
import { useIdeaGeneration } from '../lib/useIdeaGeneration';

// Text-first, no thumbnail. The 16:9 image block was most of the card's
// height while telling you almost nothing — a Shorts mqdefault is the
// vertical frame padded with blur — so on a phone you could compare two
// ideas per screen. The multiplier, the title and the first lines of the
// angle are what you actually judge on, and those fit three or four to a
// screen without an image.
export function CompetitorVideoCard({ idea, onOpen, onLike, onUpdated, onSave }: {
  idea: CompetitorIdea;
  onOpen: () => void;
  onLike: (value: boolean) => void;
  onUpdated: (updated: CompetitorIdea) => void;
  onSave: () => void;
}) {
  const hasOutline = !!idea.outline;
  const { generatingOutline, generateOutline } = useIdeaGeneration(idea, onUpdated);

  const handleAction = async () => {
    if (hasOutline) { onOpen(); return; }
    if (await generateOutline()) onOpen();
  };

  return (
    <div
      className="group rounded-xl p-3 flex flex-col gap-2 transition-all cursor-pointer glass-panel hover:ring-1 hover:ring-[var(--accent)]/40"
      style={{ opacity: idea.liked === false ? 0.45 : 1 }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      {/* Header: the numbers you sort on, in one line */}
      <div className="flex items-center gap-2 min-w-0">
        {idea.outlier_score != null && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
            style={{ background: 'rgba(var(--ok-rgb),0.14)', color: '#6ee7b7' }}
            title="Views per day versus this channel's usual pace"
          >
            <TrendingUp className="w-3 h-3" />
            {idea.outlier_score}x
          </span>
        )}
        <span className="text-[11px] text-gray-500 truncate min-w-0">{idea.channel_name}</span>
        <span className="ml-auto flex items-center gap-2 flex-shrink-0 text-[11px] text-gray-600 tabular-nums">
          {idea.video_views !== null && (
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatViews(idea.video_views)}</span>
          )}
          {idea.video_published_at && <span>{formatDate(idea.video_published_at)}</span>}
        </span>
      </div>

      <p className="text-white text-[13px] font-medium leading-snug line-clamp-2">
        {idea.video_title || 'Untitled video'}
      </p>

      {idea.adapted_idea && (
        <p className="text-[12px] leading-relaxed line-clamp-2 text-violet-200/70">
          {idea.adapted_idea}
        </p>
      )}

      {/* Action pills. stopPropagation so filing or dismissing an idea never
          also opens it — the feed is meant to be cleared fast. */}
      <div className="flex items-center gap-1.5 mt-auto pt-0.5" onClick={e => e.stopPropagation()}>
        <button
          onClick={onSave}
          title={idea.liked === true ? 'Saved — change folder' : 'Save to folder'}
          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
          style={idea.liked === true
            ? { background: 'rgba(var(--ok-rgb),0.12)', color: '#6ee7b7' }
            : { color: '#6b7280' }}
        >
          {idea.liked === true ? <Check className="w-3 h-3" /> : <FolderPlus className="w-3 h-3" />}
          {idea.liked === true ? 'Saved' : 'Save'}
        </button>

        <button
          onClick={() => onLike(false)}
          title="Dismiss idea"
          className="p-1 rounded-lg transition-colors"
          style={{ color: idea.liked === false ? '#9ca3af' : '#4b5563' }}
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>

        <a
          href={`https://www.youtube.com/watch?v=${idea.video_id}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on YouTube"
          className="p-1 rounded-lg text-gray-600 hover:text-gray-300 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <button
          onClick={handleAction}
          disabled={generatingOutline}
          className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-60"
          style={{ color: 'var(--accent-soft)', background: 'rgba(var(--accent-rgb),0.10)' }}
        >
          {generatingOutline ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {generatingOutline ? 'Creating...' : hasOutline ? 'View outline' : 'Create outline'}
        </button>
      </div>
    </div>
  );
}
