import { useState, useEffect, useRef, useContext } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, getSessionToken, fetchWithRetry, Video, Analysis } from '../lib/supabase';
import { Sparkles, Loader2, History, Film, X, Plus } from 'lucide-react';
import { AnalysisPanel } from './AnalysisPanel';
import { HistoryPanel } from './HistoryPanel';
import { AnalysisProgressModal } from './AnalysisProgressModal';
import { MobileHeaderContext } from './AppShell';
import { ErrorNotice } from './ErrorNotice';

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const MAX_SIZE_MB = 300;

const validateVideoFile = (f: File): string => {
  if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|webm|avi)$/i))
    return 'Unsupported format. Use MP4, MOV, WebM, or AVI.';
  if (f.size > MAX_SIZE_MB * 1024 * 1024)
    return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`;
  return '';
};

const formatSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

export function HookAnalysis() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<Video[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [error, setError] = useState('');
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  // True when the open analysis was picked from History — shows a back arrow
  // in the analysis window that returns to the list instead of closing fully.
  const [openedFromHistory, setOpenedFromHistory] = useState(false);
  const [geminiAnalyzing, setGeminiAnalyzing] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  // One context field shared by both modes: the panel only ever shows one of
  // them at a time, so separate state just meant the note silently vanished
  // when you flipped the toggle.
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [uploadAnalyzing, setUploadAnalyzing] = useState(false);
  const [uploadStep, setUploadStep] = useState<'uploading' | 'analyzing' | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressMode, setProgressMode] = useState<'url' | 'upload'>('url');
  const [progressDone, setProgressDone] = useState(false);
  const [userPlan, setUserPlan] = useState<string>('free');
  const [fileDragOver, setFileDragOver] = useState(false);
  const fileDropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setRightAction } = useContext(MobileHeaderContext);

  // Always shown (HistoryPanel has its own empty state) so the button doesn't
  // pop in later than the rest of the page once analyses finish loading.
  useEffect(() => {
    setRightAction(
      <button
        onClick={() => setHistoryPanelOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity"
        style={{ background: 'rgba(14,164,233,0.2)', border: '1px solid rgba(14,164,233,0.3)' }}
      >
        <History className="w-3.5 h-3.5 text-[#0EA4E9]" />
        <span className="text-[#0EA4E9]">History</span>
      </button>
    );
    return () => setRightAction(null);
  }, []);

  useEffect(() => {
    loadVideos();
    loadAllAnalyses();
    loadUserPlan();
  }, [user?.id]);

  // Picks up the URL handed off from the landing page's hero input (stashed
  // before the account existed) and runs it, so signing up is the last thing
  // asked of you rather than one step in the middle. The key is consumed
  // before anything can throw, so a reload never re-analyses and never
  // double-charges — that also makes StrictMode's double effect a no-op.
  useEffect(() => {
    const pending = localStorage.getItem('hershy_pending_video_url');
    if (!pending) return;
    localStorage.removeItem('hershy_pending_video_url');

    const videoId = extractVideoId(pending);
    if (!videoId) {
      // Landing already screens the link, so this is a rare fallback: leave it
      // in the field with the error rather than silently dropping it.
      setUrlInput(pending);
      setUrlError('Invalid YouTube URL or video ID');
      return;
    }
    runGeminiAnalysis(videoId, '', false);
  }, []);

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
    // Ownership + retention are resolved server-side in analyze-with-gemini.
    // For synced videos we can pass the known title to skip the oembed lookup.
    const ownVideo = videos.find(v => v.video_id === videoId);
    runGeminiAnalysis(videoId, context.trim(), false, ownVideo?.title);
    setUrlInput('');
    setContext('');
    setShowContext(false);
  };

  const runGeminiAnalysis = async (videoId: string, videoContext: string = '', isMyVideo: boolean = false, videoTitle?: string) => {
    setGeminiAnalyzing(true);
    setProgressMode('url');
    setProgressDone(false);
    setProgressOpen(true);
    setError('');
    try {
      // Fetch YouTube title if not provided (external video)
      let resolvedTitle = videoTitle;
      if (!resolvedTitle) {
        try {
          const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (oembed.ok) {
            const data = await oembed.json();
            if (data.title) resolvedTitle = data.title;
          }
        } catch {}
      }
      videoTitle = resolvedTitle;

      const token = await getSessionToken();
      if (!token) { setError('Not authenticated'); setGeminiAnalyzing(false); return; }
      const res = await fetchWithRetry(
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
      setProgressDone(true);
      setTimeout(() => {
        setProgressOpen(false);
        setProgressDone(false);
        setOpenedFromHistory(false);
        setAnalysisPanelOpen(true);
        window.dispatchEvent(new CustomEvent('hershy:analysis-done'));
      }, 600);
    } catch (err) {
      setProgressOpen(false);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setGeminiAnalyzing(false);
    }
  };

  const runUploadAnalysis = async (file: File, videoContext: string, isMyVideo: boolean = false) => {
    setUploadAnalyzing(true);
    setUploadStep('uploading');
    setProgressMode('upload');
    setProgressDone(false);
    setProgressOpen(true);
    setError('');
    try {
      if (!user?.id) throw new Error('Not authenticated');
      const token0 = await getSessionToken();
      if (!token0) throw new Error('Not authenticated');

      // Step 1: Start Gemini upload session via edge function
      const sessionRes = await fetchWithRetry(
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
      const res = await fetchWithRetry(
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
      setProgressDone(true);
      setTimeout(() => {
        setProgressOpen(false);
        setProgressDone(false);
        setUploadFile(null);
        setContext('');
        setShowContext(false);
        setOpenedFromHistory(false);
        setAnalysisPanelOpen(true);
        window.dispatchEvent(new CustomEvent('hershy:analysis-done'));
      }, 600);
    } catch (err) {
      setProgressOpen(false);
      setError(err instanceof Error ? err.message : 'Upload analysis failed');
    } finally {
      setUploadAnalyzing(false);
      setUploadStep(null);
    }
  };

  const handleFileSelect = (f: File) => {
    const err = validateVideoFile(f);
    if (err) { setFileError(err); setUploadFile(null); return; }
    setFileError('');
    setUploadFile(f);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const analyzing = geminiAnalyzing || uploadAnalyzing;

  return (
    <div className="h-full flex flex-col animate-fade-in-up">
      {/* Header — only past `lg`, where AppShell's own header (which carries the
          tab name and this same History button) stops rendering. At `sm` both
          were on screen at once, showing History twice. */}
      <div className="hidden lg:block px-6 pt-6 pb-2 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Analysis</h1>
            <p className="text-sm text-gray-500">Paste a YouTube URL or upload your video file</p>
          </div>
          <button
            onClick={() => setHistoryPanelOpen(true)}
            className="flex items-center gap-2 px-3 py-2 hover:opacity-90 rounded-lg text-sm font-medium transition-opacity flex-shrink-0"
            style={{ background: 'rgba(14,164,233,0.2)', border: '1px solid rgba(14,164,233,0.3)' }}
          >
            <History className="w-4 h-4 text-[#0EA4E9]" />
            <span className="text-[#0EA4E9]">History</span>
          </button>
        </div>
      </div>
      {error && (
        <div className="px-4 sm:px-6 flex-shrink-0">
          <ErrorNotice message={error} className="max-w-3xl mx-auto mt-3" />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 pt-4 sm:pt-3 pb-8" style={{ overscrollBehavior: 'none', WebkitOverflowScrolling: 'auto' }}>
        <div className="max-w-3xl mx-auto space-y-3">

          {/* One panel, shaped like Hook Lab's: input on top, controls in a
              footer bar. URL and upload are both offered at once rather than
              behind a mode switch, so there is nothing to choose before you can
              start. Picking a file replaces the URL field, which keeps it
              obvious which of the two is about to be analyzed. */}
          <div
            ref={fileDropRef}
            onDragOver={e => { e.preventDefault(); setFileDragOver(true); }}
            onDragLeave={() => setFileDragOver(false)}
            onDrop={handleFileDrop}
            className={`rounded-2xl p-1.5 transition-all ${fileDragOver ? 'glass-panel-accent' : 'glass-panel'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.currentTarget.value = ''; }}
            />

            {uploadFile ? (
              <div className="m-1.5 rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(14,164,233,0.08)', border: '1px solid rgba(14,164,233,0.2)' }}>
                <div className="w-10 h-10 rounded-lg bg-[#0EA4E9]/15 flex items-center justify-center flex-shrink-0">
                  <Film className="w-5 h-5 text-[#0EA4E9]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{uploadFile.name}</p>
                  <p className="text-gray-500 text-xs">{formatSize(uploadFile.size)}</p>
                </div>
                <button onClick={() => { setUploadFile(null); setFileError(''); }} disabled={uploadAnalyzing} className="p-1 text-gray-500 hover:text-white rounded transition-colors disabled:opacity-40">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-1.5">
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                  onKeyDown={e => e.key === 'Enter' && urlInput.trim() && !geminiAnalyzing && handleUrlSubmit()}
                  placeholder="Paste link"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  className="flex-1 min-w-0 px-2 py-5 sm:py-6 bg-transparent text-white text-[15px] focus:outline-none placeholder:text-gray-600"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload a video file"
                  className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            {showContext && (
              <div className="px-1.5 pt-1.5">
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="text-xs text-gray-500">Context <span className="text-gray-600">helps tailor the analysis</span></span>
                  <button onClick={() => { setShowContext(false); setContext(''); }} className="text-gray-600 hover:text-gray-300 transition-colors p-0.5" title="Hide context">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  maxLength={600}
                  rows={2}
                  autoFocus
                  placeholder={uploadFile
                    ? 'e.g. gym transformation, targeting busy dads, wanted a strong first-line hook'
                    : 'e.g. storytime about my worst client, targeting freelancers, wanted a punchy cold open'}
                  className="glass-field w-full px-4 py-3 rounded-xl text-white text-sm resize-none focus:outline-none placeholder:text-gray-600"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-2 pt-2">
              <div className="flex items-center gap-3 min-w-0">
                {!showContext && (
                  <button onClick={() => setShowContext(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    <Sparkles className="w-3.5 h-3.5" /> Add context
                  </button>
                )}
              </div>

              {/* A picked file wins over anything typed in the URL field, which
                  is why choosing one hides that field above. */}
              <button
                onClick={() => uploadFile ? runUploadAnalysis(uploadFile, context.trim(), true) : handleUrlSubmit()}
                disabled={uploadFile ? uploadAnalyzing : (!urlInput.trim() || analyzing)}
                className="btn-primary flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 active:scale-[0.98]"
              >
                {(uploadFile ? uploadAnalyzing : geminiAnalyzing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {uploadFile
                  ? (uploadStep === 'uploading' ? 'Uploading' : uploadStep === 'analyzing' ? 'Analyzing' : uploadAnalyzing ? 'Processing' : 'Analyze')
                  : (geminiAnalyzing ? 'Analyzing' : 'Analyze')}
              </button>
            </div>

            {(fileError || urlError) && (
              <p className="px-3 pb-2 text-xs text-red-400">{fileError || urlError}</p>
            )}
          </div>

        </div>
      </div>

      <HistoryPanel
        analyses={analyses}
        videos={videos}
        open={historyPanelOpen}
        onClose={() => setHistoryPanelOpen(false)}
        onSelect={(a) => { setAnalysis(a); setOpenedFromHistory(true); setAnalysisPanelOpen(true); }}
      />

      <AnalysisPanel
        analysis={analysis}
        open={analysisPanelOpen}
        onClose={() => setAnalysisPanelOpen(false)}
        onBack={openedFromHistory ? () => { setAnalysisPanelOpen(false); setHistoryPanelOpen(true); } : undefined}
      />

      <AnalysisProgressModal
        open={progressOpen}
        mode={progressMode}
        done={progressDone}
      />
    </div>
  );
}
