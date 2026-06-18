import { useState, useEffect, useCallback } from 'react';
import { supabase, getSessionToken } from '../lib/supabase';
import {
  Plus, Loader2, Sparkles, Eye, ChevronDown, ChevronUp,
  X, Lightbulb, Users, RefreshCw, Calendar, FileText, Heart, EyeOff, Lock
} from 'lucide-react';
import { SaveToNotionButton } from './SaveToNotionButton';

function outlineToText(o: { hook: string; sections: { title: string; content: string; duration: string }[]; cta: string }): string {
  const parts = [`Hook: "${o.hook}"`, ''];
  for (const s of o.sections) parts.push(`${s.title} (${s.duration})`, s.content, '');
  parts.push(`CTA: "${o.cta}"`);
  return parts.join('\n');
}

const SUPABASE_FUNCTIONS_URL = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

interface CompetitorChannel {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_thumbnail: string | null;
  created_at: string;
}

interface OutlineSection {
  title: string;
  content: string;
  duration: string;
}

interface Outline {
  hook: string;
  sections: OutlineSection[];
  cta: string;
}

interface CompetitorIdea {
  id: string;
  channel_id: string;
  channel_name: string | null;
  video_id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  video_views: number | null;
  video_published_at: string | null;
  concept: string | null;
  adapted_idea: string | null;
  outline: Outline | null;
  script: string | null;
  liked: boolean | null;
  created_at: string;
}

