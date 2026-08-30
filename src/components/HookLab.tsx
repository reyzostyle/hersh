import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSessionToken, fetchWithRetry } from '../lib/supabase';
import { Sparkles, Loader2, Copy, Check, AlertTriangle, Wand2, X } from 'lucide-react';
import { ScoreCircle, ScoreBreakdown } from './ScoreCircle';
import { AnalysisProgressModal } from './AnalysisProgressModal';
import { SheetGrip, useSheetDismiss } from './SheetGrip';

// No backdrop-filter: blur over the static app background caused Chromium
// ghost bands on sibling repaints; the blue underlay replaces its tint.
const glass: React.CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025) 45%, rgba(255,255,255,0.035)), linear-gradient(180deg, rgba(var(--glass-tint-rgb),0.05), rgba(var(--glass-tint-rgb),0.03))',
  border: '1px solid rgba(255,255,255,0.1)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.11), 0 10px 34px -14px rgba(0,0,0,0.6)',
};

interface Rewrite { hook: string; why: string; }
interface HookBreakdown { scrollstop: number; curiosity: number; clarity: number; specificity: number; }
interface HookResult { score: number; score_breakdown?: HookBreakdown; verdict: string; issues: string[]; rewrites: Rewrite[]; }

function RewriteCard({ r, index }: { r: Rewrite; index: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group rounded-xl p-4 transition-colors" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 text-xs font-semibold text-gray-600 mt-0.5 w-4">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-relaxed text-gray-100">{r.hook}</p>
          <p className="text-xs text-gray-500 leading-relaxed mt-1.5">{r.why}</p>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(r.hook); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex-shrink-0 p-1.5 text-gray-500 hover:text-white rounded-md transition-colors"
          title="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function HookLab() {
  const [hook, setHook] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HookResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [progressDone, setProgressDone] = useState(false);
  const { panelRef, dismiss } = useSheetDismiss(() => setResultOpen(false));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    if (resultOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [resultOpen, dismiss]);

  const analyze = async () => {
    if (!hook.trim() || loading) return;
    setLoading(true);
    setProgressDone(false);
    setError('');
    setResult(null);
    setResultOpen(false);
    try {
      const token = await getSessionToken();
      if (!token) { setError('Please sign in again.'); setLoading(false); return; }
      const res = await fetchWithRetry('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/analyze-hook-text', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook: hook.trim(), context: context.trim() || undefined }),
        signal: AbortSignal.timeout(45000),
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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
      <div className="hidden lg:block mb-7">
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">Hook Lab</h1>
        <p className="text-sm text-gray-500 text-balance">Paste a hook, get a score and fresh angles to make it land.</p>
      </div>

      {/* Input */}
      <div className="rounded-2xl p-1.5" style={glass}>
        <textarea
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Paste your hook"
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
            <span className="text-xs text-gray-600">{hook.length}/600</span>
          </div>
          <button
            onClick={analyze}
            disabled={loading || !hook.trim()}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {loading ? 'Analyzing' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(var(--danger-rgb),0.1)', border: '1px solid rgba(var(--danger-rgb),0.25)' }}>
          {error}
        </div>
      )}

      {/* Reopen result after closing the modal */}
      {result && !resultOpen && (
        <button
          onClick={() => setResultOpen(true)}
          className="mt-4 flex items-center gap-2 text-sm text-[var(--accent)] hover:opacity-80 transition-opacity"
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
              background: 'rgba(var(--surface-rgb),0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              willChange: 'transform',
            }}
          >
            <SheetGrip onClose={() => setResultOpen(false)} panelRef={panelRef} />
            {/* Icon-only header — a title next to the grip's centered pill
                collided with it on mobile, see AnalysisPanel for the same fix. */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-1 sm:py-2 flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[var(--accent)] ml-1" />
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
                  <ScoreCircle score={result.score} size={84} />
                  <p className="text-[15px] text-gray-200 leading-relaxed">{result.verdict}</p>
                </div>
                {result.score_breakdown && (
                  <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <ScoreBreakdown items={[
                      { label: 'Scroll-stop', value: result.score_breakdown.scrollstop, max: 30 },
                      { label: 'Curiosity', value: result.score_breakdown.curiosity, max: 30 },
                      { label: 'Clarity', value: result.score_breakdown.clarity, max: 20 },
                      { label: 'Specificity', value: result.score_breakdown.specificity, max: 20 },
                    ]} />
                  </div>
                )}
              </div>

              {result.issues?.length > 0 && (
                <div className="rounded-2xl p-5 sm:p-6" style={glass}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">What's holding it back</p>
                  <ul className="space-y-3">
                    {result.issues.map((it, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.rewrites?.length > 0 && (
                <div className="rounded-2xl p-5 sm:p-6" style={glass}>
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Directions to explore</p>
                    <p className="text-xs text-gray-600 mt-1">Angles to adapt in your own voice, not final copy.</p>
                  </div>
                  <div className="space-y-2.5">
                    {result.rewrites.map((r, i) => <RewriteCard key={i} r={r} index={i} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <AnalysisProgressModal open={loading} mode="hook" done={progressDone} />
    </div>
  );
}
