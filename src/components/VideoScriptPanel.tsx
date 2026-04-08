import { useState, useEffect } from 'react';
import { Video } from '../lib/supabase';
import { X, Sparkles, Loader2, Eye, ThumbsUp, MessageSquare } from 'lucide-react';

interface VideoScriptPanelProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
  onAnalyze: (videoId: string, videoContext: string) => void;
  analyzing: boolean;
}

export function VideoScriptPanel({ video, open, onClose, onAnalyze, analyzing }: VideoScriptPanelProps) {
  const [videoContext, setVideoContext] = useState('');

  useEffect(() => {
    if (video) {
      setVideoContext((video as any).video_context || '');
    }
  }, [video?.video_id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const handleAnalyze = () => {
    if (!video) return;
    onAnalyze(video.video_id, videoContext);
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[520px] z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(10,15,26,0.85)', borderLeft: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h2 className="text-base font-semibold text-white">Analyze Video</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {video && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex gap-3">
                {video.thumbnail_url && (
                  <img
                    src={video.thumbnail_url}
                    alt={video.title}
                    className="w-16 aspect-square object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="text-white text-sm font-medium line-clamp-2 leading-snug mb-2">
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {fmt(video.views)}
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3" />
                      {fmt(video.likes_count ?? 0)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {fmt(video.comment_count ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col gap-5">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">
                  Video Context <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Add context about this video so the analysis is more relevant — e.g. what it's about, who it's for, what you were trying to achieve.
                </p>
                <textarea
                  value={videoContext}
                  onChange={e => setVideoContext(e.target.value)}
                  placeholder="e.g. 'Fortnite clutch gameplay, targeting competitive players aged 16-24, trying to hook with the dramatic ending first'"
                  rows={4}
                  className="w-full rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none leading-relaxed transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#8B5CF6'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: analyzing ? 'rgba(139,92,246,0.5)' : 'linear-gradient(135deg, #8B5CF6, #0EA4E9)' }}
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {analyzing ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
