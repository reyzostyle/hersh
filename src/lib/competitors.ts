import { fetchWithRetry } from './supabase';

// Types and helpers shared by every Competitors surface (the feed grid, the
// detail drawer, the Scripts workspace, the channel manager). They live here
// rather than in a component so the drawer can reuse the card's generation
// logic without the two files importing each other in a cycle.

const SUPABASE_FUNCTIONS_URL = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1';

export interface CompetitorChannel {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_thumbnail: string | null;
  created_at: string;
}

export interface OutlineSection {
  title: string;
  content: string;
  duration: string;
}

export interface Outline {
  hook: string;
  sections: OutlineSection[];
  cta: string;
}

export interface CompetitorIdea {
  id: string;
  channel_id: string;
  channel_name: string | null;
  video_id: string;
  video_title: string | null;
  video_thumbnail: string | null;
  video_views: number | null;
  video_published_at: string | null;
  outlier_score: number | null;
  concept: string | null;
  adapted_idea: string | null;
  outline: Outline | null;
  // Full-script generation was dropped 2026-08-23. The column stays so
  // existing rows keep their content, but nothing reads it any more.
  script: string | null;
  liked: boolean | null;
  // Was folder_id, pointing at idea_folders. Folders became projects so an idea
  // and the conversation it started can be filed in the same place.
  project_id: string | null;
  created_at: string;
}

export function formatViews(n: number | null): string {
  if (n === null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 14) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function callFunction(endpoint: string, token: string, body?: object): Promise<Response> {
  return fetchWithRetry(`${SUPABASE_FUNCTIONS_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
}

// ─── The pool ────────────────────────────────────────────────────────────────

// A candidate straight off YouTube: what it is, how it did, and how far it beat
// the channel it came from. No model has read it and nothing has been billed.
// The feed is built from these, which is why it no longer runs out.
export interface PoolVideo {
  video_id: string;
  channel_id: string;
  channel_name: string | null;
  title: string | null;
  views: number | null;
  published_at: string | null;
  outlier_score: number | null;
  refreshed_at: string;
}

// What a card renders. The video facts are always there; `idea` is filled in
// once the video has been read - which happens on demand, for one credit, and
// only for the ones you open or save.
export interface FeedItem {
  video_id: string;
  channel_id: string;
  channel_name: string | null;
  video_title: string | null;
  video_views: number | null;
  video_published_at: string | null;
  outlier_score: number | null;
  idea: CompetitorIdea | null;
}

function itemFromPool(v: PoolVideo, idea: CompetitorIdea | null): FeedItem {
  return {
    video_id: v.video_id,
    channel_id: v.channel_id,
    channel_name: v.channel_name,
    video_title: v.title,
    video_views: v.views,
    video_published_at: v.published_at,
    outlier_score: v.outlier_score,
    idea,
  };
}

export function itemFromIdea(idea: CompetitorIdea): FeedItem {
  return {
    video_id: idea.video_id,
    channel_id: idea.channel_id,
    channel_name: idea.channel_name,
    video_title: idea.video_title,
    video_views: idea.video_views,
    video_published_at: idea.video_published_at,
    outlier_score: idea.outlier_score,
    idea,
  };
}

// ─── Feed filtering / sorting ────────────────────────────────────────────────

// Triage state, not a quality filter. The inbox is the pool minus everything
// you have already ruled on, so clearing it uncovers the next best video rather
// than emptying the tab. There is no staleness cut-off any more: a video that
// tripled its channel is worth seeing whether it went up last week or in March,
// and age is already an input to the sort.
export type IdeaFilter = 'new' | 'saved' | 'dismissed';

export function filterIdeas(ideas: CompetitorIdea[], filter: IdeaFilter): CompetitorIdea[] {
  if (filter === 'saved') return ideas.filter(i => i.liked === true);
  if (filter === 'dismissed') return ideas.filter(i => i.liked === false);
  return ideas.filter(i => i.liked == null);
}

// The inbox. A pooled video drops out once it carries a decision (saved or
// dismissed); one that has merely been read stays, because reading it is not
// the same as ruling on it.
export function inboxItems(pool: PoolVideo[], ideas: CompetitorIdea[]): FeedItem[] {
  const byVideo = new Map(ideas.map(i => [i.video_id, i]));
  return pool
    .filter(v => byVideo.get(v.video_id)?.liked == null)
    .map(v => itemFromPool(v, byVideo.get(v.video_id) ?? null));
}

// The axis every competitor tool leads with (TubeLab ships 5x/10x/25x/50x
// buttons, 1of10 filters on outlier score) and the one this feed was missing:
// how far above its own channel's pace a video actually landed. Kept to 2x/5x
// because the backend only surfaces videos that already beat their average,
// so the interesting range starts higher than a generic tool's.
export type OutlierFloor = 0 | 2 | 5;
export type IdeaSort = 'outlier' | 'recent' | 'views';

export function sortAndFilterFeed(
  items: FeedItem[],
  { floor, sort, channelId }: { floor: OutlierFloor; sort: IdeaSort; channelId: string | null }
): FeedItem[] {
  const out = items.filter(i => {
    if (channelId && i.channel_id !== channelId) return false;
    // An unscored video has no claim to a floor above zero, so it drops out
    // as soon as one is set rather than silently ranking as 0x.
    if (floor > 0 && (i.outlier_score ?? 0) < floor) return false;
    return true;
  });

  return out.sort((a, b) => {
    if (sort === 'views') return (b.video_views ?? 0) - (a.video_views ?? 0);
    if (sort === 'recent') {
      const at = a.video_published_at ? new Date(a.video_published_at).getTime() : 0;
      const bt = b.video_published_at ? new Date(b.video_published_at).getTime() : 0;
      return bt - at;
    }
    return (b.outlier_score ?? 0) - (a.outlier_score ?? 0);
  });
}
