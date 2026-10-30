import { useState, useEffect, useCallback } from 'react';
import { supabase, getSessionToken, getUserId } from '../lib/supabase';
import {
  stealVideo, fetchDailyDrop, itemFromIdea, filterIdeas,
  type CompetitorIdea, type FeedItem, type IdeaFilter,
} from '../lib/competitors';
import { takeRequestedVideo } from '../lib/projects';
import { CREDIT_COSTS } from '../lib/useUsage';
import { CompetitorsFeed } from './CompetitorsFeed';
import { CompetitorVideoView } from './CompetitorVideoView';
import { Page, PageHead, Loading } from './Page';
import { StealProgress } from './StealProgress';
import { StealCard } from './StealCard';
import { take, PENDING_STEAL_KEY } from '../lib/intents';

// The Ideas tab. `ideas` is every row this user has: today's drop (built and
// pitched server-side by daily-ideas), everything saved or dismissed, and the
// steals. Tracked channels moved to Settings (ChannelsSettings) on 2026-10-27.
export function CompetitorsPage() {
  const [ideas, setIdeas] = useState<CompetitorIdea[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [ideaFilter, setIdeaFilter] = useState<IdeaFilter>('new');
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  const [stealing, setStealing] = useState(false);
  // A finished steal lands on its card first - the result at a glance, the
  // thing that gets filmed - and the outline is one press further.
  const [stolen, setStolen] = useState<CompetitorIdea | null>(null);
  // Today's drop. Only the ids and the clock live here: the rows themselves
  // go into `ideas`, so a save or a skip in the stack is the same write the
  // grid makes and both views agree.
  const [drop, setDrop] = useState<{ ids: string[]; nextAt: string; needsProfile: boolean } | null>(null);
  const [dropLoading, setDropLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;

      const { data: ideaData } = await supabase.from('competitor_ideas').select('*').eq('user_id', userId);
      setIdeas(ideaData || []);
    } catch (e) {
      console.error('[CompetitorsPage] loadData error:', e);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const [findingMore, setFindingMore] = useState(false);
  const [moreNote, setMoreNote] = useState('');

  const applyDrop = (d: NonNullable<Awaited<ReturnType<typeof fetchDailyDrop>>>) => {
    setIdeas(prev => {
      const next = [...prev];
      for (const row of d.items) {
        const at = next.findIndex(i => i.video_id === row.video_id);
        if (at >= 0) next[at] = { ...next[at], ...row };
        else next.push(row);
      }
      return next;
    });
    setDrop({ ids: d.items.map(i => i.video_id), nextAt: d.nextAt, needsProfile: !!d.needsProfile });
  };

  // Five researched ideas for credits, any time of day.
  const findMore = async () => {
    setFindingMore(true);
    setMoreNote('');
    try {
      const token = await getSessionToken();
      if (!token) return;
      const d = await fetchDailyDrop(token, true);
      if (!d) { setMoreNote('Could not look just now. Try again in a minute.'); return; }
      applyDrop(d);
      if (d.more?.error === 'limit_reached') setMoreNote(`That costs ${CREDIT_COSTS.more_ideas} credits and you're out for this month.`);
      else if (!d.more?.added) setMoreNote('Could not research anything new just now. Try again in a minute.');
    } finally {
      setFindingMore(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) return;
        const d = await fetchDailyDrop(token);
        if (!d) return;
        applyDrop(d);
      } finally {
        setDropLoading(false);
      }
    })();
  }, []);

  // A saved idea opened from its project. Read once on mount and cleared, the
  // same handoff Analyze uses for a filed conversation. The lookup below falls
  // back to the ideas table, so a video that has aged out of the pool still
  // opens.
  useEffect(() => {
    const requested = takeRequestedVideo();
    if (requested) setOpenVideoId(requested);
  }, []);

  // A Steal pressed in the Chrome extension or chosen from the share sheet.
  // Taken (and cleared) before anything awaits, so a double mount cannot
  // spend the credits twice. The result is a saved idea with its outline
  // already written, opened straight into the same view a feed video uses.
  useEffect(() => {
    const url = take(PENDING_STEAL_KEY);
    if (!url) return;
    (async () => {
      setStealing(true);
      setFetchError('');
      try {
        const token = await getSessionToken();
        if (!token) throw new Error('Not authenticated');
        const result = await stealVideo(url, token);
        if ('limit' in result) {
          setIdeaFilter('saved');
          setFetchError(`Stealing a format costs ${result.cost} credits and you're out for this month.`);
          return;
        }
        handleIdeaUpdated(result.idea, { persist: false });
        setIdeaFilter('saved');
        setStolen(result.idea);
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : 'Could not steal that video');
      } finally {
        setStealing(false);
      }
    })();
  }, []);

  // Records a decision on a video. This is the row that used to only exist
  // after the model had run - now it is written the moment you rule on
  // something, whether or not anything has read it, and enrichment fills in
  // the rest later if you ask for it.
  const ruleOn = async (items: FeedItem[], liked: boolean | null, projectId?: string | null) => {
    const userId = await getUserId();
    if (!userId) return;

    const rows = items.map(item => ({
      user_id: userId,
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

    // A row that already exists (every drop item, and all AI ideas) gets only
    // the decision written. Upserting the whole row wrote the feed's view of
    // it back over the stored one, and for an AI idea, whose channel and title
    // fields are empty in the feed, the write failed: the page reloaded and
    // the swiped card came straight back (Ivan, 2026-10-30).
    const existing = items.map(it => it.idea?.id).filter((id): id is string => !!id && !id.startsWith('pending-'));
    const fresh = rows.filter((_, i) => !items[i].idea?.id || items[i].idea!.id.startsWith('pending-'));
    const decision = { liked, ...(projectId !== undefined ? { project_id: projectId } : {}) };
    const results = await Promise.all([
      existing.length
        ? supabase.from('competitor_ideas').update(decision).in('id', existing).select()
        : Promise.resolve({ data: [], error: null }),
      fresh.length
        ? supabase.from('competitor_ideas').upsert(fresh, { onConflict: 'user_id,video_id' }).select()
        : Promise.resolve({ data: [], error: null }),
    ]);
    const error = results.find(r => r.error)?.error;
    const data = results.flatMap(r => (r.data ?? []) as CompetitorIdea[]);

    if (error) {
      console.error('[CompetitorsPage] rule error:', error);
      setFetchError('Could not save that. Try again.');
      loadData();
      return;
    }
    // Swap the optimistic rows for the real ones, so they carry a real id.
    const saved = new Map(((data ?? []) as CompetitorIdea[]).map(r => [r.video_id, r]));
    setIdeas(prev => prev.map(i => saved.get(i.video_id) ?? i));
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

  // Today's drop in the order the server ranked it, minus what has been ruled
  // on. Rows come from `ideas`, so a save anywhere shows here at once.
  const dropIdeas = (drop?.ids ?? [])
    .map(id => ideas.find(i => i.video_id === id))
    .filter((i): i is CompetitorIdea => !!i);
  const dropRemaining = dropIdeas.filter(i => i.liked == null);

  // A steal from the extension or the share sheet takes the page while it
  // runs: the same checklist the side panel shows, not a modal over the feed.
  if (stealing) {
    return (
      <Page>
        <StealProgress />
      </Page>
    );
  }

  if (stolen) {
    return (
      <Page>
        <div className="flex justify-center animate-scale-in">
          <StealCard
            idea={stolen}
            multiplier={stolen.outlier_score}
            onOpen={() => { setOpenVideoId(stolen.video_id); setStolen(null); }}
          />
        </div>
      </Page>
    );
  }

  if (initialLoading) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }

  const dismissedItems = filterIdeas(ideas, 'dismissed').map(itemFromIdea);
  const savedItems = filterIdeas(ideas, 'saved').map(itemFromIdea);

  const openItem = openVideoId
    ? (ideas.find(i => i.video_id === openVideoId) ? itemFromIdea(ideas.find(i => i.video_id === openVideoId)!) : null)
    : null;

  // Working on a video takes over the whole screen rather than sliding a tray
  // over the grid, so an outline has somewhere to be read.
  if (openItem) {
    return (
      <CompetitorVideoView
        item={openItem}
        onBack={() => setOpenVideoId(null)}
        onSave={() => ruleOn([openItem], openItem.idea?.liked === true ? null : true)}
        onDismiss={() => ruleOn([openItem], openItem.idea?.liked === false ? null : false)}
        onUpdated={handleIdeaUpdated}
      />
    );
  }

  return (
    <Page className="animate-tab-in">
      <PageHead title="Ideas" />

      <CompetitorsFeed
        today={{
          loading: dropLoading && !drop,
          all: dropIdeas,
          remaining: dropRemaining,
          total: dropIdeas.length,
          findingMore,
          moreNote,
          onMore: findMore,
          nextAt: drop?.nextAt ?? null,
          needsProfile: drop?.needsProfile ?? false,
        }}
        saved={savedItems}
        dismissed={dismissedItems}
        filter={ideaFilter}
        onFilterChange={setIdeaFilter}
        onOpen={item => setOpenVideoId(item.video_id)}
        onDismiss={item => ruleOn([item], item.idea?.liked === false ? null : false)}
        onSave={item => ruleOn([item], item.idea?.liked === true ? null : true)}
        fetchError={fetchError}
      />

    </Page>
  );
}
