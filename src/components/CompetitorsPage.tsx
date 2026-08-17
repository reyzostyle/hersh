import { useState, useEffect, useCallback } from 'react';
import { Loader2, Users, ListChecks, FileText } from 'lucide-react';
import { supabase, getSessionToken } from '../lib/supabase';
import { callFunction, type CompetitorChannel, type CompetitorIdea } from './CompetitorIdeaCard';
import { CompetitorsFeed, type IdeaFilter, filterIdeas } from './CompetitorsFeed';
import { CompetitorsChannels } from './CompetitorsChannels';
import { CompetitorsScripts } from './CompetitorsScripts';

type CompetitorsMode = 'feed' | 'channels' | 'scripts';
const SUB_MODE_KEY = 'hershy_competitors_submode';

function readSavedMode(): CompetitorsMode {
  const saved = localStorage.getItem(SUB_MODE_KEY);
  return saved === 'channels' || saved === 'scripts' || saved === 'feed' ? saved : 'channels';
}

// Competitors used to be one long page — channel management, the fetch
// button, and the idea feed all stacked on top of each other. That made it
// hard to add anything without the page turning into clutter. Split the same
// way Analyze is: a left sub-panel (Feed / Channels / Scripts) sharing one
// data layer, each panel free to grow on its own.
export function CompetitorsPage() {
  const [mode, setMode] = useState<CompetitorsMode>(readSavedMode);
  const [channels, setChannels] = useState<CompetitorChannel[]>([]);
  const [ideas, setIdeas] = useState<CompetitorIdea[]>([]);
  const [addingChannel, setAddingChannel] = useState(false);
  const [fetchingIdeas, setFetchingIdeas] = useState(false);
  const [clearingIdeas, setClearingIdeas] = useState(false);
  const [addError, setAddError] = useState('');
  const [fetchError, setFetchError] = useState('');
  // "Nothing beat its channel average" is the expected outcome of most runs, so
  // it reads as a status line rather than a failure.
  const [fetchNotice, setFetchNotice] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('new');
  const [userPlan, setUserPlan] = useState<string>('free');

  const select = (m: CompetitorsMode) => {
    setMode(m);
    localStorage.setItem(SUB_MODE_KEY, m);
  };

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

  const handleAddChannel = async (channelUrl: string) => {
    setAddingChannel(true);
    setAddError('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('add-competitor-channel', token, { channelUrl });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add channel');
      await loadData();

      // The new channel gets its own one-off sync immediately, scoped to just
      // that channel, instead of waiting on the shared 12h refresh window.
      const newChannelId = data.channel?.channel_id;
      if (newChannelId) {
        setSyncingChannelId(data.channel.id);
        try {
          const syncRes = await callFunction('fetch-competitor-ideas', token, { channelId: newChannelId });
          const syncData = await syncRes.json();
          if (syncRes.ok && syncData.ideas) setIdeas(syncData.ideas);
        } catch (e) {
          console.error('[CompetitorsPage] onboarding sync error:', e);
        } finally {
          setSyncingChannelId(null);
        }
      }
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
    setFetchNotice('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('fetch-competitor-ideas', token);
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return;
      }
      if (data.error === 'rate_limited' || data.error === 'idle_throttled') {
        setFetchNotice(data.message || 'You can run competitor analysis once every 12 hours. Try again later.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to fetch ideas');
      setIdeas(data.ideas || []);
      if (data.processed === 0 && data.message) {
        setFetchNotice(data.message);
      } else if (data.processed > 0) {
        setIdeaFilter('new');
        select('feed');
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFetchingIdeas(false);
    }
  };

  const handleIdeaUpdated = (updated: CompetitorIdea) => {
    setIdeas(prev => prev.map(idea => idea.id === updated.id ? updated : idea));
  };

  // Dismisses the inbox rather than deleting it. Deleting would also wipe the
  // record of which videos have already been analyzed, so the next run would
  // re-analyze the same videos and bill for them a second time. Saved ideas are
  // left alone.
  const handleClearIdeas = async () => {
    const inbox = filterIdeas(ideas, 'new');
    if (inbox.length === 0) return;
    if (!window.confirm(`Dismiss ${inbox.length} unreviewed idea${inbox.length !== 1 ? 's' : ''}? Saved ideas stay.`)) return;
    setClearingIdeas(true);
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const userId = payload.sub;
      const inboxIds = inbox.map(i => i.id);
      const { error } = await supabase
        .from('competitor_ideas')
        .update({ liked: false })
        .eq('user_id', userId)
        .in('id', inboxIds);
      if (error) throw error;
      const cleared = new Set(inboxIds);
      setIdeas(prev => prev.map(i => (cleared.has(i.id) ? { ...i, liked: false } : i)));
    } catch (e) {
      console.error('[CompetitorsPage] clear ideas error:', e);
      setFetchError(e instanceof Error ? e.message : 'Failed to clear ideas');
    } finally {
      setClearingIdeas(false);
    }
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-8 space-y-5 sm:space-y-8 animate-fade-in-up">
        <div className="hidden lg:block">
          <h1 className="text-2xl font-bold text-white mb-1">Competitors</h1>
          <p className="text-sm text-gray-500 text-balance">Track competitor channels and generate content ideas</p>
        </div>
        <div className="rounded-2xl p-8 flex flex-col items-center text-center space-y-4 glass-panel-accent">
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

  const isPro = userPlan === 'pro' || userPlan === 'agency';
  const inboxCount = filterIdeas(ideas, 'new').length;
  const scriptsCount = ideas.filter(i => i.outline || i.script).length;

  const modes: { id: CompetitorsMode; label: string; icon: React.ReactNode; badge: number }[] = [
    { id: 'channels', label: 'Channels', icon: <Users className="w-4 h-4" />, badge: channels.length },
    { id: 'feed', label: 'Feed', icon: <ListChecks className="w-4 h-4" />, badge: inboxCount },
    { id: 'scripts', label: 'Scripts', icon: <FileText className="w-4 h-4" />, badge: scriptsCount },
  ];

  return (
    <div className="h-full flex">
      {/* Desktop sub-nav — same shell as AnalyzeHub. pt-16 clears AppShell's
          fixed sidebar-collapse toggle. */}
      <div className="hidden lg:flex lg:flex-col w-44 flex-shrink-0 px-3 pt-16 pb-5 gap-0.5" style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
        {modes.map(m => (
          <button
            key={m.id}
            onClick={() => select(m.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === m.id
                ? 'bg-[#0EA4E9]/15 text-[#0EA4E9] ring-1 ring-inset ring-[#0EA4E9]/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {m.icon}
            <span className="flex-1 text-left">{m.label}</span>
            {m.badge > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                style={mode === m.id ? { background: 'rgba(14,164,233,0.22)', color: '#38bdf8' } : { background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}
              >
                {m.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Mobile sub-nav */}
        <div className="lg:hidden flex items-center gap-2 px-4 pt-3 pb-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => select(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                mode === m.id ? 'bg-[#0EA4E9]/15 text-[#0EA4E9]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m.icon}
              {m.label}
              {m.badge > 0 && <span className="tabular-nums">({m.badge})</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {mode === 'feed' && (
            <CompetitorsFeed
              ideas={ideas}
              hasChannels={channels.length > 0}
              filter={ideaFilter}
              onFilterChange={setIdeaFilter}
              onIdeaUpdated={handleIdeaUpdated}
              isPro={isPro}
              onClear={handleClearIdeas}
              clearingIdeas={clearingIdeas}
            />
          )}
          {mode === 'channels' && (
            <CompetitorsChannels
              channels={channels}
              ideas={ideas}
              addingChannel={addingChannel}
              addError={addError}
              removingId={removingId}
              syncingChannelId={syncingChannelId}
              onAddChannel={handleAddChannel}
              onRemoveChannel={handleRemoveChannel}
              fetchingIdeas={fetchingIdeas}
              fetchError={fetchError}
              fetchNotice={fetchNotice}
              onFetchIdeas={handleFetchIdeas}
            />
          )}
          {mode === 'scripts' && (
            <CompetitorsScripts ideas={ideas} onIdeaUpdated={handleIdeaUpdated} isPro={isPro} />
          )}
        </div>
      </div>
    </div>
  );
}
