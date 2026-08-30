import { useState, useRef, useEffect, useCallback } from 'react';
import { DownloadOutlineIcon as Download, CopyOutlineIcon as Copy, UploadOutlineIcon as Upload, CloseCircleOutlineIcon as X } from '@solar-icons/react';
import { Check } from './BrandIcons';
import {
  renderComment, downloadCanvas, TWITCH_COLORS,
  WIDTH_MIN, WIDTH_MAX, WIDTH_DEFAULT,
  type Platform, type CommentSpec, type TwitchBadge,
} from '../lib/commentImage';

const glassCard: React.CSSProperties = {
  background:
    'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0.04)), linear-gradient(180deg, rgba(var(--glass-tint-rgb),0.05), rgba(var(--glass-tint-rgb),0.03))',
  border: '1px solid rgba(255,255,255,0.08)',
};

const field: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram', label: 'Instagram' },
];

const BADGES: { id: TwitchBadge; label: string }[] = [
  { id: 'broadcaster', label: 'Broadcaster' },
  { id: 'moderator', label: 'Mod' },
  { id: 'vip', label: 'VIP' },
  { id: 'subscriber', label: 'Sub' },
  { id: 'verified', label: 'Verified' },
];

export function CommentGenerator() {
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const [username, setUsername] = useState('');
  const [text, setText] = useState('');
  const [verified, setVerified] = useState(false);
  const [likes, setLikes] = useState('1.2K');
  const [time, setTime] = useState('');
  const [dark, setDark] = useState(false);
  const [usernameColor, setUsernameColor] = useState(TWITCH_COLORS[13]);
  const [badges, setBadges] = useState<TwitchBadge[]>(['subscriber']);
  const [replySticker, setReplySticker] = useState(false);
  const [width, setWidth] = useState(WIDTH_DEFAULT);
  const [rounded, setRounded] = useState(true);
  const [avatar, setAvatar] = useState<HTMLImageElement | null>(null);
  const [avatarName, setAvatarName] = useState('');
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const spec: CommentSpec = {
    platform, username, text, verified, avatar, likes, time,
    dark, usernameColor, badges, replySticker, width, rounded,
  };

  const draw = useCallback(() => {
    if (canvasRef.current) renderComment(canvasRef.current, spec);
  }, [platform, username, text, verified, avatar, likes, time, dark, usernameColor, badges, replySticker, width, rounded]);

  useEffect(() => { draw(); }, [draw]);

  const onAvatar = (file?: File) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => { setAvatar(img); setAvatarName(file.name); };
    img.src = URL.createObjectURL(file);
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async blob => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard images aren't allowed everywhere; the download always works.
      }
    }, 'image/png');
  };

  const isTwitch = platform === 'twitch';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-12 animate-fade-in-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Comment Generator</h1>
        <p className="text-sm text-gray-500 text-balance">
          Build a comment for your video, download the PNG, drop it over your footage. Free, no credits.
        </p>
      </div>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              platform === p.id ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
            style={platform === p.id ? { background: 'var(--accent)', color: 'var(--on-accent)' } : field}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ── Controls ───────────────────────────────────────────────── */}
        <div className="rounded-xl p-5 space-y-4" style={glassCard}>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">
              {isTwitch ? 'Chatter name' : 'Username'}
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={isTwitch ? 'xqcow' : 'yourname'}
              maxLength={30}
              className="w-full px-4 py-2.5 rounded-lg text-sm text-gray-200 placeholder:text-gray-600 outline-none"
              style={field}
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">
              {isTwitch ? 'Message' : 'Comment'}
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type it here..."
              rows={3}
              maxLength={300}
              className="w-full px-4 py-2.5 rounded-lg text-sm text-gray-200 placeholder:text-gray-600 outline-none resize-none"
              style={field}
            />
            <p className="mt-1 text-[11px] text-gray-600">{text.length}/300</p>
          </div>

          {isTwitch && (
            <>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Name colour</label>
                <div className="flex flex-wrap gap-2">
                  {TWITCH_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setUsernameColor(c)}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{ background: c, outline: usernameColor === c ? '2px solid #fff' : 'none', outlineOffset: '2px' }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Badges</label>
                <div className="flex flex-wrap gap-2">
                  {BADGES.map(b => {
                    const on = badges.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => setBadges(on ? badges.filter(x => x !== b.id) : [...badges, b.id])}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${on ? 'text-white' : 'text-gray-400'}`}
                        style={on ? { background: 'var(--accent)', color: 'var(--on-accent)' } : field}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {!isTwitch && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Likes</label>
                <input value={likes} onChange={e => setLikes(e.target.value)} placeholder="1.2K"
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-gray-200 placeholder:text-gray-600 outline-none" style={field} />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Time</label>
                <input value={time} onChange={e => setTime(e.target.value)} placeholder="2h"
                  className="w-full px-4 py-2.5 rounded-lg text-sm text-gray-200 placeholder:text-gray-600 outline-none" style={field} />
              </div>
            </div>
          )}

          {!isTwitch && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 mb-1.5">Avatar</label>
              <div className="flex items-center gap-2">
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-gray-300 hover:text-white transition-colors" style={field}>
                  <Upload className="w-3.5 h-3.5" />
                  {avatar ? 'Change' : 'Upload'}
                </button>
                {avatar && (
                  <button onClick={() => { setAvatar(null); setAvatarName(''); }}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    <X className="w-3.5 h-3.5" /> {avatarName.slice(0, 20)}
                  </button>
                )}
                {!avatar && <span className="text-xs text-gray-600">or we draw one from the name</span>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => onAvatar(e.target.files?.[0])} />
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Width</label>
              <span className="text-[11px] text-gray-600">{width}px · narrower = bigger text in your video</span>
            </div>
            <input
              type="range"
              min={WIDTH_MIN}
              max={WIDTH_MAX}
              step={10}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {!isTwitch && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} className="accent-[var(--accent)]" />
                <span className="text-xs text-gray-400">Verified badge</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={replySticker} onChange={e => setReplySticker(e.target.checked)} className="accent-[var(--accent)]" />
              <span className="text-xs text-gray-400">"Replying to" sticker</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} className="accent-[var(--accent)]" />
              <span className="text-xs text-gray-400">Dark mode</span>
            </label>
            {!replySticker && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rounded} onChange={e => setRounded(e.target.checked)} className="accent-[var(--accent)]" />
                <span className="text-xs text-gray-400">Rounded corners</span>
              </label>
            )}
          </div>
        </div>

        {/* ── Preview ────────────────────────────────────────────────── */}
        <div className="rounded-xl p-5 flex flex-col" style={glassCard}>
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-3">Preview</h2>

          {/* Checkerboard, so a transparent export reads as transparent. */}
          <div
            className="flex-1 flex items-center justify-center rounded-lg p-4 overflow-auto min-h-[180px]"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              backgroundColor: '#222',
            }}
          >
            <canvas ref={canvasRef} className="max-w-full h-auto" style={{ maxWidth: '100%' }} />
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => canvasRef.current && downloadCanvas(canvasRef.current, `${platform}-comment.png`)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
              style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              <Download className="w-4 h-4" /> Download PNG
            </button>
            <button
              onClick={copyImage}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-300 rounded-lg hover:text-white transition-colors"
              style={field}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-600 text-center">Exported at 3x, ready to scale over footage.</p>
        </div>
      </div>
    </div>
  );
}

export default CommentGenerator;
