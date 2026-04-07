import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Trash2, Loader2, Sparkles, ExternalLink, Eye,
  ChevronDown, ChevronUp, X, TrendingUp, Lightbulb, AlertCircle, Youtube
} from 'lucide-react';

interface CompetitorChannel {
  id: string;
  channel_id: string;
  channel_url: string;
  channel_title: string;
  channel_handle: string;
  thumbnail_url: string;
  created_at: string;
}

interface CompetitorVideo {
  id: string;
  video_id: string;
  channel_id: string;
  title: string;
  views: number;
  duration: number;
  thumbnail_url: string;
}

interface HookFormula {
  formula: string;
  description: string;
  examples: string[];
  template: string;
}

interface CompetitorAnalysis {
  summary: string;
  hook_formulas: HookFormula[];
  recommendations: string[];
}

export function CompetitorsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<CompetitorChannel[]>([]);
  const [videosByChannel, setVideosByChannel] = useState<Record<string, CompetitorVideo[]>>({});
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    const { data } = await supabase
      .from('competitor_channels')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });
    if (data) {
      setChannels(data);
      for (const ch of data) {
        loadChannelVideos(ch.channel_id);
      }
    }
  };

  const loadChannelVideos = async (channelId: string) => {
    const { data } = await supabase
      .from('competitor_videos')
      .select('*')
      .eq('user_id', user?.id)
      .eq('channel_id', channelId)
      .order('views', { ascending: false });
    if (data) {
      setVideosByChannel(prev => ({ ...prev, [channelId]: data }));
    }
  };

  const addChannel = async () => {
    if (!addingUrl.trim()) return;
    setAddingLoading(true);
    setAddError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-competitor-videos`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user?.id, channelUrl: addingUrl.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add channel');
      setAddingUrl('');
      setShowAddForm(false);
      await loadChannels();
      if (data.channel) {
        setExpandedChannels(prev => new Set([...prev, data.channel.channel_id]));
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add channel');
    } finally {
      setAddingLoading(false);
    }
  };

  const deleteChannel = async (channel: CompetitorChannel) => {
    setDeletingId(channel.id);
    await supabase.from('competitor_videos').delete()
      .eq('user_id', user?.id).eq('channel_id', channel.channel_id);
    await supabase.from('competitor_channels').delete()
      .eq('id', channel.id).eq('user_id', user?.id);
    setChannels(prev => prev.filter(c => c.id !== channel.id));
    setVideosByChannel(prev => {
      const next = { ...prev };
      delete next[channel.channel_id];
      return next;
    });
    setDeletingId(null);
  };

  const runAnalysis = async () => {
    if (channels.length === 0) return;
    setAnalyzing(true);
    setAnalyzeError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-competitor-hooks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user?.id,
            channelIds: channels.map(c => c.channel_id),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze');
      setAnalysis(data.analysis);
      setAnalysisPanelOpen(true);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleChannel = (channelId: string) => {
    setExpandedChannels(prev => {
      const next = new Set(prev);
      next.has(channelId) ? next.delete(channelId) : next.add(channelId);
      return next;
    });
  };

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const fmtDuration = (s: number) => {
    if (!s) return '';
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const totalVideos = Object.values(videosByChannel).reduce((a, b) => a + b.length, 0);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Competitors</h1>
            <p className="text-sm text-gray-500">
              {channels.length > 0
                ? `${channels.length} channel${channels.length !== 1 ? 's' : ''} · ${totalVideos} Shorts tracked`
                : 'Add competitor channels to analyze their hook strategies'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {analysis && !analysisPanelOpen && (
              <button
                onClick={() => setAnalysisPanelOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-[#0EA4E9]/40 text-[#0EA4E9] rounded-lg text-sm font-medium hover:border-[#0EA4E9] transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                View Analysis
              </button>
            )}
            {channels.length > 0 && (
              <button
                onClick={runAnalysis}
                disabled={analyzing || totalVideos === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[#0EA4E9] text-white rounded-lg text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {analyzing ? 'Analyzing...' : 'Analyze Competitor Hooks'}
              </button>
            )}
            <button
              onClick={() => { setShowAddForm(true); setAddError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] border border-gray-700 text-white rounded-lg text-sm font-medium hover:border-gray-500 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Channel
            </button>
          </div>
        </div>

        {analyzeError && (
          <div className="mt-4 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {analyzeError}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {showAddForm && (
          <div className="mb-6 bg-[#1A1A1A] rounded-xl border border-gray-700 p-4">
            <p className="text-sm text-gray-400 mb-3">
              Enter a YouTube channel URL, handle, or channel ID
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={addingUrl}
                onChange={e => { setAddingUrl(e.target.value); setAddError(''); }}
                onKeyDown={e => e.key === 'Enter' && addChannel()}
                placeholder="https://youtube.com/@channelname  or  @channelname"
                autoFocus
                className="flex-1 px-4 py-2.5 bg-[#212121] border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:border-[#0EA4E9] focus:outline-none"
              />
              <button
                onClick={addChannel}
                disabled={addingLoading || !addingUrl.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0EA4E9] text-white rounded-lg text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {addingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addingLoading ? 'Fetching...' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setAddingUrl(''); setAddError(''); }}
                className="p-2.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {addError && (
              <p className="mt-2 text-sm text-red-400">{addError}</p>
            )}
          </div>
        )}

        {channels.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-4">
              <Youtube className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-white font-semibold mb-2">No competitor channels yet</h3>
            <p className="text-gray-500 text-sm mb-5 max-w-sm">
              Add channels from creators in your niche to see what hook strategies drive the most views.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0EA4E9] text-white rounded-lg text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Your First Channel
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {channels.map(channel => {
              const videos = videosByChannel[channel.channel_id] || [];
              const isExpanded = expandedChannels.has(channel.channel_id);
              const topViews = videos[0]?.views ?? 0;

              return (
                <div key={channel.id} className="bg-[#1A1A1A] rounded-xl border border-gray-800 overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => toggleChannel(channel.channel_id)}
                  >
                    {channel.thumbnail_url ? (
                      <img src={channel.thumbnail_url} alt={channel.channel_title} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <Youtube className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {channel.channel_title || channel.channel_handle || channel.channel_url}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {videos.length} Shorts
                        {topViews > 0 && <span className="ml-2">· Top: {fmt(topViews)} views</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); deleteChannel(channel); }}
                        disabled={deletingId === channel.id}
                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === channel.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-800 px-4 pb-4 pt-3">
                      {videos.length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-4">No Shorts found for this channel.</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                          {videos.map(video => (
                            <a
                              key={video.id}
                              href={`https://youtube.com/shorts/${video.video_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group block bg-[#1A1A1A] rounded-lg border border-gray-800 overflow-hidden hover:border-gray-600 transition-all"
                            >
                              <div className="relative aspect-[9/16] bg-gray-900">
                                {video.thumbnail_url ? (
                                  <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Youtube className="w-6 h-6 text-gray-700" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                  <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                </div>
                                {video.duration > 0 && (
                                  <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] text-white font-medium">
                                    {fmtDuration(video.duration)}
                                  </div>
                                )}
                              </div>
                              <div className="p-1.5">
                                <p className="text-white text-[10px] font-medium line-clamp-2 leading-tight mb-1">
                                  {video.title}
                                </p>
                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                  <Eye className="w-2.5 h-2.5" />
                                  {fmt(video.views)}
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CompetitorAnalysisPanel
        analysis={analysis}
        open={analysisPanelOpen}
        onClose={() => setAnalysisPanelOpen(false)}
      />
    </div>
  );
}

