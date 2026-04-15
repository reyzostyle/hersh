import { useEffect } from 'react';
import { Analysis } from '../lib/supabase';
import { Sparkles, AlertCircle, Lightbulb, X, TrendingUp } from 'lucide-react';

interface AnalysisPanelProps {
  analysis: Analysis | null;
  open: boolean;
  onClose: () => void;
}

export function AnalysisPanel({ analysis, open, onClose }: AnalysisPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(10,15,26,0.85)', borderLeft: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[#0EA4E9]" />
            <h2 className="text-lg font-bold text-white">AI Analysis</h2>
            {analysis && (
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                analysis.analysis_type === 'advanced'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-gray-700/60 text-gray-400 border border-gray-600/40'
              }`}>
                {analysis.analysis_type === 'advanced' ? 'Advanced' : 'Basic'}
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {!analysis ? (
            <p className="text-gray-500 text-sm">No analysis yet. Select videos and click Analyze.</p>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wide">
                    <TrendingUp className="w-4 h-4 text-[#0EA4E9]" />
                    Overall Assessment
                  </h3>
                  {analysis.hook_analysis?.overall_score != null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Score</span>
                      <span className={`text-lg font-bold ${
                        analysis.hook_analysis.overall_score >= 7 ? 'text-emerald-400' :
                        analysis.hook_analysis.overall_score >= 4 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {analysis.hook_analysis.overall_score}<span className="text-xs text-gray-600 font-normal">/10</span>
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {analysis.hook_analysis?.overall_assessment}
                </p>
              </div>

              {analysis.weak_spots && analysis.weak_spots.length > 0 && (
                <div>
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <AlertCircle className="w-4 h-4 text-orange-400" />
                    Weak Spots
                  </h3>
                  <div className="space-y-2">
                    {analysis.weak_spots.map((spot, idx) => (
                      <div key={idx} className="bg-orange-950/20 border border-orange-900/30 rounded-lg p-3">
                        <div className="flex gap-2">
                          <span className="text-orange-400 font-bold text-xs mt-0.5 flex-shrink-0">{idx + 1}</span>
                          <p className="text-gray-300 text-sm leading-snug">{spot}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.new_hook_ideas && analysis.new_hook_ideas.length > 0 && (
                <div>
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    New Hook Ideas
                  </h3>
                  <div className="space-y-3">
                    {analysis.new_hook_ideas.map((idea, idx) => (
                      <div key={idx} className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-[#0EA4E9]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-[#0EA4E9] font-bold text-xs">{idx + 1}</span>
                          </div>
                          <div>
                            <p className="text-white font-medium text-sm mb-1">"{idea.hook}"</p>
                            <p className="text-gray-500 text-xs leading-relaxed">{idea.reasoning}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs text-gray-600">
                  Generated {new Date(analysis.created_at).toLocaleDateString()} at {new Date(analysis.created_at).toLocaleTimeString()}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
