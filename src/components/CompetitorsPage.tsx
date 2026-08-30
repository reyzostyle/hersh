import { useState, useEffect, useCallback } from 'react';
import { Loader2, ListChecks, Bookmark, Users } from 'lucide-react';
import { supabase, getSessionToken } from '../lib/supabase';
import { callFunction, filterIdeas, type CompetitorChannel, type CompetitorIdea, type IdeaFilter, type IdeaFolder } from '../lib/competitors';
import { CompetitorsFeed } from './CompetitorsFeed';
import { CompetitorsSaved } from './CompetitorsSaved';
import { CompetitorIdeaDrawer } from './CompetitorIdeaDrawer';
import { SaveToFolderModal } from './SaveToFolderModal';

type CompetitorsMode = 'feed' | 'saved';
const SUB_MODE_KEY = 'hershy_competitors_submode';

function readSavedMode(): CompetitorsMode {
  const saved = localStorage.getItem(SUB_MODE_KEY);
  // 'channels' and 'scripts' are stale values from earlier layouts (channel
  // management moved into the feed header, and the Scripts tab became Saved
  // when full-script generation was dropped), so both land on the feed.
  return saved === 'saved' ? saved : 'feed';
}

// Two jobs, two panels: Feed is discovery (who you track, what beat their
// average, which of it is worth opening) and Scripts is the workspace of
// what you've already generated. Channels used to be a third tab, but
// adding a competitor and seeing what they produced being two separate
// places meant every refresh cost a round trip through the nav.
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
  const [folders, setFolders] = useState<IdeaFolder[]>([]);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null);
  const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);

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

      const [{ data: planData }, { data: channelData }, { data: ideaData }, { data: folderData }] = await Promise.all([
        supabase.from('user_tokens').select('plan').eq('user_id', userId).maybeSingle(),
        supabase.from('competitor_channels').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('competitor_ideas').select('*').eq('user_id', userId).order('video_published_at', { ascending: false }),
        supabase.from('idea_folders').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      ]);

      setFolders(folderData || []);

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

  const handleFetchIdeas = async (adaptForProfile = true) => {
    setFetchingIdeas(true);
    setFetchError('');
    setFetchNotice('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('fetch-competitor-ideas', token, { adaptForProfile });
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

  // Writes through to the database as well as local state. The grid's save
  // and dismiss buttons used to call a local-only version of this, so a
  // rating survived until the next reload and no further.
  const handleIdeaUpdated = (updated: CompetitorIdea) => {
    setIdeas(prev => prev.map(idea => idea.id === updated.id ? updated : idea));
    supabase
      .from('competitor_ideas')
      .update({ liked: updated.liked, folder_id: updated.folder_id, outline: updated.outline })
      .eq('id', updated.id)
      .then(({ error }) => { if (error) console.error('[CompetitorsPage] persist idea error:', error); });
  };

  const handleCreateFolder = async (name: string): Promise<IdeaFolder | null> => {
    const token = await getSessionToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const { data, error } = await supabase
      .from('idea_folders')
      .insert({ user_id: payload.sub, name })
      .select()
      .single();
    if (error || !data) {
      setFetchError(error?.message.includes('duplicate') ? 'A folder with that name already exists.' : 'Could not create the folder.');
      return null;
    }
    setFolders(prev => [...prev, data]);
    return data;
  };

  // The ideas inside are deliberately kept — the column is ON DELETE SET
  // NULL, so they fall back to Unfiled rather than disappearing with the
  // folder.
  const handleDeleteFolder = async (folder: IdeaFolder) => {
    if (!window.confirm(`Delete "${folder.name}"? The ideas inside stay saved, just unfiled.`)) return;
    setDeletingFolderId(folder.id);
    const { error } = await supabase.from('idea_folders').delete().eq('id', folder.id);
    setDeletingFolderId(null);
    if (error) { setFetchError('Could not delete the folder.'); return; }
    setFolders(prev => prev.filter(f => f.id !== folder.id));
    setIdeas(prev => prev.map(i => (i.folder_id === folder.id ? { ...i, folder_id: null } : i)));
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
        <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
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
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(var(--accent-rgb),0.12)' }}>
            <Users className="w-6 h-6 text-[var(--accent)]" />
          </div>
          <div className="space-y-1.5">
            <p className="text-white font-semibold text-base">Competitors is a Plus feature</p>
            <p className="text-gray-400 text-sm max-w-sm">Track up to 5 competitor channels, get AI-extracted ideas and outlines tailored to your niche.</p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }))}
            className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            Upgrade to Plus
          </button>
        </div>
      </div>
    );
  }

  const inboxCount = filterIdeas(ideas, 'new').length;
  const savedCount = ideas.filter(i => i.liked === true).length;
  const openIdea = openIdeaId ? ideas.find(i => i.id === openIdeaId) ?? null : null;
  const savingIdea = savingIdeaId ? ideas.find(i => i.id === savingIdeaId) ?? null : null;

  const modes: { id: CompetitorsMode; label: string; icon: React.ReactNode; badge: number }[] = [
    { id: 'feed', label: 'Feed', icon: <ListChecks className="w-4 h-4" />, badge: inboxCount },
    { id: 'saved', label: 'Saved', icon: <Bookmark className="w-4 h-4" />, badge: savedCount },
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
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {m.icon}
            <span className="flex-1 text-left">{m.label}</span>
            {m.badge > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                style={mode === m.id ? { background: 'rgba(var(--accent-rgb),0.22)', color: 'var(--accent-soft)' } : { background: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}
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
                mode === m.id ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-gray-500 hover:text-gray-300'
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
              channels={channels}
              filter={ideaFilter}
              onFilterChange={setIdeaFilter}
              onIdeaUpdated={handleIdeaUpdated}
              onOpenIdea={setOpenIdeaId}
              onSaveIdea={idea => setSavingIdeaId(idea.id)}
              onClear={handleClearIdeas}
              clearingIdeas={clearingIdeas}
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
          {mode === 'saved' && (
            <CompetitorsSaved
              ideas={ideas}
              folders={folders}
              onIdeaUpdated={handleIdeaUpdated}
              onOpenIdea={setOpenIdeaId}
              onSaveIdea={idea => setSavingIdeaId(idea.id)}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              deletingFolderId={deletingFolderId}
            />
          )}
        </div>
      </div>

      {/* Both live at page level so an idea opened from the Feed and the same
          idea opened from Saved get the identical panel. */}
      {openIdea && (
        <CompetitorIdeaDrawer
          idea={openIdea}
          onClose={() => setOpenIdeaId(null)}
          onUpdated={handleIdeaUpdated}
          onSave={() => setSavingIdeaId(openIdea.id)}
        />
      )}

      {savingIdea && (
        <SaveToFolderModal
          folders={folders}
          currentFolderId={savingIdea.folder_id}
          isSaved={savingIdea.liked === true}
          onPick={folderId => {
            handleIdeaUpdated({ ...savingIdea, liked: true, folder_id: folderId });
            setSavingIdeaId(null);
          }}
          onUnsave={() => {
            handleIdeaUpdated({ ...savingIdea, liked: null, folder_id: null });
            setSavingIdeaId(null);
          }}
          onCreateFolder={handleCreateFolder}
          onClose={() => setSavingIdeaId(null)}
        />
      )}
    </div>
  );
}
