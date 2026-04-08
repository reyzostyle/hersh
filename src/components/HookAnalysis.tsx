import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Video, Analysis } from '../lib/supabase';
import { RefreshCw, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { AnalysisPanel } from './AnalysisPanel';
import { VideoScriptPanel } from './VideoScriptPanel';

export function HookAnalysis() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [scriptPanelVideo, setScriptPanelVideo] = useState<Video | null>(null);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);

  useEffect(() => {
    loadVideos();
    loadLatestAnalysis();
  }, []);

  const loadVideos = async () => {
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', user?.id)
      .order('published_at', { ascending: false });
    setVideos(data || []);
  };

  const loadLatestAnalysis = async () => {
    const { data } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setAnalysis(data);
  };

  const fetchYouTubeData = async () => {
    setFetching(true);
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-youtube-data`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user?.id }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to fetch');
      }
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch YouTube data');
    } finally {
      setFetching(false);
    }
  };

  const runAnalysis = async (videoId: string, script: string, videoContext: string = '') => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-hooks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user?.id, videoIds: [videoId], script: script || '', videoContext: videoContext || '' }),
        }
      );
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to analyze');
      }
      const result = await res.json();
      if (result.analysis) setAnalysis(result.analysis);
      setAnalysisPanelOpen(true);
      setScriptPanelOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleScriptSave = async (videoId: string, script: string, videoContext: string = '') => {
    await supabase
      .from('videos')
      .update({ script: script || null, video_context: videoContext || null })
      .eq('video_id', videoId)
      .eq('user_id', user?.id);
    setVideos(prev => prev.map(v => v.video_id === videoId ? { ...v, script } : v));
    if (scriptPanelVideo?.video_id === videoId) {
      setScriptPanelVideo(prev => prev ? { ...prev, script } : prev);
    }
  };

  const connectYouTube = () => {
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = 'https://hersh.live/auth/callback';
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl';
    // Store userId so the callback can use it even if auth state hasn't loaded yet
    sessionStorage.setItem('youtube_oauth_user_id', user?.id || '');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;
    window.location.href = authUrl;
  };

  const handleSelect = (videoId: string) => {
    setSelectedVideoId(prev => prev === videoId ? null : videoId);
  };

  const handleAnalyzeClick = () => {
    if (!selectedVideoId) return;
    const video = videos.find(v => v.video_id === selectedVideoId);
    if (video) {
      setScriptPanelVideo(video);
      setScriptPanelOpen(true);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Shorts Analysis</h1>
            <p className="text-sm text-gray-500">
              Click a video to select it and analyze it
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={fetchYouTubeData}
              disabled={fetching}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            >
              {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {fetching ? 'Fetching...' : 'Sync'}
            </button>

            {analysis && !analysisPanelOpen && (
              <button
                onClick={() => setAnalysisPanelOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-[#0EA4E9] rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'rgba(14,164,233,0.08)', border: '1px solid rgba(14,164,233,0.3)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(14,164,233,0.3)'; }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Last Analysis
              </button>
            )}

            <button
              onClick={handleAnalyzeClick}
              disabled={!selectedVideoId || analyzing}
              className="flex items-center gap-2 px-4 py-2 bg-[#0EA4E9] text-white rounded-lg text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {analyzing ? 'Analyzing...' : 'Analyze'}
              {!analyzing && selectedVideoId && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-gray-400 mb-5 text-base">Connect your YouTube account to get started</p>
            <button
              onClick={connectYouTube}
              className="px-6 py-2.5 bg-[#0EA4E9] text-white rounded-xl text-sm font-semibold hover:bg-[#0EA4E9]/90 transition-colors"
            >
              Connect YouTube Account
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{videos.length} videos</p>
              {selectedVideoId && (
                <button
                  onClick={() => setSelectedVideoId(null)}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Clear selection
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {videos.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isSelected={selectedVideoId === video.video_id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <AnalysisPanel
        analysis={analysis}
        open={analysisPanelOpen}
        onClose={() => setAnalysisPanelOpen(false)}
      />

      <VideoScriptPanel
        video={scriptPanelVideo}
        open={scriptPanelOpen}
        onClose={() => setScriptPanelOpen(false)}
        onScriptSave={handleScriptSave}
        onAnalyze={runAnalysis}
        analyzing={analyzing}
      />
    </div>
  );
}
