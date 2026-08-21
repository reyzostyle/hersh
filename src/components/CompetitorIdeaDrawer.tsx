import { useEffect } from 'react';
import { X, Eye, Calendar, TrendingUp, ExternalLink, Heart, EyeOff } from 'lucide-react';
import { formatViews, formatDate, type CompetitorIdea } from '../lib/competitors';
import { CompetitorIdeaAnalysis } from './CompetitorIdeaAnalysis';

// Slide-over holding everything the grid tile leaves out. Keeping the AI
// writeup here is what lets the feed stay scannable: you judge on the
// thumbnail and the multiplier, and only pay attention to the text for the
// one idea you actually picked.
export function CompetitorIdeaDrawer({ idea, onClose, onUpdated, isPro }: {
  idea: CompetitorIdea;
  onClose: () => void;
  onUpdated: (updated: CompetitorIdea) => void;
  isPro: boolean;
}) {
  // Esc closes, and the body underneath stops scrolling while it's open —
  // without the lock, scrolling inside the panel bleeds into the feed behind
  // it and you lose your place in the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Full width on phones (a narrow tray there just squeezes the script),
          a real side panel from tablet up. */}
      <div
        className="relative h-full w-full sm:max-w-md flex flex-col animate-slide-in-right"
        style={{ background: '#0B121F', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-sm font-semibold text-white truncate">Idea</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onUpdated({ ...idea, liked: idea.liked === true ? null : true })}
              title="Save idea"
              className="p-1.5 rounded-lg transition-all"
              style={{
                background: idea.liked === true ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: idea.liked === true ? '#f87171' : '#6b7280',
              }}
            >
              <Heart className="w-4 h-4" fill={idea.liked === true ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => onUpdated({ ...idea, liked: idea.liked === false ? null : false })}
              title="Dismiss idea"
              className="p-1.5 rounded-lg transition-all"
              style={{
                background: idea.liked === false ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: idea.liked === false ? '#9ca3af' : '#6b7280',
              }}
            >
              <EyeOff className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white transition-colors" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {/* Source video */}
          <a
            href={`https://www.youtube.com/watch?v=${idea.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl overflow-hidden group"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {idea.video_thumbnail && (
              <div className="relative aspect-video">
                <img src={idea.video_thumbnail} alt="" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <ExternalLink className="w-5 h-5 text-white" />
                </span>
              </div>
            )}
            <div className="p-3 space-y-1.5">
              <p className="text-white text-sm font-medium leading-snug">{idea.video_title || 'Untitled video'}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {idea.outlier_score != null && (
                  <span
                    className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7' }}
                    title="Views per day versus this channel's usual pace"
                  >
                    <TrendingUp className="w-3 h-3" />
                    {idea.outlier_score}x
                  </span>
                )}
                <span className="text-xs text-gray-500">{idea.channel_name}</span>
                {idea.video_views !== null && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Eye className="w-3 h-3" />{formatViews(idea.video_views)}
                  </span>
                )}
                {idea.video_published_at && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />{formatDate(idea.video_published_at)}
                  </span>
                )}
              </div>
            </div>
          </a>

          <CompetitorIdeaAnalysis idea={idea} onUpdated={onUpdated} isPro={isPro} />
        </div>
      </div>
    </div>
  );
}
