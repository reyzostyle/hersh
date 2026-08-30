import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, Calendar, TrendUp as TrendingUp, ArrowSquareOut as ExternalLink, FolderPlus, EyeSlash as EyeOff, Check } from '@phosphor-icons/react';
import { formatViews, formatDate, type CompetitorIdea } from '../lib/competitors';
import { CompetitorIdeaAnalysis } from './CompetitorIdeaAnalysis';

// Slide-over holding everything the grid tile leaves out. Keeping the AI
// writeup here is what lets the feed stay scannable: you judge on the
// thumbnail and the multiplier, and only pay attention to the text for the
// one idea you actually picked.
export function CompetitorIdeaDrawer({ idea, onClose, onUpdated, onSave }: {
  idea: CompetitorIdea;
  onClose: () => void;
  onUpdated: (updated: CompetitorIdea) => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portalled to <body> rather than rendered in place. The dashboard scrolls
  // an inner div, not the window, so locking `body.overflow` did nothing and
  // wheel events over the drawer chained straight into the feed behind it —
  // scrolling the panel scrolled the grid too. Out here the only scroll
  // ancestor is the page itself, and `overscroll-contain` on the panel stops
  // the chain at its own edges.
  return createPortal(
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
        style={{ background: 'var(--bg-raised)', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-sm font-semibold text-white truncate">{idea.channel_name || 'Idea'}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onSave}
              title={idea.liked === true ? 'Saved — change folder' : 'Save to folder'}
              className="flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg transition-all"
              style={idea.liked === true
                ? { background: 'rgba(var(--ok-rgb),0.12)', color: '#6ee7b7' }
                : { color: '#6b7280' }}
            >
              {idea.liked === true ? <Check className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
              {idea.liked === true ? 'Saved' : 'Save'}
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

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {/* Source video. Deliberately a small row, not a hero image: a
              full-width thumbnail pushed the actual actions below the fold,
              and a Shorts mqdefault blown up to that size is mostly the
              blurred padding YouTube bakes around the vertical frame. */}
          <a
            href={`https://www.youtube.com/watch?v=${idea.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 rounded-xl p-2.5 group transition-colors hover:bg-white/[0.03]"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {idea.video_thumbnail && (
              <div className="relative w-28 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <img src={idea.video_thumbnail} alt="" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.45)' }}>
                  <ExternalLink className="w-4 h-4 text-white" />
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-white text-sm font-medium leading-snug line-clamp-2">{idea.video_title || 'Untitled video'}</p>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {idea.outlier_score != null && (
                  <span
                    className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(var(--ok-rgb),0.12)', color: '#6ee7b7' }}
                    title="Views per day versus this channel's usual pace"
                  >
                    <TrendingUp className="w-3 h-3" />
                    {idea.outlier_score}x
                  </span>
                )}
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

          <CompetitorIdeaAnalysis idea={idea} onUpdated={onUpdated} stickyActions />
        </div>
      </div>
    </div>,
    document.body
  );
}
