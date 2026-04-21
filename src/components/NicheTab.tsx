import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Save, Loader2, Check, RefreshCw, X,
  TrendingUp, Eye, ThumbsUp, Sparkles, BookmarkPlus, ChevronRight,
  Target, Zap, Film,
} from 'lucide-react';
import { supabase, getSessionToken } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const SUPABASE_URL = 'https://ezlousklksipvwuinpzq.supabase.co';

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

type TimeFilter = 7 | 14 | 30;
type VideoFilter = 'all' | 'shortlist' | 'easy';
type SortBy = 'score' | 'date' | 'views';

interface CompetitorChannel {
  id: string;
  channel_url: string;
  channel_id: string | null;
  channel_name: string | null;
}

interface NicheVideo {
  videoId: string;
  channelId: string;
  channelName: string;
  title: string;
  thumbnailUrl: string;
  views: number;
  likes: number;
  publishedAt: string;
  duration: number;
  score: number;
}

interface VideoAnalysis {
  about: string;
  hook: string;
  why_it_worked: string;
  what_to_keep: string;
}

interface ScriptVariant {
  hookVariant: string;
  script: string;
  firstFrame: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Setup Section ────────────────────────────────────────────────────────────

function SetupSection({
  channels,
  myStyle,
  onSaved,
}: {
  channels: CompetitorChannel[];
  myStyle: string;
  onSaved: (channels: CompetitorChannel[], style: string) => void;
}) {
  const { user } = useAuth();
  const [urls, setUrls] = useState<string[]>(channels.map(c => c.channel_url).concat(channels.length < 5 ? [''] : []));
  const [style, setStyle] = useState(myStyle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const filled = channels.map(c => c.channel_url);
    setUrls(filled.length < 5 ? [...filled, ''] : filled);
    setStyle(myStyle);
  }, [channels, myStyle]);

  const addUrl = () => {
    if (urls.length < 5) setUrls(prev => [...prev, '']);
  };

