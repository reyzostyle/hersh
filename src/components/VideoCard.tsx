import { Video } from '../lib/supabase';
import { Eye, ThumbsUp, MessageSquare, Check, FileText } from 'lucide-react';

interface VideoCardProps {
  video: Video;
  isSelected?: boolean;
  onSelect?: (videoId: string) => void;
}

export function VideoCard({ video, isSelected = false, onSelect }: VideoCardProps) {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasScript = !!video.script?.trim();

  return (
    <div
      className={`rounded-lg overflow-hidden transition-all cursor-pointer relative select-none ${
        isSelected
          ? 'ring-2 ring-[#0EA4E9]/40'
          : ''
      }`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: isSelected ? '1px solid #0EA4E9' : '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={() => onSelect?.(video.video_id)}
    >
      <div className="relative aspect-[9/16]" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">
            No thumbnail
          </div>
        )}

        {isSelected && (
          <div className="absolute inset-0 bg-[#0EA4E9]/20 flex items-center justify-center">
            <div className="bg-[#0EA4E9] rounded-full p-1.5 shadow-lg">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}

        {video.duration > 0 && (
          <div className="absolute bottom-1.5 right-1.5 bg-black/80 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
            {formatDuration(video.duration)}
          </div>
        )}

        {hasScript && (
          <div className="absolute top-1.5 left-1.5 bg-emerald-500/90 rounded p-0.5">
            <FileText className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="p-2">
        <h3 className="text-white text-[11px] font-medium line-clamp-2 leading-tight mb-1.5">
          {video.title}
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-0.5">
            <Eye className="w-2.5 h-2.5" />
            {fmt(video.views)}
          </span>
          <span className="flex items-center gap-0.5">
            <ThumbsUp className="w-2.5 h-2.5" />
            {fmt(video.likes_count ?? 0)}
          </span>
          <span className="flex items-center gap-0.5">
            <MessageSquare className="w-2.5 h-2.5" />
            {fmt(video.comment_count ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
