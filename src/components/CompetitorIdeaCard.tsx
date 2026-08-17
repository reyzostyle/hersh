import { useState } from 'react';
import {
  Loader2, Sparkles, Eye, ChevronDown, ChevronUp,
  Lightbulb, Heart, EyeOff, Lock, FileText, Calendar, TrendingUp,
} from 'lucide-react';
import { getSessionToken, fetchWithRetry, supabase } from '../lib/supabase';
import { ErrorNotice } from './ErrorNotice';

const SUPABASE_FUNCTIONS_URL = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

export interface CompetitorChannel {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_thumbnail: string | null;
  created_at: string;
}

export interface OutlineSection {
  title: string;
  content: string;
  duration: string;
}

export interface Outline {
  hook: string;
  sections: OutlineSection[];
  cta: string;
}

export interface CompetitorIdea {
  id: string;
  channel_id: string;
  channel_name: string | null;
  video_id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  video_views: number | null;
  video_published_at: string | null;
  outlier_score: number | null;
  concept: string | null;
  adapted_idea: string | null;
  outline: Outline | null;
  script: string | null;
  liked: boolean | null;
  created_at: string;
}

export function formatViews(n: number | null): string {
  if (n === null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 14) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function callFunction(endpoint: string, token: string, body?: object): Promise<Response> {
  return fetchWithRetry(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
}

export function CompetitorIdeaCard({ idea, onUpdated, isPro }: { idea: CompetitorIdea; onUpdated: (updated: CompetitorIdea) => void; isPro: boolean }) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  // What the competitor did is background; your angle is the actionable part, so
  // only the latter is open by default.
  const [conceptOpen, setConceptOpen] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [error, setError] = useState('');
  // Distinguishes "user hit their credit limit" (a plain, actionable message)
  // from an actual backend failure (routed through ErrorNotice) — both land
  // in the same `error` state, so the render needs to know which is which.
  const [errorIsPlanLimit, setErrorIsPlanLimit] = useState(false);

  const handleLike = async (value: boolean) => {
    const newValue = idea.liked === value ? null : value;
    const { data, error } = await supabase
      .from('competitor_ideas')
      .update({ liked: newValue })
      .eq('id', idea.id)
      .select()
      .single();
    if (!error && data) onUpdated({ ...idea, liked: newValue });
  };

  const handleCreateOutline = async () => {
    setGeneratingOutline(true);
    setError('');
    setErrorIsPlanLimit(false);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('generate-outline', token, { ideaId: idea.id });
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return;
      }
      if (data.error === 'limit_reached') {
        setErrorIsPlanLimit(true);
        setError("You've used all your credits for this month.");
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to generate outline');
      onUpdated(data.idea);
      setOutlineOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setGeneratingOutline(false);
    }
  };

  const handleWriteScript = async () => {
    setGeneratingScript(true);
    setError('');
    setErrorIsPlanLimit(false);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('generate-competitor-script', token, { ideaId: idea.id });
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return;
      }
      if (data.error === 'limit_reached') {
        setErrorIsPlanLimit(true);
        setError("You've used all your credits for this month.");
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to generate script');
      onUpdated(data.idea);
      setScriptOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setGeneratingScript(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4 transition-opacity glass-panel"
      style={{
        opacity: idea.liked === false ? 0.4 : 1,
        ...(idea.liked === false ? { border: '1px solid rgba(255,255,255,0.04)' } : {}),
      }}
    >
      {/* Video info row */}
      <div className="flex gap-3">
        {idea.video_thumbnail && (
          <a
            href={`https://www.youtube.com/watch?v=${idea.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
          >
            <img
              src={idea.video_thumbnail}
              alt={idea.video_title || ''}
              className="w-24 h-14 rounded-lg object-cover hover:opacity-80 transition-opacity"
            />
          </a>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {idea.video_title || 'Untitled video'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {idea.outlier_score != null && (
              <span
                className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7' }}
                title="Views per day versus this channel's usual pace"
              >
                <TrendingUp className="w-3 h-3" />
                {idea.outlier_score}x
              </span>
            )}
            <span className="text-xs text-gray-500">{idea.channel_name}</span>
            {idea.video_views !== null && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Eye className="w-3 h-3" />
                {formatViews(idea.video_views)}
              </span>
            )}
            {idea.video_published_at && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="w-3 h-3" />
                {formatDate(idea.video_published_at)}
              </span>
            )}
          </div>
        </div>
        {/* Like / Dismiss buttons */}
        <div className="flex items-start gap-1 flex-shrink-0">
          <button
            onClick={() => handleLike(true)}
            title="Save idea"
            className="p-1.5 rounded-lg transition-all"
            style={{
              background: idea.liked === true ? 'rgba(239,68,68,0.15)' : 'transparent',
              color: idea.liked === true ? '#f87171' : '#4b5563',
            }}
          >
            <Heart className="w-4 h-4" fill={idea.liked === true ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => handleLike(false)}
            title="Dismiss idea"
            className="p-1.5 rounded-lg transition-all"
            style={{
              background: idea.liked === false ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: idea.liked === false ? '#6b7280' : '#4b5563',
            }}
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* What they did */}
      {idea.concept && (
        <div>
          <button
            onClick={() => setConceptOpen(!conceptOpen)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-400 transition-colors"
          >
            What they did
            {conceptOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {conceptOpen && (
            <p className="text-gray-300 text-sm leading-relaxed mt-1.5">{idea.concept}</p>
          )}
        </div>
      )}

      {/* Your angle */}
      {idea.adapted_idea && (
        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">Your angle</p>
          </div>
          <p className="text-violet-100 text-sm leading-relaxed">{idea.adapted_idea}</p>
        </div>
      )}

      {/* Outline */}
      {idea.outline && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(52,211,153,0.2)' }}>
          <button
            onClick={() => setOutlineOpen(!outlineOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-emerald-500/5 transition-colors"
            style={{ background: 'rgba(52,211,153,0.06)' }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Outline</span>
            </div>
            {outlineOpen ? <ChevronUp className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-emerald-500" />}
          </button>
          {outlineOpen && (
            <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ background: 'rgba(52,211,153,0.03)' }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-1">Hook (first 3s)</p>
                <p className="text-emerald-100 text-sm italic">"{idea.outline.hook}"</p>
              </div>
              {idea.outline.sections.map((section, i) => (
                <div key={i} className="pl-2" style={{ borderLeft: '2px solid rgba(52,211,153,0.3)' }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-xs font-semibold text-emerald-400">{section.title}</p>
                    <span className="text-[10px] text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">{section.duration}</span>
                  </div>
                  <p className="text-gray-300 text-sm">{section.content}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-1">CTA</p>
                <p className="text-emerald-100 text-sm">"{idea.outline.cta}"</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Script */}
      {idea.script && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setScriptOpen(!scriptOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs font-semibold text-gray-300">Full Script</span>
            </div>
            {scriptOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {scriptOpen && (
            <div className="px-3 pb-3 pt-2 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <pre className="text-white text-sm whitespace-pre-wrap font-sans leading-relaxed">{idea.script}</pre>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        errorIsPlanLimit
          ? <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
          : <ErrorNotice message={error} />
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {!idea.outline && (
          <button
            onClick={handleCreateOutline}
            disabled={generatingOutline}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(52,211,153,0.12)', color: '#6ee7b7', border: '1px solid rgba(52,211,153,0.25)' }}
          >
            {generatingOutline ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generatingOutline ? 'Creating outline...' : 'Create Outline'}
          </button>
        )}
        {idea.outline && !idea.script && (
          isPro ? (
            <button
              onClick={handleWriteScript}
              disabled={generatingScript}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: 'rgba(14,164,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,164,233,0.25)' }}
            >
              {generatingScript ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {generatingScript ? 'Writing script...' : 'Write Script'}
            </button>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Lock className="w-3.5 h-3.5" />
              Write Script (Pro only)
            </button>
          )
        )}
        {idea.outline && idea.script && !scriptOpen && (
          <button
            onClick={() => setScriptOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <FileText className="w-3.5 h-3.5" />
            View script
          </button>
        )}
      </div>
    </div>
  );
}
