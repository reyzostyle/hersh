import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Analysis } from '../lib/supabase';
import { SheetGrip, useSheetDismiss } from './SheetGrip';
import { AlertCircle, X, ArrowLeft, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ScoreCircle, ScoreBreakdown } from './ScoreCircle';

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
};

// Break a long assessment into readable paragraphs: honor blank lines if the
// model added them, otherwise group sentences ~2 per paragraph.
function toParagraphs(text?: string): string[] {
  if (!text) return [];
  const byBreaks = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (byBreaks.length > 1) return byBreaks;
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.map(s => s.trim()).filter(Boolean) || [text.trim()];
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) paras.push(sentences.slice(i, i + 2).join(' '));
  return paras;
}

interface AnalysisPanelProps {
  analysis: Analysis | null;
  open: boolean;
  onClose: () => void;
  /** When set, shows a back arrow that returns to wherever the analysis was opened from (e.g. History). */
  onBack?: () => void;
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
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(var(--danger-rgb),0.4)'; }}
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

export function AnalysisPanel({ analysis, open, onClose, onBack }: AnalysisPanelProps) {
  const { panelRef, dismiss } = useSheetDismiss(onClose);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, dismiss]);

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
        className="relative w-full max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl animate-scale-in max-h-[88dvh] sm:max-h-[90vh]"
        style={{
          // No backdrop blur: at 0.98 bg opacity it's invisible, but it forces
          // per-frame backdrop resampling that tanks the slide animation FPS.
          background: 'rgba(10,15,26,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          willChange: 'transform',
        }}
      >
        <SheetGrip onClose={onClose} panelRef={panelRef} />
        {/* Compact icon-only header (title/badges removed); on mobile the
            grip pill overlays this row, centered between the buttons */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-1 sm:py-2 flex-shrink-0">
          <div className="flex items-center min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
                title="Back to history"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
          </div>
          <button
            onClick={dismiss}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 sm:px-5 sm:pb-5 space-y-3" style={{ overscrollBehavior: 'contain' }}>
          {!analysis ? (
            <p className="text-gray-500 text-sm">No analysis yet. Select videos and click Analyze.</p>
          ) : (
            <>
              {/* Score + assessment */}
              <div className="rounded-2xl p-5 sm:p-6" style={card}>
                {/* Score summary — circle + criteria always visible at the top */}
                <div className="flex items-center gap-6">
                  {analysis.hook_analysis?.overall_score != null && (
                    <ScoreCircle score={Number(analysis.hook_analysis.overall_score)} size={84} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] uppercase tracking-widest text-gray-500">Overall score</span>
                      {(analysis.hook_analysis?.hook_type || analysis.hook_analysis?.video_format) && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {analysis.hook_analysis?.hook_type && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.25)' }}>
                              {analysis.hook_analysis.hook_type}
                            </span>
                          )}
                          {analysis.hook_analysis?.video_format && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent-soft)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                              {analysis.hook_analysis.video_format}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {analysis.hook_analysis?.score_breakdown && (
                      <ScoreBreakdown items={[
                        { label: 'Hook', value: analysis.hook_analysis.score_breakdown.hook, max: 30 },
                        { label: 'Retention', value: analysis.hook_analysis.score_breakdown.retention, max: 25 },
                        { label: 'Payoff', value: analysis.hook_analysis.score_breakdown.payoff, max: 25 },
                        { label: 'Delivery', value: analysis.hook_analysis.score_breakdown.delivery, max: 20 },
                      ]} />
                    )}
                  </div>
                </div>
                {/* Assessment text below */}
                <div className="mt-5 pt-5 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {toParagraphs(analysis.hook_analysis?.overall_assessment).map((p, i) => (
                    <p key={i} className="text-[15px] text-gray-300 leading-relaxed">{p}</p>
                  ))}
                </div>
              </div>

              {(analysis as any).strong_spots && (analysis as any).strong_spots.length > 0 && (
                <div className="rounded-2xl p-5 sm:p-6" style={card}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">What works</p>
                  <ul className="space-y-3">
                    {(analysis as any).strong_spots.map((spot: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                        <ThumbsUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        {spot}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.weak_spots && analysis.weak_spots.length > 0 && (
                <div className="rounded-2xl p-5 sm:p-6" style={card}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">What's holding it back</p>
                  <ul className="space-y-3">
                    {analysis.weak_spots.map((spot, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                        <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                        {spot}
                      </li>
                    ))}
                  </ul>
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
    </div>,
    document.body
  );
}
