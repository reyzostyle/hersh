import { useEffect } from 'react';
import { Analysis } from '../lib/supabase';
import { History, Sparkles, X, ChevronRight } from 'lucide-react';

interface HistoryPanelProps {
  analyses: Analysis[];
  open: boolean;
  onClose: () => void;
  onSelect: (analysis: Analysis) => void;
}

export function HistoryPanel({ analyses, open, onClose, onSelect }: HistoryPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md flex flex-col rounded-2xl animate-scale-in"
        style={{
          background: 'rgba(10,15,26,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          maxHeight: '85vh',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-[#0EA4E9]" />
            <h2 className="text-lg font-bold text-white">History</h2>
            {analyses.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400 border border-gray-600/40">
                {analyses.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {analyses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <Sparkles className="w-8 h-8 text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">No analyses yet.</p>
              <p className="text-gray-600 text-xs mt-1">Select a video and click Analyze.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {analyses.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { onSelect(a); onClose(); }}
                  className="w-full text-left px-6 py-4 hover:bg-white/5 transition-colors group flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        a.analysis_type === 'advanced'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-gray-700/60 text-gray-400 border border-gray-600/40'
                      }`}>
                        {a.analysis_type === 'advanced' ? 'Advanced' : 'Basic'}
                      </span>
                      <span className="text-xs text-gray-500 truncate">
                        {formatDate(a.created_at)} · {formatTime(a.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm leading-snug line-clamp-2">
                      {a.hook_analysis?.overall_assessment || 'No assessment available'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 mt-1 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