function CompetitorAnalysisPanel({
  analysis,
  open,
  onClose,
}: {
  analysis: CompetitorAnalysis | null;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-[#1A1A1A] border-l border-gray-800 z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#0EA4E9]" />
            <h2 className="text-base font-bold text-white">Competitor Hook Analysis</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {!analysis ? (
            <p className="text-gray-500 text-sm">No analysis yet.</p>
          ) : (
            <>
              <div>
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2 text-xs uppercase tracking-wide">
                  <TrendingUp className="w-3.5 h-3.5 text-[#0EA4E9]" />
                  Overview
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed">{analysis.summary}</p>
              </div>

              {analysis.hook_formulas?.length > 0 && (
                <div>
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-xs uppercase tracking-wide">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                    Hook Formulas
                  </h3>
                  <div className="space-y-3">
                    {analysis.hook_formulas.map((f, i) => (
                      <div key={i} className="bg-[#1A1A1A] rounded-lg border border-gray-800 p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-5 h-5 rounded-full bg-[#0EA4E9]/20 flex items-center justify-center text-[#0EA4E9] font-bold text-xs flex-shrink-0">{i + 1}</span>
                          <p className="text-white font-semibold text-sm">{f.formula}</p>
                        </div>
                        <p className="text-gray-400 text-xs leading-relaxed mb-2">{f.description}</p>
                        {f.template && (
                          <div className="bg-[#0EA4E9]/[0.08] border border-[#0EA4E9]/20 rounded-md px-3 py-2 mb-2">
                            <p className="text-xs text-gray-500 mb-0.5 uppercase tracking-wide font-medium">Template</p>
                            <p className="text-[#0EA4E9] text-xs font-medium">{f.template}</p>
                          </div>
                        )}
                        {f.examples?.length > 0 && (
                          <div className="space-y-1">
                            {f.examples.slice(0, 2).map((ex, j) => (
                              <p key={j} className="text-gray-600 text-xs italic truncate">"{ex}"</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.recommendations?.length > 0 && (
                <div>
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-xs uppercase tracking-wide">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                    Recommendations
                  </h3>
                  <div className="space-y-2">
                    {analysis.recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-2.5 bg-orange-950/20 border border-orange-900/30 rounded-lg p-3">
                        <span className="text-orange-400 font-bold text-xs mt-0.5 flex-shrink-0">{i + 1}</span>
                        <p className="text-gray-300 text-sm leading-snug">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
