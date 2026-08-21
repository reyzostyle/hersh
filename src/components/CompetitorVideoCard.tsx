import { Eye, Heart, EyeOff, TrendingUp, Sparkles, FileText, Play } from 'lucide-react';
import { formatViews, formatDate, type CompetitorIdea } from '../lib/competitors';

// One tile in the discovery grid. Deliberately shows only what you need to
// judge the video at a glance — thumbnail, how far it beat its channel, and
// the basic numbers. The AI writeup lives in the drawer behind a click,
// because rendering it inline was what turned the old feed into a wall of
// text you had to scroll past to reach the next idea.
//
// 16:9 rather than a vertical shorts frame on purpose: the backend stores
// `thumbnails.medium` (mqdefault, 320x180), so a 9:16 tile would have to
// crop a 16:9 source and would cut the subject out of frame.
export function CompetitorVideoCard({ idea, onOpen, onLike }: {
  idea: CompetitorIdea;
  onOpen: () => void;
  onLike: (value: boolean) => void;
}) {
  const hasScript = !!idea.script;
  const hasOutline = !!idea.outline;

  return (
    <div
      className="group relative rounded-2xl overflow-hidden flex flex-col transition-all cursor-pointer glass-panel hover:ring-1 hover:ring-[#0EA4E9]/40"
      style={{ opacity: idea.liked === false ? 0.45 : 1 }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {idea.video_thumbnail ? (
          <img src={idea.video_thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-6 h-6 text-gray-700" fill="currentColor" />
          </div>
        )}

        {/* The number the whole feed exists to surface, so it sits on the
            image itself rather than in the metadata row below it. */}
        {idea.outlier_score != null && (
          <span
            className="absolute top-2 left-2 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm"
            style={{ background: 'rgba(6,32,24,0.82)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.35)' }}
            title="Views per day versus this channel's usual pace"
          >
            <TrendingUp className="w-3 h-3" />
            {idea.outlier_score}x
          </span>
        )}

        {/* Workspace state stays visible without opening the drawer — the
            script is the thing people come back for, so "already written"
            has to be readable from the grid. */}
        {(hasOutline || hasScript) && (
          <span
            className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded-lg backdrop-blur-sm"
            style={hasScript
              ? { background: 'rgba(8,28,45,0.82)', color: '#38bdf8', border: '1px solid rgba(14,164,233,0.35)' }
              : { background: 'rgba(6,32,24,0.82)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.3)' }}
          >
            {hasScript ? <FileText className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
            {hasScript ? 'Script' : 'Outline'}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
        <p className="text-white text-[13px] font-medium leading-snug line-clamp-2">
          {idea.video_title || 'Untitled video'}
        </p>

        <div className="mt-auto flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-gray-500 truncate flex-1 min-w-0">{idea.channel_name}</span>
          {idea.video_views !== null && (
            <span className="flex items-center gap-1 text-[11px] text-gray-500 flex-shrink-0 tabular-nums">
              <Eye className="w-3 h-3" />
              {formatViews(idea.video_views)}
            </span>
          )}
          {idea.video_published_at && (
            <span className="text-[11px] text-gray-600 flex-shrink-0 tabular-nums">{formatDate(idea.video_published_at)}</span>
          )}
        </div>
      </div>

      {/* Triage. stopPropagation so rating an idea never also opens it — the
          feed is meant to be cleared fast without a drawer opening each time. */}
      <div
        className="flex items-center gap-1 px-3 pb-3"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onLike(true)}
          title="Save idea"
          className="p-1.5 rounded-lg transition-all"
          style={{
            background: idea.liked === true ? 'rgba(239,68,68,0.15)' : 'transparent',
            color: idea.liked === true ? '#f87171' : '#4b5563',
          }}
        >
          <Heart className="w-4 h-4" fill={idea.liked === true ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => onLike(false)}
          title="Dismiss idea"
          className="p-1.5 rounded-lg transition-all"
          style={{
            background: idea.liked === false ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: idea.liked === false ? '#6b7280' : '#4b5563',
          }}
        >
          <EyeOff className="w-4 h-4" />
        </button>
        {/* Names the actual next step. It used to read "Get angle" for an
            idea whose angle was already written at fetch time, so the one
            thing left to do — the outline — went unnamed. */}
        <span className="ml-auto text-[11px] font-medium text-gray-600 group-hover:text-[#38bdf8] transition-colors">
          {hasScript ? 'Open script' : hasOutline ? 'Write script' : 'Create outline'}
        </span>
      </div>
    </div>
  );
}
