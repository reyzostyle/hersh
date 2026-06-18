import { useState } from 'react';
import { getSessionToken } from '../lib/supabase';
import { Sparkles, Loader2, Copy, Check, AlertTriangle, Wand2 } from 'lucide-react';

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

interface Rewrite { hook: string; why: string; }
interface HookResult { score: number; verdict: string; issues: string[]; rewrites: Rewrite[]; }

function scoreColor(score: number): string {
  if (score >= 7.5) return '#34D399';
  if (score >= 5) return '#FB923C';
  return '#F87171';
}

function RewriteCard({ r }: { r: Rewrite }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.18)' }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-relaxed" style={{ color: '#38BDF8' }}>"{r.hook}"</p>
        <button
          onClick={() => { navigator.clipboard.writeText(r.hook); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-white rounded-md"
          title="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mt-1.5">{r.why}</p>
    </div>
  );
}

export function HookLab() {
  const [hook, setHook] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HookResult | null>(null);

  const analyze = async () => {
    if (!hook.trim() || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const token = await getSessionToken();
      if (!token) { setError('Please sign in again.'); return; }
      const res = await fetch('https://ezlousklksipvwuinpzq.supabase.co/functions/v1/analyze-hook-text', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook: hook.trim() }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed');
        return;
      }
      setResult(data);
    } catch {
      setError('Request failed or timed out. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
      <div className="hidden sm:block mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Hook Lab</h1>
        <p className="text-sm text-gray-500">Paste a hook idea and get a score + 3 stronger rewrites — instantly.</p>
      </div>

      {/* Input */}
      <div className="rounded-2xl p-5" style={glass}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(14,164,233,0.12)', border: '1px solid rgba(14,164,233,0.2)' }}>
            <Sparkles className="w-4 h-4 text-[#0EA4E9]" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Your hook</p>
            <p className="text-xs text-gray-500">The first line(s) of your Short</p>
          </div>
        </div>
        <textarea
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="e.g. I tried the viral $5 morning routine for 30 days…"
          className="w-full px-4 py-3 rounded-xl text-white text-sm resize-none focus:outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyze(); }}
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-gray-600">{hook.length}/600</span>
          <button
            onClick={analyze}
            disabled={loading || !hook.trim()}
            className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{ background: '#0EA4E9' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {loading ? 'Analyzing…' : 'Analyze hook'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-4 space-y-4 animate-fade-in">
          <div className="rounded-2xl p-5 flex items-center gap-5" style={glass}>
            <div className="flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-4xl font-bold leading-none" style={{ color: scoreColor(result.score) }}>{result.score}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wide mt-1">/ 10</span>
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{result.verdict}</p>
          </div>

          {result.issues?.length > 0 && (
            <div className="rounded-2xl p-5" style={glass}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">What's holding it back</p>
              <ul className="space-y-2.5">
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
            <div className="rounded-2xl p-5" style={glass}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Stronger rewrites</p>
              <div className="space-y-2.5">
                {result.rewrites.map((r, i) => <RewriteCard key={i} r={r} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
