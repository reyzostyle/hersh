import { useState, useEffect, useCallback } from 'react';
import { supabase, getSessionToken } from '../lib/supabase';
import {
  RefreshCw, Sparkles, Eye, Heart, Clock, BarChart2,
  Youtube, Loader2, TrendingDown, TrendingUp, Microscope, AlertTriangle,
} from 'lucide-react';

const SUPABASE_FUNCTIONS_URL = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

interface ChannelInfo {
  name: string;
  thumbnail: string;
  subscribers: number;
  totalViews: number;
}

interface VideoStat {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  duration: number;
  views: number;
  likes: number;
  avgViewDuration: number;
  avgViewPercentage: number | null;
  shares: number;
}

interface AnalyticsData {
  channel: ChannelInfo;
  videos: VideoStat[];
  insights: string[];
  period: string;
}

interface DeepAnalysis {
  analyzedAt: string;
  videoCount: number;
  channelIdentity: string;
  workingDirection: string;
  audienceMatch: string;
  contentThemes: string[];
  directionRecommendation: string;
  biggestRisk: string;
}

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-4 space-y-3 animate-pulse"
      style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
    >
      <div className="h-28 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-3 rounded-full w-4/5" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

function VideoCard({ video, rank }: { video: VideoStat; rank: 'top' | 'bottom' | 'normal' }) {
  const borderStyle =
    rank === 'top'
      ? { background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.28)' }
      : rank === 'bottom'
      ? { background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.18)', opacity: 0.65 }
      : { background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' };

  return (
    <div className="rounded-2xl overflow-hidden" style={borderStyle}>
      <a
        href={`https://www.youtube.com/shorts/${video.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative"
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-32 object-cover hover:opacity-80 transition-opacity"
          />
        ) : (
          <div className="w-full h-32 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <Youtube className="w-8 h-8 text-gray-700" />
          </div>
        )}
        {/* Duration badge */}
        <span
          className="absolute bottom-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.75)', color: '#e5e7eb' }}
        >
          {formatDuration(video.duration)}
        </span>
      </a>
      <div className="p-3 space-y-2">
        <p className="text-white text-xs font-medium leading-snug line-clamp-2">{video.title}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <Eye className="w-3 h-3" />
            {formatViews(video.views)}
          </span>
          {video.avgViewPercentage !== null && video.avgViewPercentage !== undefined && video.avgViewPercentage > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3 h-3" />
              {video.avgViewPercentage.toFixed(0)}%
            </span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <Heart className="w-3 h-3" />
            {formatViews(video.likes)}
          </span>
        </div>
      </div>
    </div>
  );
}

function NotConnectedPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center space-y-6">
      <div
        className="rounded-2xl p-10 flex flex-col items-center gap-6 w-full max-w-md"
        style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.2)' }}
        >
          <Youtube className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-white text-xl font-bold">Connect your YouTube channel</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Connect your YouTube account to see views, retention, and AI-powered insights for your Shorts.
          </p>
        </div>
        <button
          onClick={onConnect}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: '#FF0000' }}
        >
          <Youtube className="w-4 h-4" />
          Connect YouTube
        </button>
      </div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notConnected, setNotConnected] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [error, setError] = useState('');
  const [periodDays, setPeriodDays] = useState(30);
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysis | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState('');
  const [deepProgressText, setDeepProgressText] = useState('');
  const [deepUsed, setDeepUsed] = useState<number | null>(null);
  const [deepLimit] = useState(5);

  const fetchDeepAnalysis = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-deep-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.analysis) setDeepAnalysis(json.analysis);
    } catch {
      // silent — analysis is optional
    }
  }, []);

  const runDeepAnalysis = useCallback(async () => {
    setDeepLoading(true);
    setDeepError('');
    setDeepProgressText('Fetching your recent Shorts...');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');

      // Progressive status hints (cosmetic — server runs async)
      const t1 = setTimeout(() => setDeepProgressText('Watching videos with Gemini...'), 4000);
      const t2 = setTimeout(() => setDeepProgressText('Analyzing channel direction with Claude...'), 25000);
      const t3 = setTimeout(() => setDeepProgressText('Almost done...'), 50000);

      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/deep-channel-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: periodDays }),
      });
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);

      const json = await res.json();
      if (json.error === 'upgrade_required') { setDeepError('Pro plan required for Deep Analysis.'); return; }
      if (json.error === 'limit_reached') { setDeepError(`You've used all ${json.limit} deep analyses this month. Resets in 30 days.`); return; }
      if (!res.ok || json.error) throw new Error(json.error || 'Deep analysis failed');
      if (!json.channelIdentity) throw new Error('No analysis returned');
      if (json.deepUsed != null) setDeepUsed(json.deepUsed);
      setDeepAnalysis(json);
    } catch (e) {
      setDeepError(e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e));
    } finally {
      setDeepLoading(false);
      setDeepProgressText('');
    }
  }, [periodDays]);

  const fetchAnalytics = useCallback(async (isRefresh = false, days?: number) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    const activeDays = days ?? periodDays;
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/fetch-channel-analytics`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days: activeDays }),
      });
      const json = await res.json();
      if (json.error === 'not_connected') { setNotConnected(true); return; }
      if (json.error === 'upgrade_required') { setUpgradeRequired(true); setLoading(false); setRefreshing(false); return; }
      if (!res.ok) throw new Error(json.error || 'Failed to fetch analytics');
      setData(json);
      setNotConnected(false);
      setUpgradeRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchDeepAnalysis();
  }, [fetchAnalytics, fetchDeepAnalysis]);

  const connectYouTube = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID;
    const redirectUri = `https://ezlousklksipvwuinpzq.supabase.co/functions/v1/youtube-oauth-callback`;
    const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user.id}`;
    window.location.href = authUrl;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-8 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="h-9 w-24 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>
        {/* Summary row skeletons */}
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-2xl p-5 animate-pulse space-y-2" style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
              <div className="h-3 w-2/3 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-6 w-1/2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (notConnected) {
    return <NotConnectedPrompt onConnect={connectYouTube} />;
  }

  if (upgradeRequired) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-4 sm:pt-6 pb-8 animate-fade-in-up">
        <h1 className="hidden sm:block text-2xl font-bold text-white mb-1">Analytics</h1>
        <p className="hidden sm:block text-sm text-gray-500 mb-8">Views, retention and AI insights for your Shorts</p>
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center gap-5"
          style={{ background: 'rgba(14,164,233,0.06)', border: '1px solid rgba(14,164,233,0.2)' }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(14,164,233,0.12)', border: '1px solid rgba(14,164,233,0.25)' }}>
            <BarChart2 className="w-7 h-7 text-[#0EA4E9]" />
          </div>
          <div>
            <h2 className="text-white text-lg font-bold mb-1">Analytics is a Pro feature</h2>
            <p className="text-gray-400 text-sm max-w-sm">Upgrade to Pro to see your channel's views, retention rates, and AI-generated insights.</p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }))}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: '#0EA4E9' }}>
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col items-center gap-4 text-center">
        <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-5 py-4 max-w-md">{error}</p>
        <button
          onClick={() => fetchAnalytics()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-300 hover:text-white transition-colors"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { channel, videos, insights } = data;
  const topVideos = videos.slice(0, 3);
  const bottomVideos = videos.length > 6 ? videos.slice(-3) : [];
  const videosWithRetention = videos.filter(v => v.avgViewPercentage !== null && v.avgViewPercentage !== undefined && v.avgViewPercentage > 0);
  const avgRetention = videosWithRetention.length > 0
    ? Math.round(videosWithRetention.reduce((sum, v) => sum + (v.avgViewPercentage || 0), 0) / videosWithRetention.length)
    : 0;
  const totalViews = videos.reduce((sum, v) => sum + v.views, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-8 animate-fade-in-up">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="hidden sm:block min-w-0">
          <h1 className="text-2xl font-bold text-white mb-1">Analytics</h1>
          <p className="text-sm text-gray-500">Views, retention and AI insights for your Shorts</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => { setPeriodDays(opt.days); fetchAnalytics(true, opt.days); }}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={periodDays === opt.days
                  ? { background: 'rgba(255,255,255,0.1)', color: '#e5e7eb' }
                  : { color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(14,164,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,164,233,0.25)' }}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Channel summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className="rounded-2xl p-4 flex flex-col gap-1"
          style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <Eye className="w-3.5 h-3.5" />
            Total Views
          </span>
          <span className="text-white text-xl font-bold">{formatViews(totalViews)}</span>
          <span className="text-gray-600 text-[11px]">from {videos.length} Short{videos.length !== 1 ? 's' : ''}</span>
        </div>
        <div
          className="rounded-2xl p-4 flex flex-col gap-1"
          style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Avg Retention
          </span>
          <span className="text-white text-xl font-bold">{avgRetention > 0 ? `${avgRetention}%` : '--'}</span>
          <span className="text-gray-600 text-[11px]">{avgRetention >= 50 ? 'Strong' : avgRetention > 0 ? 'Room to improve' : 'Analytics API needed'}</span>
        </div>
        <div
          className="rounded-2xl p-4 flex flex-col gap-1"
          style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <BarChart2 className="w-3.5 h-3.5" />
            Shorts Posted
          </span>
          <span className="text-white text-xl font-bold">{videos.length}</span>
          <span className="text-gray-600 text-[11px]">this month</span>
        </div>
      </div>

      {/* Channel identity (small) */}
      {channel.name && (
        <div className="flex items-center gap-3">
          {channel.thumbnail && (
            <img src={channel.thumbnail} alt={channel.name} className="w-9 h-9 rounded-full object-cover" />
          )}
          <div>
            <p className="text-white text-sm font-semibold">{channel.name}</p>
            <p className="text-gray-500 text-xs">{formatViews(channel.subscribers)} subscribers</p>
          </div>
        </div>
      )}

      {/* Insights — neutral styling (no AI-looking glow/colors) */}
      {insights.length > 0 && (
        <div
          className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(26,31,42,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px) saturate(140%)', WebkitBackdropFilter: 'blur(20px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Insights</p>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-600" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deep Channel Analysis */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Microscope className="w-5 h-5 text-gray-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white text-base font-bold">Deep Channel Analysis</h2>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(14,164,233,0.12)', color: '#38BDF8', border: '1px solid rgba(14,164,233,0.25)' }}
                >
                  Premium
                </span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">Watches your videos and gives a verdict on direction</p>
              {deepUsed !== null && (deepLimit - deepUsed) <= 2 && (
                <p className="text-[11px] text-gray-600 mt-1">{deepLimit - deepUsed} of {deepLimit} remaining this month</p>
              )}
            </div>
          </div>
          {deepAnalysis && !deepLoading && (
            <button
              onClick={runDeepAnalysis}
              className="text-gray-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          )}
        </div>

        {deepError && (
          <div
            className="rounded-xl px-3 py-2 text-xs text-red-300"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            {deepError}
          </div>
        )}

        {!deepAnalysis && !deepLoading && (
          <button
            onClick={runDeepAnalysis}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: '#0EA4E9' }}
          >
            <Microscope className="w-4 h-4" />
            Run Deep Analysis
          </button>
        )}

        {deepLoading && (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="w-5 h-5 text-[#0EA4E9] animate-spin" />
            <div>
              <p className="text-white text-sm font-medium">{deepProgressText || 'Working...'}</p>
              <p className="text-gray-500 text-[11px] mt-0.5">This takes 30 to 60 seconds.</p>
            </div>
          </div>
        )}

        {deepAnalysis && !deepLoading && (
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">What your channel actually is</p>
              <p className="text-white text-sm leading-relaxed">{deepAnalysis.channelIdentity}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">What's working</p>
              <p className="text-white text-sm leading-relaxed">{deepAnalysis.workingDirection}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Who's watching vs who you want</p>
              <p className="text-white text-sm leading-relaxed">{deepAnalysis.audienceMatch}</p>
            </div>
            {deepAnalysis.contentThemes?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Patterns I'm seeing</p>
                <ul className="space-y-1.5">
                  {deepAnalysis.contentThemes.map((theme, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-white leading-relaxed">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-gray-600" />
                      {theme}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">Where to take it</p>
              <p className="text-white text-sm leading-relaxed">{deepAnalysis.directionRecommendation}</p>
            </div>
            <div
              className="rounded-xl p-3 flex items-start gap-2.5"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}
            >
              <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-300 mb-1">Biggest risk</p>
                <p className="text-orange-100 text-sm leading-relaxed">{deepAnalysis.biggestRisk}</p>
              </div>
            </div>
            <p className="text-gray-600 text-[11px] pt-1">
              Generated {formatRelativeDate(deepAnalysis.analyzedAt)} from {deepAnalysis.videoCount} video{deepAnalysis.videoCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Top Performers */}
      {topVideos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Top Performers</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {topVideos.map(v => (
              <VideoCard key={v.id} video={v} rank="top" />
            ))}
            {/* Remaining videos in normal style */}
            {videos.slice(3, bottomVideos.length > 0 ? videos.length - 3 : videos.length).map(v => (
              <VideoCard key={v.id} video={v} rank="normal" />
            ))}
          </div>
        </div>
      )}

      {/* Needs Work */}
      {bottomVideos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Needs Work</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {bottomVideos.map(v => (
              <VideoCard key={v.id} video={v} rank="bottom" />
            ))}
          </div>
        </div>
      )}

      {videos.length === 0 && (
        <div
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderStyle: 'dashed' }}
        >
          <BarChart2 className="w-8 h-8 text-gray-700" />
          <p className="text-gray-500 text-sm">No Shorts found in the last 30 days.</p>
        </div>
      )}
    </div>
  );
}
