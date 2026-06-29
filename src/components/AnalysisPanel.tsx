import { useEffect, useState } from 'react';
import { Analysis } from '../lib/supabase';
import { Sparkles, AlertCircle, X, TrendingUp, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ScoreCircle, ScoreBreakdown } from './ScoreCircle';

interface AnalysisPanelProps {
  analysis: Analysis | null;
  open: boolean;
  onClose: () => void;
}

function FeedbackSection({ analysisId }: { analysisId: string }) {
  const { user } = useAuth();
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (selectedRating: 'good' | 'bad') => {
    if (!user || submitted) return;
    setRating(selectedRating);

    if (selectedRating === 'good') {
      // Submit immediately for thumbs up
      setSubmitting(true);
      await supabase.from('analysis_feedback').insert({
        analysis_id: analysisId,
        user_id: user.id,
        rating: selectedRating,
        reason: null,
      });
      setSubmitting(false);
      setSubmitted(true);
    }
    // For thumbs down, wait for reason
  };

  const submitWithReason = async () => {
    if (!user || !rating || submitted) return;
    setSubmitting(true);
    await supabase.from('analysis_feedback').insert({
      analysis_id: analysisId,
      user_id: user.id,
      rating,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-emerald-400 text-sm">
        <span>✓</span>
        <span>Thanks, this helps Hershy improve.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide">Was this analysis helpful?</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => submit('good')}
          disabled={submitting}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            rating === 'good'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'text-gray-400 hover:text-white border border-white/10 hover:border-white/20'
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          Yes
        </button>
        <button
          onClick={() => submit('bad')}
          disabled={submitting}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            rating === 'bad'
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : 'text-gray-400 hover:text-white border border-white/10 hover:border-white/20'
          }`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          No
        </button>
      </div>

      {rating === 'bad' && (
        <div className="space-y-2 animate-fade-in">
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="What was off? (optional)"
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          />
          <button
            onClick={submitWithReason}
            disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <Send className="w-3 h-3" />
            {submitting ? 'Sending...' : 'Send feedback'}
          </button>
        </div>
      )}
    </div>
  );
}

export function AnalysisPanel({ analysis, open, onClose }: AnalysisPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl flex flex-col rounded-2xl animate-scale-in"
        style={{
          background: 'rgba(10,15,26,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          maxHeight: '90vh',
        }}
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
            {analysis?.is_my_video && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,164,233,0.1)', color: '#38BDF8', border: '1px solid rgba(14,164,233,0.2)' }}>
                My video
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
                    <div className="flex flex-col items-center gap-1">
                      <ScoreCircle score={Number(analysis.hook_analysis.overall_score)} />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Score</span>
                    </div>
                  )}
                </div>
                {(analysis.hook_analysis?.hook_type || analysis.hook_analysis?.video_format) && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {analysis.hook_analysis?.hook_type && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.25)' }}>
                        {analysis.hook_analysis.hook_type}
                      </span>
                    )}
                    {analysis.hook_analysis?.video_format && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(14,164,233,0.1)', color: '#38BDF8', border: '1px solid rgba(14,164,233,0.2)' }}>
                        {analysis.hook_analysis.video_format}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                  {analysis.hook_analysis?.overall_assessment}
                </p>
                {analysis.hook_analysis?.score_breakdown && (
                  <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <ScoreBreakdown items={[
                      { label: 'Hook', value: analysis.hook_analysis.score_breakdown.hook, max: 30 },
                      { label: 'Retention', value: analysis.hook_analysis.score_breakdown.retention, max: 25 },
                      { label: 'Payoff', value: analysis.hook_analysis.score_breakdown.payoff, max: 25 },
                      { label: 'Delivery', value: analysis.hook_analysis.score_breakdown.delivery, max: 20 },
                    ]} />
                  </div>
                )}
              </div>

              {(analysis as any).strong_spots && (analysis as any).strong_spots.length > 0 && (
                <div>
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <ThumbsUp className="w-4 h-4 text-emerald-400" />
                    What Works
                  </h3>
                  <div className="space-y-2">
                    {(analysis as any).strong_spots.map((spot: string, idx: number) => (
                      <div key={idx} className="rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
                        <div className="flex gap-2">
                          <span className="text-emerald-400 font-bold text-xs mt-0.5 flex-shrink-0">{idx + 1}</span>
                          <p className="text-gray-300 text-sm leading-snug">{spot}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div className="pt-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <FeedbackSection analysisId={analysis.id} />
                <p className="text-xs text-gray-600">
                  Generated {new Date(analysis.created_at).toLocaleDateString()} at {new Date(analysis.created_at).toLocaleTimeString()}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