  const removeUrl = (i: number) => {
    setUrls(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateUrl = (i: number, val: string) => {
    setUrls(prev => { const next = [...prev]; next[i] = val; return next; });
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    setError('');

    const filled = urls.map(u => u.trim()).filter(Boolean);

    // Delete existing channels and re-insert
    await supabase.from('niche_competitor_channels').delete().eq('user_id', user.id);

    let savedChannels: CompetitorChannel[] = [];
    if (filled.length > 0) {
      const { data, error: insertErr } = await supabase
        .from('niche_competitor_channels')
        .insert(filled.map(url => ({ user_id: user.id, channel_url: url })))
        .select();
      if (insertErr) { setError('Ошибка сохранения: ' + insertErr.message); setSaving(false); return; }
      savedChannels = data || [];
    }

    // Save style
    const { data: existing } = await supabase.from('user_tokens').select('user_id').eq('user_id', user.id).maybeSingle();
    if (existing) {
      await supabase.from('user_tokens').update({ my_style: style }).eq('user_id', user.id);
    } else {
      await supabase.from('user_tokens').insert({ user_id: user.id, my_style: style, access_token: '', refresh_token: '' });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(savedChannels, style);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
          <Target className="w-4 h-4 text-[#0EA4E9]" />
          Конкуренты
        </h2>
        <p className="text-sm text-gray-500 mb-4">Добавь YouTube-каналы конкурентов (до 5). URL, @handle или ID канала.</p>

        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                onChange={e => updateUrl(i, e.target.value)}
                placeholder="https://youtube.com/@handle или @handle"
                className="flex-1 px-4 py-2.5 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none transition-colors"
                style={glassInput}
                onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              />
              {urls.length > 1 && (
                <button
                  onClick={() => removeUrl(i)}
                  className="p-2 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {urls.length < 5 && (
          <button
            onClick={addUrl}
            className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить канал
          </button>
        )}
      </div>

      <div className="rounded-xl p-5" style={glassCard}>
        <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
          <Film className="w-4 h-4 text-[#0EA4E9]" />
          Мой стиль
        </h2>
        <p className="text-sm text-gray-500 mb-3">Опиши свой канал, стиль подачи и аудиторию. Используется для персонализации сценариев.</p>
        <textarea
          value={style}
          onChange={e => setStyle(e.target.value)}
          placeholder="Например: канал о личных финансах для молодых специалистов. Стиль — прямой, без воды. Говорю от первого лица, даю конкретные шаги. Аудитория: 25-35 лет, хотят больше зарабатывать и меньше тратить."
          rows={5}
          className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none resize-none leading-relaxed transition-colors"
          style={glassInput}
          onFocus={e => { e.currentTarget.style.borderColor = '#0EA4E9'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
        style={{ background: '#0EA4E9' }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? 'Сохраняю...' : saved ? 'Сохранено!' : 'Сохранить'}
      </button>
    </div>
  );
}

// ─── Trends Block ─────────────────────────────────────────────────────────────

function TrendsBlock({ videos, timeFilter, onTimeFilterChange }: {
  videos: NicheVideo[];
  timeFilter: TimeFilter;
  onTimeFilterChange: (t: TimeFilter) => void;
}) {
  const filtered = videos.filter(v => daysAgo(v.publishedAt) <= timeFilter);

  const avgViews = filtered.length ? Math.round(filtered.reduce((s, v) => s + v.views, 0) / filtered.length) : 0;
  const avgLikes = filtered.length ? Math.round(filtered.reduce((s, v) => s + v.likes, 0) / filtered.length) : 0;
  const topByViews = [...filtered].sort((a, b) => b.views - a.views).slice(0, 3);

  // Simple top topics: pick most common meaningful words from titles
  const wordFreq: Record<string, number> = {};
  for (const v of filtered) {
    v.title.toLowerCase().split(/\s+/).forEach(w => {
      const clean = w.replace(/[^a-zа-яё0-9]/gi, '');
      if (clean.length > 4) wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    });
  }
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);

  return (
    <div className="rounded-xl p-5" style={glassCard}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#0EA4E9]" />
          Тренды
        </h2>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {([7, 14, 30] as TimeFilter[]).map(d => (
            <button
              key={d}
              onClick={() => onTimeFilterChange(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${timeFilter === d ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
              style={timeFilter === d ? { background: 'rgba(255,255,255,0.1)' } : {}}
            >
              {d}д
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">Нет видео за выбранный период.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg p-3" style={{ background: 'rgba(14,164,233,0.08)', border: '1px solid rgba(14,164,233,0.15)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Eye className="w-3.5 h-3.5 text-[#0EA4E9]" />
              <span className="text-xs text-gray-400">Ср. просмотры</span>
            </div>
            <p className="text-lg font-bold text-white">{formatNumber(avgViews)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-gray-400">Ср. лайки</span>
            </div>
            <p className="text-lg font-bold text-white">{formatNumber(avgLikes)}</p>
          </div>
          <div className="rounded-lg p-3 col-span-2" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs text-gray-400">Топ темы</span>
            </div>
            {topWords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {topWords.map(w => (
                  <span key={w} className="px-2 py-0.5 rounded-full text-xs text-violet-300" style={{ background: 'rgba(139,92,246,0.15)' }}>
                    {w}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">Недостаточно данных</p>
            )}
          </div>
        </div>
      )}

      {topByViews.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Лучшие за период</p>
          <div className="space-y-1.5">
            {topByViews.map(v => (
              <div key={v.videoId} className="flex items-center gap-3">
                <img src={v.thumbnailUrl} alt="" className="w-10 h-7 object-cover rounded flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 truncate">{v.title}</p>
                  <p className="text-xs text-gray-600">{v.channelName} · {formatNumber(v.views)} просмотров</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({ video, onClick }: { video: NicheVideo; onClick: () => void }) {
  const scoreColor = video.score >= 70 ? '#34D399' : video.score >= 40 ? '#0EA4E9' : '#6B7280';

  return (
    <button
      onClick={onClick}
      className="rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] group"
      style={{ ...glassCard, padding: 0 }}
    >
      <div className="relative">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full aspect-video object-cover"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        />
        <div className="absolute inset-0 flex items-end p-2">
          <span className="text-xs text-white px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.75)' }}>
            {formatDuration(video.duration)}
          </span>
        </div>
        <div className="absolute top-2 right-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.8)', color: scoreColor }}
          >
            {video.score}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-xs text-gray-500 mb-1">{video.channelName}</p>
        <p className="text-sm text-white font-medium line-clamp-2 leading-snug mb-2">{video.title}</p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(video.views)}</span>
          <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{formatNumber(video.likes)}</span>
          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[#0EA4E9] flex items-center gap-0.5">
            Анализ <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Video Detail Panel ───────────────────────────────────────────────────────

function VideoDetailPanel({
  video,
  myStyle,
  userId,
  onClose,
}: {
  video: NicheVideo;
  myStyle: string;
  userId: string;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [scripts, setScripts] = useState<ScriptVariant[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());
  const [activeScript, setActiveScript] = useState(0);

  const analyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const token = await getSessionToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-niche-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          videoId: video.videoId,
          userStyle: myStyle,
          videoTitle: video.title,
          channelName: video.channelName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка анализа');
      setAnalysis(data.analysis);
      setScripts(data.scripts || []);
    } catch (e: any) {
      setError(e.message || 'Не удалось выполнить анализ');
    } finally {
      setAnalyzing(false);
    }
  };

  const generateScripts = async () => {
    if (!analysis) return;
    setGenerating(true);
    setError('');
    try {
      const token = await getSessionToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-niche-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          videoId: video.videoId,
          userStyle: myStyle,
          videoTitle: video.title,
          channelName: video.channelName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
      setScripts(data.scripts || []);
      setActiveScript(0);
      setSavedIdxs(new Set());
    } catch (e: any) {
      setError(e.message || 'Не удалось сгенерировать сценарии');
    } finally {
      setGenerating(false);
    }
  };

  const saveIdea = async (idx: number) => {
    if (!scripts[idx]) return;
    const variant = scripts[idx];
    const { error: err } = await supabase.from('niche_saved_ideas').insert({
      user_id: userId,
      source_video_id: video.videoId,
      source_video_title: video.title,
      source_channel_name: video.channelName,
      hook: variant.hookVariant,
      script: variant.script,
      first_frame: variant.firstFrame,
    });
    if (!err) setSavedIdxs(prev => new Set(prev).add(idx));
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="ml-auto h-full w-full max-w-xl overflow-y-auto" style={{ background: 'linear-gradient(160deg, #0A0F1A 0%, #0D1B2A 100%)', borderLeft: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,15,26,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <h2 className="text-sm font-semibold text-white">Видео</h2>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Thumbnail + stats */}
          <div>
            <img src={video.thumbnailUrl} alt={video.title} className="w-full rounded-xl object-cover" style={{ aspectRatio: '16/9', background: 'rgba(255,255,255,0.05)' }} />
            <p className="mt-3 text-xs text-gray-500">{video.channelName}</p>
            <p className="text-base font-semibold text-white mt-0.5 leading-snug">{video.title}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(video.views)}</span>
              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{formatNumber(video.likes)}</span>
              <span>{formatDuration(video.duration)}</span>
              <span className="ml-auto font-semibold" style={{ color: video.score >= 70 ? '#34D399' : video.score >= 40 ? '#0EA4E9' : '#6B7280' }}>
                Скор: {video.score}
              </span>
            </div>
          </div>

          {/* Analyze button */}
          {!analysis && (
            <button
              onClick={analyze}
              disabled={analyzing}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)' }}
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? 'Анализирую...' : 'Анализировать видео'}
            </button>
          )}

          {error && <p className="text-red-400 text-sm rounded-lg px-4 py-3" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>{error}</p>}

          {/* Analysis results */}
          {analysis && (
            <div className="rounded-xl p-4 space-y-4" style={glassCard}>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                AI-анализ
              </h3>

              <AnalysisBlock label="О чём видео" text={analysis.about} />
              <AnalysisBlock label="Оригинальный хук" text={analysis.hook} accent />
              <AnalysisBlock label="Почему залетело" text={analysis.why_it_worked} />
              <AnalysisBlock label="Что оставить при адаптации" text={analysis.what_to_keep} />
            </div>
          )}

          {/* Scripts */}
          {analysis && scripts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Сценарии</h3>
                <button
                  onClick={generateScripts}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Перегенерировать
                </button>
              </div>

              <div className="flex gap-1.5">
                {scripts.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveScript(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeScript === i ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                    style={activeScript === i ? { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' } : { border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    Вариант {i + 1}
                  </button>
                ))}
              </div>

              {scripts[activeScript] && (
                <div className="rounded-xl p-4 space-y-4" style={{ ...glassCard, border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Хук</p>
                    <p className="text-sm text-white font-medium leading-relaxed" style={{ color: '#A78BFA' }}>
                      {scripts[activeScript].hookVariant}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Первый кадр</p>
                    <p className="text-sm text-gray-300 italic">{scripts[activeScript].firstFrame}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Сценарий</p>
                    <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">{scripts[activeScript].script}</pre>
                  </div>
                  <button
                    onClick={() => saveIdea(activeScript)}
                    disabled={savedIdxs.has(activeScript)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                    style={savedIdxs.has(activeScript)
                      ? { background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }
                      : { background: 'rgba(14,164,233,0.15)', color: '#0EA4E9', border: '1px solid rgba(14,164,233,0.3)' }}
                  >
                    {savedIdxs.has(activeScript) ? <Check className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                    {savedIdxs.has(activeScript) ? 'Сохранено в идеи' : 'Сохранить как идею'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Generate scripts button (after analysis, before scripts) */}
          {analysis && scripts.length === 0 && (
            <button
              onClick={generateScripts}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: '#0EA4E9' }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {generating ? 'Генерирую сценарии...' : 'Сгенерировать сценарий'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisBlock({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-sm leading-relaxed ${accent ? 'font-medium' : 'text-gray-300'}`} style={accent ? { color: '#A78BFA' } : {}}>
        {text || '—'}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NicheTab() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<CompetitorChannel[]>([]);
  const [myStyle, setMyStyle] = useState('');
  const [videos, setVideos] = useState<NicheVideo[]>([]);
  const [setupLoading, setSetupLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(14);
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [selectedVideo, setSelectedVideo] = useState<NicheVideo | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('niche_competitor_channels').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('user_tokens').select('my_style').eq('user_id', user.id).maybeSingle(),
    ]).then(([{ data: chData }, { data: tokenData }]) => {
      const chs = chData || [];
      setChannels(chs);
      setMyStyle(tokenData?.my_style || '');
      setSetupLoading(false);
      if (chs.length > 0) {
        fetchVideos(chs.map((c: CompetitorChannel) => c.channel_url), timeFilter);
      }
    });
  }, [user?.id]);

  const fetchVideos = useCallback(async (channelUrls: string[], days: TimeFilter) => {
    setVideosLoading(true);
    setFetchError('');
    try {
      const token = await getSessionToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-niche-shorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channelUrls, daysBack: days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      setVideos(data.videos || []);
    } catch (e: any) {
      setFetchError(e.message || 'Не удалось загрузить видео');
    } finally {
      setVideosLoading(false);
    }
  }, []);

  const handleSetupSaved = (newChannels: CompetitorChannel[], style: string) => {
    setChannels(newChannels);
    setMyStyle(style);
    setShowSetup(false);
    if (newChannels.length > 0) {
      fetchVideos(newChannels.map(c => c.channel_url), timeFilter);
    }
  };

  const handleTimeFilterChange = (t: TimeFilter) => {
    setTimeFilter(t);
    if (channels.length > 0) {
      fetchVideos(channels.map(c => c.channel_url), t);
    }
  };

  const filteredVideos = videos
    .filter(v => {
      if (videoFilter === 'shortlist') return v.score >= 70;
      if (videoFilter === 'easy') return v.score >= 40 && v.views < 500_000;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'views') return b.views - a.views;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  if (setupLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#0EA4E9] animate-spin" />
      </div>
    );
  }

  const hasChannels = channels.length > 0;

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-6 py-5 flex-shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Ниша</h1>
          <p className="text-sm text-gray-500">Анализируй конкурентов и адаптируй их лучшие видео под свой канал.</p>
        </div>
        <button
          onClick={() => setShowSetup(s => !s)}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <Target className="w-4 h-4" />
          {hasChannels ? 'Настройки' : 'Настроить'}
        </button>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6 max-w-5xl">
        {/* Setup section — always visible if no channels, collapsible otherwise */}
        {(!hasChannels || showSetup) && (
          <SetupSection channels={channels} myStyle={myStyle} onSaved={handleSetupSaved} />
        )}

        {hasChannels && !showSetup && (
          <>
            {/* Trends */}
            <TrendsBlock videos={videos} timeFilter={timeFilter} onTimeFilterChange={handleTimeFilterChange} />

            {/* Video Bank */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-[#0EA4E9]" />
                  Видеобанк
                  {!videosLoading && <span className="text-xs text-gray-500 font-normal">({filteredVideos.length})</span>}
                </h2>
                <button
                  onClick={() => fetchVideos(channels.map(c => c.channel_url), timeFilter)}
                  disabled={videosLoading}
                  className="p-1.5 text-gray-500 hover:text-white transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 ${videosLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Filters + Sort */}
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <div className="flex gap-1 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {([
                    { id: 'all', label: 'Все' },
                    { id: 'shortlist', label: 'Шортлист' },
                    { id: 'easy', label: 'Легко адаптировать' },
                  ] as { id: VideoFilter; label: string }[]).map(f => (
                    <button
                      key={f.id}
                      onClick={() => setVideoFilter(f.id)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${videoFilter === f.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                      style={videoFilter === f.id ? { background: 'rgba(255,255,255,0.1)' } : {}}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 rounded-lg p-1 ml-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {([
                    { id: 'score', label: 'По скору' },
                    { id: 'date', label: 'По дате' },
                    { id: 'views', label: 'По просмотрам' },
                  ] as { id: SortBy; label: string }[]).map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSortBy(s.id)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${sortBy === s.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                      style={sortBy === s.id ? { background: 'rgba(255,255,255,0.1)' } : {}}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {fetchError && (
                <p className="text-red-400 text-sm mb-4 rounded-lg px-4 py-3" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  {fetchError}
                </p>
              )}

              {videosLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-6 h-6 text-[#0EA4E9] animate-spin mx-auto" />
                    <p className="text-sm text-gray-500">Загружаю шортсы конкурентов...</p>
                  </div>
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center space-y-2">
                    <Film className="w-8 h-8 text-gray-700 mx-auto" />
                    <p className="text-sm text-gray-500">Нет видео по выбранным фильтрам</p>
                    <p className="text-xs text-gray-600">Попробуй другой период или фильтр</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredVideos.map(v => (
                    <VideoCard key={v.videoId} video={v} onClick={() => setSelectedVideo(v)} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedVideo && (
        <VideoDetailPanel
          video={selectedVideo}
          myStyle={myStyle}
          userId={user?.id || ''}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
}