function formatViews(n: number | null): string {
  if (n === null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 14) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function callFunction(endpoint: string, token: string, body?: object): Promise<Response> {
  return fetch(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
}

function IdeaCard({ idea, onUpdated, isPro }: { idea: CompetitorIdea; onUpdated: (updated: CompetitorIdea) => void; isPro: boolean }) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [error, setError] = useState('');

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
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('generate-outline', token, { ideaId: idea.id });
      const data = await res.json();
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
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('generate-competitor-script', token, { ideaId: idea.id });
      const data = await res.json();
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
      className="rounded-2xl p-5 space-y-4 transition-opacity"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: idea.liked === false ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.08)',
        opacity: idea.liked === false ? 0.4 : 1,
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
        <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">What they did</p>
          <p className="text-gray-300 text-sm leading-relaxed">{idea.concept}</p>
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
              <div className="pt-1">
                <SaveToNotionButton
                  type="Outline"
                  name={(idea.adapted_idea || idea.concept || idea.video_title || 'Competitor idea').slice(0, 100)}
                  content={outlineToText(idea.outline)}
                />
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
              <SaveToNotionButton
                type="Script"
                name={(idea.adapted_idea || idea.concept || idea.video_title || 'Competitor idea').slice(0, 100)}
                content={idea.script || ''}
              />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
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
              Write Script — Pro only
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

type IdeaFilter = 'all' | 'saved' | 'dismissed';

export function CompetitorsPage() {
  const [channels, setChannels] = useState<CompetitorChannel[]>([]);
  const [ideas, setIdeas] = useState<CompetitorIdea[]>([]);
  const [channelUrl, setChannelUrl] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [fetchingIdeas, setFetchingIdeas] = useState(false);
  const [addError, setAddError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('all');
  const [userPlan, setUserPlan] = useState<string>('free');

  const loadData = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const userId = payload.sub;

      const [{ data: planData }, { data: channelData }, { data: ideaData }] = await Promise.all([
        supabase.from('user_tokens').select('plan').eq('user_id', userId).maybeSingle(),
        supabase.from('competitor_channels').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('competitor_ideas').select('*').eq('user_id', userId).order('video_published_at', { ascending: false }),
      ]);

      setUserPlan(planData?.plan || 'free');

      // Map DB column names to expected field names
      const mappedChannels = (channelData || []).map((c: any) => ({
        ...c,
        channel_name: c.channel_name ?? c.channel_title ?? null,
        channel_thumbnail: c.channel_thumbnail ?? c.thumbnail_url ?? null,
      }));
      setChannels(mappedChannels);
      setIdeas(ideaData || []);
    } catch (e) {
      console.error('[CompetitorsPage] loadData error:', e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelUrl.trim()) return;
    setAddingChannel(true);
    setAddError('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('add-competitor-channel', token, { channelUrl: channelUrl.trim() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add channel');
      setChannelUrl('');
      await loadData();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setAddingChannel(false);
    }
  };

  const handleRemoveChannel = async (channel: CompetitorChannel) => {
    setRemovingId(channel.id);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const userId = payload.sub;
      await supabase.from('competitor_channels').delete().eq('id', channel.id).eq('user_id', userId);
      setChannels(prev => prev.filter(c => c.id !== channel.id));
    } catch (e) {
      console.error('[CompetitorsPage] remove channel error:', e);
    } finally {
      setRemovingId(null);
    }
  };

  const handleFetchIdeas = async () => {
    setFetchingIdeas(true);
    setFetchError('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('fetch-competitor-ideas', token);
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to fetch ideas');
      setIdeas(data.ideas || []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFetchingIdeas(false);
    }
  };

  const handleIdeaUpdated = (updated: CompetitorIdea) => {
    setIdeas(prev => prev.map(idea => idea.id === updated.id ? updated : idea));
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[#0EA4E9] animate-spin" />
      </div>
    );
  }

  if (userPlan === 'free') {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-4 sm:pt-6 pb-8 space-y-5 sm:space-y-8 animate-fade-in-up">
        <div className="hidden sm:block">
          <h1 className="text-2xl font-bold text-white mb-1">Competitors</h1>
          <p className="text-sm text-gray-500">Track competitor channels and generate content ideas</p>
        </div>
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center space-y-4"
          style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.2)' }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(14,164,233,0.12)' }}>
            <Users className="w-6 h-6 text-[#0EA4E9]" />
          </div>
          <div className="space-y-1.5">
            <p className="text-white font-semibold text-base">Competitors is a Plus feature</p>
            <p className="text-gray-400 text-sm max-w-sm">Track up to 5 competitor channels, get AI-extracted ideas and outlines tailored to your niche.</p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }))}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: '#0EA4E9' }}
          >
            Upgrade to Plus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 sm:pt-6 pb-8 space-y-5 sm:space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="hidden sm:block">
        <h1 className="text-2xl font-bold text-white mb-1">Competitors</h1>
        <p className="text-sm text-gray-500">Track competitor channels and generate content ideas</p>
      </div>

      {/* Add channel */}
      <div
        className="rounded-2xl p-4 sm:p-5 space-y-3 sm:space-y-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="space-y-1">
          <p className="text-white text-sm font-semibold">Add competitor channel</p>
          <p className="text-gray-500 text-xs">Paste a YouTube channel URL. Up to 5 channels.</p>
        </div>

        <form onSubmit={handleAddChannel} className="flex gap-2">
          <input
            type="text"
            value={channelUrl}
            onChange={e => setChannelUrl(e.target.value)}
            placeholder="youtube.com/@channelname"
            disabled={addingChannel || channels.length >= 5}
            className="flex-1 px-3 py-2.5 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; }}
          />
          <button
            type="submit"
            disabled={addingChannel || !channelUrl.trim() || channels.length >= 5}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#0EA4E9' }}
          >
            {addingChannel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </form>

        {addError && (
          <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{addError}</p>
        )}

        {/* Channel pills */}
        {channels.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {channels.map(channel => (
              <div
                key={channel.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                {channel.channel_thumbnail && (
                  <img
                    src={channel.channel_thumbnail}
                    alt={channel.channel_name || ''}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                )}
                <span className="text-gray-200 text-xs font-medium">{channel.channel_name || channel.channel_id}</span>
                <button
                  onClick={() => handleRemoveChannel(channel)}
                  disabled={removingId === channel.id}
                  className="text-gray-500 hover:text-red-400 transition-colors ml-0.5"
                >
                  {removingId === channel.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Fetch ideas button */}
      {channels.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleFetchIdeas}
            disabled={fetchingIdeas}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'rgba(14,164,233,0.15)', border: '1px solid rgba(14,164,233,0.35)', color: '#38bdf8' }}
          >
            {fetchingIdeas ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {fetchingIdeas ? 'Finding new ideas...' : 'Find new ideas'}
          </button>
          {ideas.length > 0 && (
            <span className="text-gray-500 text-xs">{ideas.length} idea{ideas.length !== 1 ? 's' : ''} found</span>
          )}
        </div>
      )}

      {fetchError && (
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">{fetchError}</p>
      )}

      {/* Ideas feed */}
      {ideas.length > 0 ? (
        <div className="space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {(['all', 'saved', 'dismissed'] as IdeaFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setIdeaFilter(f)}
                className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
                style={ideaFilter === f
                  ? { background: 'rgba(255,255,255,0.1)', color: '#e5e7eb' }
                  : { color: '#6b7280' }
                }
              >
                {f === 'saved' && <Heart className="w-3 h-3 inline mr-1 -mt-0.5" fill="currentColor" />}
                {f}{f === 'saved' ? ` (${ideas.filter(i => i.liked === true).length})` : f === 'dismissed' ? ` (${ideas.filter(i => i.liked === false).length})` : ` (${ideas.length})`}
              </button>
            ))}
          </div>
          {ideas
            .filter(i => ideaFilter === 'all' || (ideaFilter === 'saved' ? i.liked === true : i.liked === false))
            .map(idea => (
              <IdeaCard key={idea.id} idea={idea} onUpdated={handleIdeaUpdated} isPro={userPlan === 'pro' || userPlan === 'agency'} />
            ))
          }
        </div>
      ) : channels.length > 0 ? (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
        >
          <Lightbulb className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm">No ideas yet. Click "Find new ideas" to check for videos from the last 14 days.</p>
        </div>
      ) : (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
        >
          <Users className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm">Add competitor channels above to start tracking their content.</p>
        </div>
      )}
    </div>
  );
}
