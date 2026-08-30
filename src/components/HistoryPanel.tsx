import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Analysis, Video } from '../lib/supabase';
import { ClockCounterClockwise as History, Sparkle as Sparkles, X, CaretRight as ChevronRight, LinkSimple as Link, FilmSlate as Film } from '@phosphor-icons/react';
import { SheetGrip, useSheetDismiss } from './SheetGrip';

interface HistoryPanelProps {
  analyses: Analysis[];
  videos: Video[];
  open: boolean;
  onClose: () => void;
  onSelect: (analysis: Analysis) => void;
}

export function HistoryPanel({ analyses, videos, open, onClose, onSelect }: HistoryPanelProps) {
  const { panelRef, dismiss } = useSheetDismiss(onClose);

  const getTitle = (a: Analysis) => {
    const hookTitle = (a.hook_analysis as any)?.title;
    if (hookTitle) return hookTitle;
    if (a.video_title) return a.video_title;
    const videoId = a.video_ids?.[0];
    if (videoId) {
      const video = videos.find(v => v.video_id === videoId);
      if (video?.title) return video.title;
    }
    // Fallback for old analyses: strip "Real problem:" prefix
    const assessment = a.hook_analysis?.overall_assessment || '';
    const stripped = assessment.replace(/^real problem:\s*/i, '').split(/[.!?]/)[0].trim();
    return stripped.length > 10 ? stripped.slice(0, 65) : null;
  };

  const getSource = (a: Analysis): 'youtube' | 'upload' | null => {
    const s = (a.hook_analysis as any)?.source;
    if (s === 'youtube' || s === 'upload') return s;
    // Fallback for old analyses: YouTube IDs are exactly 11 alphanumeric chars
    const vid = a.video_ids?.[0];
    if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) return 'youtube';
    return null;
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, dismiss]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const filtered = analyses;

  if (!open) return null;

  // Portaled to <body>: keeps the sheet outside the app's scroll container,
  // whose touchmove guard would otherwise block scrolling inside the modal.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', touchAction: 'none' }}
        onClick={dismiss}
      />
      <div
        ref={panelRef}
        className="relative w-full max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl animate-scale-in h-[85dvh] sm:h-[85vh]"
        style={{
          background: 'rgba(var(--surface-rgb),0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          willChange: 'transform',
        }}
      >
        <SheetGrip onClose={onClose} panelRef={panelRef} />
        {/* Icon-only header — a title next to the grip's centered pill
            collided with it on mobile, see AnalysisPanel for the same fix. */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-1 sm:py-2 flex-shrink-0">
          <div className="flex items-center gap-2 ml-1">
            <History className="w-5 h-5 text-[var(--accent)]" />
            {analyses.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400 border border-gray-600/40">
                {analyses.length}
              </span>
            )}
          </div>
          <button
            onClick={dismiss}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>


        <div className="flex-1 overflow-y-auto py-2 mt-2" style={{ overscrollBehavior: 'contain' }}>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <Sparkles className="w-8 h-8 text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">No analyses yet.</p>
              <p className="text-gray-600 text-xs mt-1">Select a video and click Analyze.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { onSelect(a); onClose(); }}
                  className="w-full text-left px-4 py-3.5 sm:px-6 sm:py-4 hover:bg-white/5 transition-colors group flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {getSource(a) === 'youtube' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(255,0,0,0.1)', color: '#f87171', border: '1px solid rgba(255,0,0,0.2)' }}>
                          <Link className="w-2.5 h-2.5" />URL
                        </span>
                      )}
                      {a.is_my_video && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(16,185,129,0.12)', color: '#34D399', border: '1px solid rgba(16,185,129,0.25)' }}>
                          Your video
                        </span>
                      )}
                      {getSource(a) === 'upload' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(var(--ok-rgb),0.1)', color: '#6ee7b7', border: '1px solid rgba(var(--ok-rgb),0.2)' }}>
                          <Film className="w-2.5 h-2.5" />File
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(a.created_at)} · {formatTime(a.created_at)}
                      </span>
                    </div>
                    {getTitle(a) ? (
                      <p className="text-white text-sm font-medium truncate">{getTitle(a)}</p>
                    ) : (
                      <p className="text-gray-500 text-xs leading-snug line-clamp-2">
                        {a.hook_analysis?.overall_assessment || 'No assessment available'}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 mt-1 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
