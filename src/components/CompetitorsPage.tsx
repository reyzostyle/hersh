import { useState, useEffect, useCallback } from 'react';
import { RefreshOutlineIcon as Loader2 } from '@solar-icons/react';
import { supabase, getSessionToken } from '../lib/supabase';
import {
  callFunction, inboxItems, itemFromIdea, filterIdeas,
  type CompetitorChannel, type CompetitorIdea, type FeedItem, type IdeaFilter, type PoolVideo,
} from '../lib/competitors';
import { listProjects, touchProject, type Project } from '../lib/projects';
import { CompetitorsFeed } from './CompetitorsFeed';
import { CompetitorVideoView } from './CompetitorVideoView';
import { FindCompetitorsModal } from './FindCompetitorsModal';
import { Page, PageHead } from './Page';

// Two layers, and the difference is the whole point of this screen.
//
// `pool` is every outlier the tracked channels have produced across their last
// 50 uploads: free, refreshed from YouTube, shared between everyone who tracks
// the same competitor. `ideas` is the much smaller set this user has actually
// ruled on or paid to have read. The inbox is the first minus the second, so
// dismissing something uncovers the next best video instead of emptying the
// tab - which is what used to happen when the feed WAS the paid list.
export function CompetitorsPage() {
  const [channels, setChannels] = useState<CompetitorChannel[]>([]);
  const [pool, setPool] = useState<PoolVideo[]>([]);
  const [ideas, setIdeas] = useState<CompetitorIdea[]>([]);
  const [addingChannel, setAddingChannel] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [addError, setAddError] = useState('');
  const [fetchError, setFetchError] = useState('');
  // "Everything is already up to date" is the expected outcome of most
  // refreshes now, so it reads as a status line rather than a failure.
  const [fetchNotice, setFetchNotice] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('new');
  // Not a gate any more - it only decides how many channels may be tracked,
  // which the manage panel shows.
  const [userPlan, setUserPlan] = useState<string>('free');
  const [projects, setProjects] = useState<Project[]>([]);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  // Lives up here rather than in the feed because it now steers the enrichment
  // call as well as the refresh, and both are launched from this component.
  const [adaptForProfile, setAdaptForProfile] = useState(true);
  const [findOpen, setFindOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const userId = user.id;

      const [{ data: planData }, { data: channelData }, { data: ideaData }, projectData] = await Promise.all([
        supabase.from('user_tokens').select('plan').eq('user_id', userId).maybeSingle(),
        supabase.from('competitor_channels').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('competitor_ideas').select('*').eq('user_id', userId),
        listProjects(),
      ]);

      setProjects(projectData);
      setUserPlan(planData?.plan || 'free');

      const mappedChannels = (channelData || []).map((c: any) => ({
        ...c,
        channel_name: c.channel_name ?? c.channel_title ?? null,
        channel_thumbnail: c.channel_thumbnail ?? c.thumbnail_url ?? null,
      }));
      setChannels(mappedChannels);
      setIdeas(ideaData || []);

      // Read straight from the table rather than through the refresh function:
      // opening the tab should show what is already known instantly, and only
      // an explicit refresh should go out to YouTube.
      if (mappedChannels.length) {
        const { data: poolData } = await supabase
          .from('competitor_videos')
          .select('*')
          .in('channel_id', mappedChannels.map((c: any) => c.channel_id))
          .order('outlier_score', { ascending: false, nullsFirst: false });
        setPool(poolData || []);
      } else {
        setPool([]);
      }
    } catch (e) {
      console.error('[CompetitorsPage] loadData error:', e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

      // The new channel gets its own pool built immediately, scoped to just
      // that channel. It costs three YouTube reads and nothing else, so there
      // is no reason to make someone wait for the next manual refresh.
      const newChannelId = data.channel?.channel_id;
      if (newChannelId) {
        setSyncingChannelId(data.channel.id);
        try {
          const syncRes = await callFunction('fetch-competitor-ideas', token, { channelId: newChannelId });
          const syncData = await syncRes.json();
          if (syncRes.ok && syncData.videos) setPool(syncData.videos);
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

  // Auto-find hands back channel ids; each goes through the same endpoint a
  // pasted URL does, so the five-channel cap, the id resolution and the
  // first-sync are enforced in one place rather than two. Sequential on
  // purpose: the cap is checked server-side per call, and firing five at once
  // would race past it.
  const handleAddFound = async (channelIds: string[]) => {
    for (const id of channelIds) {
      await handleAddChannel(`https://www.youtube.com/channel/${id}`);
    }
  };

  const handleRemoveChannel = async (channel: CompetitorChannel) => {
    setRemovingId(channel.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await supabase.from('competitor_channels').delete().eq('id', channel.id).eq('user_id', user.id);
      setChannels(prev => prev.filter(c => c.id !== channel.id));
      // The pooled videos stay in the table - another user may track the same
      // channel - they just stop being visible here.
      setPool(prev => prev.filter(v => v.channel_id !== channel.channel_id));
    } catch (e) {
      console.error('[CompetitorsPage] remove channel error:', e);
    } finally {
      setRemovingId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setFetchError('');
    setFetchNotice('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('fetch-competitor-ideas', token, {});
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not refresh');
      setPool(data.videos || []);
      if (data.message) setFetchNotice(data.message);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setRefreshing(false);
    }
  };

  // Records a decision on a video. This is the row that used to only exist
  // after the model had run - now it is written the moment you rule on
  // something, whether or not anything has read it, and enrichment fills in
  // the rest later if you ask for it.
  const ruleOn = async (items: FeedItem[], liked: boolean | null, projectId?: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const rows = items.map(item => ({
      user_id: user.id,
      channel_id: item.channel_id,
      channel_name: item.channel_name,
      video_id: item.video_id,
      video_title: item.video_title,
      video_views: item.video_views,
      video_published_at: item.video_published_at,
      outlier_score: item.outlier_score,
      liked,
      ...(projectId !== undefined ? { project_id: projectId } : {}),
    }));

    // Optimistic, because triage has to feel instant: the card should leave the
    // inbox on the click, not on the round trip. A row that does not exist yet
    // gets a `pending-` id, which handleIdeaUpdated refuses to write against -
    // it is a placeholder for one render, not a database key.
    setIdeas(prev => {
      const next = [...prev];
      rows.forEach((row, i) => {
        const at = next.findIndex(x => x.video_id === row.video_id);
        if (at >= 0) next[at] = { ...next[at], ...row };
        else next.push({ ...(items[i].idea ?? {}), ...row, id: `pending-${row.video_id}` } as CompetitorIdea);
      });
      return next;
    });

    const { data, error } = await supabase
      .from('competitor_ideas')
      .upsert(rows, { onConflict: 'user_id,video_id' })
      .select();
    // Filing something into a project counts as work on that project, so it
    // moves up the Projects list.
    if (projectId) touchProject(projectId);

    if (error) {
      console.error('[CompetitorsPage] rule error:', error);
      setFetchError('Could not save that. Try again.');
      loadData();
      return;
    }
    // Swap the optimistic rows for the real ones, so they carry a real id.
    const saved = new Map((data ?? []).map((r: any) => [r.video_id, r as CompetitorIdea]));
    setIdeas(prev => prev.map(i => saved.get(i.video_id) ?? i));
  };

  // Runs the model on one video: transcript in, concept and an angle for this
  // channel out. The only billed action on this screen, and it happens because
  // someone asked for this specific video.
  const enrich = async (item: FeedItem): Promise<CompetitorIdea | null> => {
    if (item.idea?.concept) return item.idea;
    setEnrichingId(item.video_id);
    setFetchError('');
    try {
      const token = await getSessionToken();
      if (!token) throw new Error('Not authenticated');
      const res = await callFunction('enrich-competitor-video', token, { videoId: item.video_id, adaptForProfile });
      const data = await res.json();
      if (data.error === 'upgrade_required') {
        window.dispatchEvent(new CustomEvent('hershy:navigate', { detail: 'upgrade' }));
        return null;
      }
      if (data.error === 'limit_reached') {
        setFetchError("You've used all your credits for this month.");
        return null;
      }
      if (!res.ok) throw new Error(data.error || 'Could not read that video');
      handleIdeaUpdated(data.idea, { persist: false });
      return data.idea as CompetitorIdea;
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Could not read that video');
      return null;
    } finally {
      setEnrichingId(null);
    }
  };

  // Writes through to the database as well as local state, except when the
  // caller has already persisted (an enrichment response is the stored row).
  const handleIdeaUpdated = (updated: CompetitorIdea, { persist = true }: { persist?: boolean } = {}) => {
    setIdeas(prev => {
      const at = prev.findIndex(i => i.video_id === updated.video_id);
      if (at < 0) return [...prev, updated];
      const next = [...prev];
      next[at] = updated;
      return next;
    });
    if (!persist) return;
    // An optimistic placeholder has no row to update yet; the real one lands a
    // moment later from the upsert and carries the same fields.
    if (updated.id.startsWith('pending-')) return;
    supabase
      .from('competitor_ideas')
      .update({ liked: updated.liked, project_id: updated.project_id, outline: updated.outline })
      .eq('id', updated.id)
      .then(({ error }) => { if (error) console.error('[CompetitorsPage] persist idea error:', error); });
  };

  const inbox = inboxItems(pool, ideas);

  // Dismisses what is on screen, not the whole pool. Clearing the inbox is now
  // an act of triage rather than a reset: the next batch of outliers is already
  // sitting behind these, and dismissing costs nothing either way.
  const handleClearInbox = async (visible: FeedItem[]) => {
    if (visible.length === 0) return;
    if (!window.confirm(`Dismiss ${visible.length} idea${visible.length !== 1 ? 's' : ''}? The next best ones take their place.`)) return;
    setClearing(true);
    await ruleOn(visible, false);
    setClearing(false);
  };

  if (initialLoading) {
    return (
      <Page width="lg">
        <div className="flex justify-center pt-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} />
        </div>
      </Page>
    );
  }

  // One list, three states. `filter` decides which of them is on screen, and
  // the counts are what the tabs show.
  const dismissedItems = filterIdeas(ideas, 'dismissed').map(itemFromIdea);
  const savedItems = filterIdeas(ideas, 'saved').map(itemFromIdea);
  const items = ideaFilter === 'new' ? inbox : ideaFilter === 'saved' ? savedItems : dismissedItems;
  const counts: Record<IdeaFilter, number> = {
    new: inbox.length, saved: savedItems.length, dismissed: dismissedItems.length,
  };

  const openItem = openVideoId
    ? items.find(i => i.video_id === openVideoId)
      ?? inbox.find(i => i.video_id === openVideoId)
      ?? (ideas.find(i => i.video_id === openVideoId) ? itemFromIdea(ideas.find(i => i.video_id === openVideoId)!) : null)
    : null;

  // Working on a video takes over the whole screen rather than sliding a tray
  // over the grid, so an outline has somewhere to be read.
  if (openItem) {
    return (
      <CompetitorVideoView
        item={openItem}
        projects={projects}
        onBack={() => setOpenVideoId(null)}
        onBreakDown={() => enrich(openItem)}
        breaking={enrichingId === openItem.video_id}
        onSave={() => ruleOn([openItem], openItem.idea?.liked === true ? null : true)}
        onDismiss={() => ruleOn([openItem], openItem.idea?.liked === false ? null : false)}
        onFile={projectId => ruleOn([openItem], true, projectId)}
        onUpdated={handleIdeaUpdated}
      />
    );
  }

  return (
    <Page width="lg">
      <PageHead
        eyebrow="Competitors"
        title="What beat its own average"
        subtitle="Finding them is free. Reading one costs a credit."
      />

      <CompetitorsFeed
        items={items}
        counts={counts}
        pool={pool}
        channels={channels}
        filter={ideaFilter}
        onFilterChange={setIdeaFilter}
        onOpen={item => setOpenVideoId(item.video_id)}
        onDismiss={item => ruleOn([item], item.idea?.liked === false ? null : false)}
        onSave={item => ruleOn([item], item.idea?.liked === true ? null : true)}
        onClear={handleClearInbox}
        clearing={clearing}
        addingChannel={addingChannel}
        addError={addError}
        removingId={removingId}
        syncingChannelId={syncingChannelId}
        onAddChannel={handleAddChannel}
        onRemoveChannel={handleRemoveChannel}
        onAutoFind={() => setFindOpen(true)}
        channelLimit={userPlan === 'free' ? 3 : 5}
        refreshing={refreshing}
        fetchError={fetchError}
        fetchNotice={fetchNotice}
        onRefresh={handleRefresh}
        adaptForProfile={adaptForProfile}
        onAdaptChange={setAdaptForProfile}
      />

      {findOpen && (
        <FindCompetitorsModal
          slotsLeft={Math.max(0, (userPlan === 'free' ? 3 : 5) - channels.length)}
          onAdd={handleAddFound}
          onClose={() => setFindOpen(false)}
        />
      )}
    </Page>
  );
}
