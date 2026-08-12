import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Sparkles, Loader2, FileText, AlertCircle, ThumbsUp, X } from 'lucide-react';
import { ScoreCircle, ScoreBreakdown } from './ScoreCircle';
import { AnalysisProgressModal } from './AnalysisProgressModal';
import { ErrorNotice } from './ErrorNotice';
import { SheetGrip, useSheetDismiss } from './SheetGrip';

// No backdrop-filter: blur over the static app background caused Chromium
// ghost bands on sibling repaints; the blue underlay replaces its tint.
const glass: React.CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025) 45%, rgba(255,255,255,0.035)), linear-gradient(180deg, rgba(14,80,133,0.05), rgba(14,80,133,0.03))',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.11), 0 10px 34px -14px rgba(0,0,0,0.6)',
};

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' };

interface ScriptBreakdown { hook: number; retention: number; payoff: number; delivery: number; }
interface ScriptResult {
  overall_score: number;
  score_breakdown?: ScriptBreakdown;
  hook_type?: string;
  video_format?: string;
  overall_assessment: string;
  strong_spots: string[];
  weak_spots: string[];
}

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

const MAX_SCRIPT_CHARS = 5000;

export function ScriptLab() {
  const [script, setScript] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [progressDone, setProgressDone] = useState(false);
  const { panelRef, dismiss } = useSheetDismiss(() => setResultOpen(false));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    if (resultOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [resultOpen, dismiss]);

  const analyze = async () => {
    if (!script.trim() || loading) return;
    setLoading(true);
    setProgressDone(false);
    setError('');
    setResult(null);
    setResultOpen(false);
    try {
      const token = await getSessionToken();
      if (!token) { setError('Please sign in again.'); setLoading(false); return; }
      const res = await fetchWithRetry('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/analyze-script-text', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: script.trim(), context: context.trim() || undefined }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed');
        setLoading(false);
        return;
      }
      setResult(data);
      setProgressDone(true);
      // Brief "Done!" flash before swapping to the result window.
      setTimeout(() => { setResultOpen(true); setLoading(false); }, 500);
    } catch {
      setError('Request failed or timed out. Try again.');
      setLoading(false);
    }
  };

  const isPlanLimitError = error.includes('Upgrade for more');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
      <div className="hidden lg:block mb-7">
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Script</h1>
        <p className="text-sm text-gray-500 text-balance">Paste a script before you film it, get a full breakdown and what to fix.</p>
      </div>

      {/* Input */}
      <div className="rounded-2xl p-1.5" style={glass}>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          maxLength={MAX_SCRIPT_CHARS}
          rows={8}
          placeholder="Paste your script"
          className="w-full px-4 py-3.5 bg-transparent text-white text-[15px] leading-relaxed resize-none focus:outline-none placeholder:text-gray-600"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyze(); }}
        />

        {showContext ? (
          <div className="px-1.5 pb-1.5">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-xs text-gray-500">Context <span className="text-gray-600">overrides your channel profile</span></span>
              <button onClick={() => setShowContext(false)} className="text-gray-600 hover:text-gray-300 transition-colors p-0.5" title="Hide context">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              maxLength={500}
              rows={2}
              autoFocus
              placeholder="e.g. fitness channel for busy dads, blunt tone"
              className="glass-field w-full px-4 py-3 rounded-xl text-white text-sm resize-none focus:outline-none placeholder:text-gray-600"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-2 pt-1">
          <div className="flex items-center gap-3 min-w-0">
            {!showContext && (
              <button onClick={() => setShowContext(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                <Sparkles className="w-3.5 h-3.5" /> Add context
              </button>
            )}
            <span className="text-xs text-gray-600">{script.length}/{MAX_SCRIPT_CHARS}</span>
          </div>
          <button
            onClick={analyze}
            disabled={loading || !script.trim()}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {loading ? 'Analyzing' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        isPlanLimitError ? (
          <div className="mt-4 rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
            {error}
          </div>
        ) : (
          <ErrorNotice message={error} className="mt-4" />
        )
      )}

      {/* Reopen result after closing the modal */}
      {result && !resultOpen && (
        <button
          onClick={() => setResultOpen(true)}
          className="mt-4 flex items-center gap-2 text-sm text-[#0EA4E9] hover:opacity-80 transition-opacity"
        >
          <Sparkles className="w-4 h-4" /> View analysis
        </button>
      )}

      {/* Result modal — same window style as the video AI Analysis panel.
          Portaled to <body> so it isn't trapped by a transformed ancestor
          (the page's fade-in animation would otherwise contain position:fixed). */}
      {resultOpen && result && createPortal(
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
              background: 'rgba(10,15,26,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              willChange: 'transform',
            }}
          >
            <SheetGrip onClose={() => setResultOpen(false)} panelRef={panelRef} />
            <div className="flex items-center justify-between px-5 sm:px-6 py-1 sm:py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#0EA4E9]" />
                <h2 className="text-lg font-bold text-white">Script analysis</h2>
              </div>
              <button
                onClick={dismiss}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 space-y-3" style={{ overscrollBehavior: 'contain' }}>
              <div className="rounded-2xl p-5 sm:p-6" style={glass}>
                <div className="flex items-center gap-6">
                  <ScoreCircle score={result.overall_score} size={84} />
                  <div className="flex-1 min-w-0">
                    {(result.hook_type || result.video_format) && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {result.hook_type && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.25)' }}>
                            {result.hook_type}
                          </span>
                        )}
                        {result.video_format && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(14,164,233,0.1)', color: '#38BDF8', border: '1px solid rgba(14,164,233,0.2)' }}>
                            {result.video_format}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {result.score_breakdown && (
                  <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <ScoreBreakdown items={[
                      { label: 'Hook', value: result.score_breakdown.hook, max: 30 },
                      { label: 'Retention', value: result.score_breakdown.retention, max: 25 },
                      { label: 'Payoff', value: result.score_breakdown.payoff, max: 25 },
                      { label: 'Delivery', value: result.score_breakdown.delivery, max: 20 },
                    ]} />
                  </div>
                )}
                <div className="mt-5 pt-5 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {toParagraphs(result.overall_assessment).map((p, i) => (
                    <p key={i} className="text-[15px] text-gray-300 leading-relaxed">{p}</p>
                  ))}
                </div>
              </div>

              {result.strong_spots?.length > 0 && (
                <div className="rounded-2xl p-5 sm:p-6" style={card}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">What works</p>
                  <ul className="space-y-3">
                    {result.strong_spots.map((spot, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                        <ThumbsUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        {spot}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.weak_spots?.length > 0 && (
                <div className="rounded-2xl p-5 sm:p-6" style={card}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">What's holding it back</p>
                  <ul className="space-y-3">
                    {result.weak_spots.map((spot, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                        <AlertCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                        {spot}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <AnalysisProgressModal open={loading} mode="script" done={progressDone} />
    </div>
  );
}
