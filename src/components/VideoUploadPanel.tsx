import { useState, useRef, useEffect } from 'react';
import { X, Upload, Sparkles, Loader2, Film, AlertCircle } from 'lucide-react';

interface VideoUploadPanelProps {
  open: boolean;
  onClose: () => void;
  onAnalyze: (file: File, videoContext: string) => void;
  analyzing: boolean;
  isPro: boolean;
  uploadStep?: 'uploading' | 'analyzing' | null;
}

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const MAX_SIZE_MB = 200;

export function VideoUploadPanel({ open, onClose, onAnalyze, analyzing, isPro, uploadStep }: VideoUploadPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [videoContext, setVideoContext] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Reset when panel closes
  useEffect(() => {
    if (!open) {
      setFile(null);
      setVideoContext('');
      setFileError('');
    }
  }, [open]);

  const validateFile = (f: File): string => {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|webm|avi)$/i)) {
      return 'Unsupported format. Use MP4, MOV, WebM, or AVI.';
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File too large. Maximum size is ${MAX_SIZE_MB}MB.`;
    }
    return '';
  };

  const handleFileSelect = (f: File) => {
    const err = validateFile(f);
    if (err) { setFileError(err); setFile(null); return; }
    setFileError('');
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleAnalyze = () => {
    if (!file) return;
    onAnalyze(file, videoContext);
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[520px] z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(10,15,26,0.92)', borderLeft: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Analyze Video File</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Pro
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isPro ? (
          /* Not PRO — upgrade prompt */
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <Upload className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg mb-2">Pro Feature</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Upload your unpublished video file and get feedback before you post. Available on the Pro plan.
              </p>
            </div>
            <div className="w-full rounded-xl p-4 text-left space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">What you get</p>
              {['Full hook & retention analysis before publishing', 'Specific weak spots to fix', 'New hook rewrites tailored to your style'].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-emerald-400 text-xs mt-0.5">✓</span>
                  <span className="text-gray-300 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* PRO — upload UI */
          <div className="flex-1 overflow-y-auto flex flex-col p-5 gap-5">
            {/* Drop zone */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
              />

              {!file ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className="rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center gap-3 py-10 px-6 text-center"
                  style={{
                    border: `2px dashed ${dragOver ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.12)'}`,
                    background: dragOver ? 'rgba(52,211,153,0.05)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                    <Film className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Drop your video here</p>
                    <p className="text-gray-500 text-xs mt-1">or click to browse</p>
                  </div>
                  <p className="text-gray-600 text-xs">MP4, MOV, WebM, AVI — up to {MAX_SIZE_MB}MB</p>
                </div>
              ) : (
                <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <Film className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{file.name}</p>
                    <p className="text-gray-500 text-xs">{formatSize(file.size)}</p>
                  </div>
                  <button
                    onClick={() => { setFile(null); setFileError(''); }}
                    className="p-1 text-gray-500 hover:text-white rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {fileError && (
                <div className="mt-2 flex items-center gap-2 text-red-400 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {fileError}
                </div>
              )}
            </div>

            {/* Context */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Video Context <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Tell us what this video is about, who it's for, what you were trying to achieve.
              </p>
              <textarea
                value={videoContext}
                onChange={e => setVideoContext(e.target.value)}
                placeholder="e.g. 'Fortnite clutch moment, targeting competitive players, trying to hook with the dramatic play first'"
                rows={4}
                className="w-full rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#34D399'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
            </div>

            {/* Info note */}
            <div className="rounded-lg px-4 py-3 flex items-start gap-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <AlertCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-gray-500 text-xs leading-relaxed">
                Your video is uploaded temporarily to Gemini for analysis only and deleted immediately after. It's never stored on our servers.
              </p>
            </div>

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={!file || analyzing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: analyzing || !file ? 'rgba(52,211,153,0.3)' : 'linear-gradient(135deg, #34D399, #0EA4E9)' }}
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {uploadStep === 'uploading' ? 'Uploading...' : uploadStep === 'analyzing' ? 'Analyzing...' : analyzing ? 'Processing...' : 'Analyze Video'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
