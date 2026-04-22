import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, getSessionToken, Video, Analysis } from '../lib/supabase';
import { Sparkles, Loader2, History, Film, Link, Lock } from 'lucide-react';
import { AnalysisPanel } from './AnalysisPanel';
import { HistoryPanel } from './HistoryPanel';
import { VideoScriptPanel } from './VideoScriptPanel';
import { VideoUploadPanel } from './VideoUploadPanel';

export function HookAnalysis() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [error, setError] = useState('');
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [scriptPanelVideo, setScriptPanelVideo] = useState<Video | null>(null);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  const [geminiAnalyzing, setGeminiAnalyzing] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);
  const [uploadStep, setUploadStep] = useState<'uploading' | 'analyzing' | null>(null);
  const [userPlan, setUserPlan] = useState<string>('free');
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileDropRef = useRef<HTMLDivElement>(null);

  const isPro = true; // file upload available on all plans

  useEffect(() => {
    loadVideos();
    loadAllAnalyses();
    loadUserPlan();
  }, [user?.id]);

  const loadUserPlan = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('user_tokens')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle();
    setUserPlan(data?.plan || 'free');
  };

  const loadVideos = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false });
    setVideos(data || []);
  };

  const loadAllAnalyses = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setAnalyses(data);
      setAnalysis(data[0]);
    }
  };

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /[?&]v=([^&]+)/,
      /shorts\/([^?&/\n]+)/,
      /youtu\.be\/([^?&/\n]+)/,
    ];
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const handleUrlSubmit = () => {
    setUrlError('');
    const videoId = extractVideoId(urlInput);
    if (!videoId) { setUrlError('Invalid YouTube URL or video ID'); return; }
    const ownVideo = videos.find(v => v.video_id === videoId);
    if (ownVideo) {
      setScriptPanelVideo(ownVideo);
    } else {
      setScriptPanelVideo({
        video_id: videoId,
        title: urlInput.trim(),
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        views: 0, likes_count: 0, comment_count: 0, duration: 0, is_external: true,
      } as any);
    }
    setScriptPanelOpen(true);
    setUrlInput('');
  };

  const runGeminiAnalysis = async (videoId: string, videoContext: string = '') => {
    setGeminiAnalyzing(true);
    setError('');
    try {
      const token = await getSessionToken();
      if (!token) { setError('Not authenticated'); setGeminiAnalyzing(false); return; }
      const res = await fetch(
        `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/analyze-with-gemini`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, videoContext }),
        }
      );
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const d = await res.json(); errMsg = d.error || d.message || JSON.stringify(d) || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const result = await res.json();
      if (result.analysis) {
        setAnalysis(result.analysis);
        setAnalyses(prev => [result.analysis, ...prev]);
      }
      setAnalysisPanelOpen(true);
      setScriptPanelOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setGeminiAnalyzing(false);
    }
  };

  const handleGeminiFromPanel = (videoId: string, videoContext: string) => {
    setScriptPanelOpen(false);
    runGeminiAnalysis(videoId, videoContext);
  };

  const runUploadAnalysis = async (file: File, videoContext: string) => {
    setUploadAnalyzing(true);
    setUploadStep('uploading');
    setError('');
    try {
      if (!user?.id) throw new Error('Not authenticated');
      const token0 = await getSessionToken();
      if (!token0) throw new Error('Not authenticated');

      // Step 1: Start Gemini upload session via edge function
      const sessionRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-upload-url`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token0}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || 'video/mp4' }),
        }
      );
      if (!sessionRes.ok) {
        let msg = `Session failed: HTTP ${sessionRes.status}`;
        try { const d = await sessionRes.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      const { uploadUrl } = await sessionRes.json();
      if (!uploadUrl) throw new Error('No upload URL received');

      // Step 2: Stream file through edge function proxy → Gemini (no buffering, no size limit)
      const uploadRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-video-chunk`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token0}`,
            'Content-Type': file.type || 'video/mp4',
            'X-Upload-Url': uploadUrl,
            'X-Upload-Offset': '0',
            'X-Is-Last': 'true',
          },
          body: file,
        }
      );
      if (!uploadRes.ok) {
        let msg = `Upload failed: HTTP ${uploadRes.status}`;
        try { const d = await uploadRes.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      const uploadData = await uploadRes.json();
      const geminiFileName = uploadData.geminiFileName;
      if (!geminiFileName) throw new Error('No Gemini file name after upload');

      setUploadStep('analyzing');

      // Step 3: Analyze
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ geminiFileName, videoContext, fileName: file.name, mimeType: file.type || 'video/mp4' }),
        }
      );
      if (!res.ok) {
        let errMsg = `Analysis failed: HTTP ${res.status}`;
        try { const d = await res.json(); errMsg = d.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const result = await res.json();
      if (result.analysis) {
        setAnalysis(result.analysis);
        setAnalyses(prev => [result.analysis, ...prev]);
      }
      setUploadPanelOpen(false);
      setAnalysisPanelOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload analysis failed');
    } finally {
      setUploadAnalyzing(false);
      setUploadStep(null);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    if (!isPro) { setUploadPanelOpen(true); return; }
    const f = e.dataTransfer.files[0];
    if (f) setUploadPanelOpen(true);
  };

  const analyzing = geminiAnalyzing || uploadAnalyzing;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Shorts Analysis</h1>
            <p className="text-sm text-gray-500">Paste a YouTube URL or upload your video file</p>
          </div>
          {analyses.length > 0 && (
            <button
              onClick={() => setHistoryPanelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-white hover:opacity-90 rounded-lg text-sm font-medium transition-opacity flex-shrink-0"
              style={{ background: 'rgba(14,164,233,0.2)', border: '1px solid rgba(14,164,233,0.3)' }}
            >
              <History className="w-3.5 h-3.5 text-[#0EA4E9]" />
              <span className="text-[#0EA4E9]">History</span>
            </button>
          )}
        </div>
        {error && (
          <div className="mt-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* URL Card */}
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
                <Link className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Analyze by URL</h2>
                <p className="text-gray-500 text-xs">Paste any YouTube Shorts link</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                onKeyDown={e => e.key === 'Enter' && urlInput.trim() && handleUrlSubmit()}
                placeholder="youtube.com/shorts/... or paste a video ID"
                className="flex-1 text-sm px-4 py-3 rounded-xl text-white placeholder-gray-600 focus:outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${urlError ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#8B5CF6'; }}
                onBlur={e => { e.currentTarget.style.borderColor = urlError ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'; }}
              />
              <button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim() || analyzing}
                className="flex items-center justify-center gap-2 px-5 py-3 text-white rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed sm:flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}
              >
                {geminiAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {geminiAnalyzing ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
            {urlError && <p className="mt-2 text-xs text-red-400">{urlError}</p>}
          </div>

          {/* File Upload Card */}
          <div
            ref={fileDropRef}
            onClick={() => setUploadPanelOpen(true)}
            onDragOver={e => { e.preventDefault(); setFileDragOver(true); }}
            onDragLeave={() => setFileDragOver(false)}
            onDrop={handleFileDrop}
            className="rounded-2xl p-6 cursor-pointer transition-all"
            style={{
              background: fileDragOver && isPro
                ? 'rgba(52,211,153,0.08)'
                : isPro
                  ? 'rgba(52,211,153,0.04)'
                  : 'rgba(255,255,255,0.03)',
              border: `1px solid ${fileDragOver && isPro ? 'rgba(52,211,153,0.4)' : isPro ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: isPro ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)' }}>
                <Film className={`w-4 h-4 ${isPro ? 'text-emerald-400' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className={`font-semibold text-sm ${isPro ? 'text-white' : 'text-gray-400'}`}>
                    Analyze by File
                  </h2>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    Pro
                  </span>
                </div>
                <p className={`text-xs ${isPro ? 'text-gray-500' : 'text-gray-600'}`}>
                  Upload before publishing to get feedback first
                </p>
              </div>
              {!isPro && <Lock className="w-4 h-4 text-gray-600 flex-shrink-0" />}
            </div>

            <div
              className="rounded-xl flex flex-col items-center justify-center gap-2 py-7 transition-all"
              style={{
                border: `2px dashed ${fileDragOver && isPro ? 'rgba(52,211,153,0.5)' : isPro ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}`,
                background: isPro ? 'rgba(52,211,153,0.03)' : 'rgba(255,255,255,0.02)',
              }}
            >
              {isPro ? (
                <>
                  <Film className={`w-8 h-8 ${fileDragOver ? 'text-emerald-400' : 'text-gray-600'}`} />
                  <p className="text-gray-400 text-sm font-medium">
                    {fileDragOver ? 'Drop to analyze' : 'Click or drag & drop your video'}
                  </p>
                  <p className="text-gray-600 text-xs">MP4, MOV, WebM, AVI - up to 300MB</p>
                </>
              ) : (
                <>
                  <Lock className="w-7 h-7 text-gray-700" />
                  <p className="text-gray-500 text-sm font-medium">Available on Pro plan</p>
                  <p className="text-gray-600 text-xs">Upgrade to analyze unpublished videos</p>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      <HistoryPanel
        analyses={analyses}
        open={historyPanelOpen}
        onClose={() => setHistoryPanelOpen(false)}
        onSelect={(a) => { setAnalysis(a); setAnalysisPanelOpen(true); }}
      />

      <AnalysisPanel
        analysis={analysis}
        open={analysisPanelOpen}
        onClose={() => setAnalysisPanelOpen(false)}
      />

      <VideoScriptPanel
        video={scriptPanelVideo}
        open={scriptPanelOpen}
        onClose={() => setScriptPanelOpen(false)}
        onAnalyze={handleGeminiFromPanel}
        analyzing={geminiAnalyzing}
      />

      <VideoUploadPanel
        open={uploadPanelOpen}
        onClose={() => setUploadPanelOpen(false)}
        onAnalyze={runUploadAnalysis}
        analyzing={uploadAnalyzing}
        isPro={isPro}
        uploadStep={uploadStep}
      />
    </div>
  );
}
