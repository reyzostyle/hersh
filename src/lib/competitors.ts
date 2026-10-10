import { FUNCTIONS_URL, fetchWithRetry } from './supabase';

// Types and helpers shared by every Competitors surface (the feed grid, the
// detail drawer, the Scripts workspace, the channel manager). They live here
// rather than in a component so the drawer can reuse the card's generation
// logic without the two files importing each other in a cycle.


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
  // One line, from the title alone: what THIS creator's version would be, and
  // whether it suits their channel. Written free by pitch-ideas before anyone
  // pays to read the video; null until then.
  pitch?: string | null;
  fit?: 'yes' | 'stretch' | 'no' | null;
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
  // "70K", not "70.0K".
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
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
  return fetchWithRetry(`${FUNCTIONS_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
}

// "Steal this format" on any Short, from the extension, the side panel or the
// share sheet. One call reads the idea and writes the outline; the result is a
// saved idea. `limit` means the credits ran out, which is a message for the
// user, not an error.
export type StealResult = { idea: CompetitorIdea } | { limit: true; cost: number };

export async function stealVideo(url: string, token: string): Promise<StealResult> {
  const res = await callFunction('steal-video', token, { url });
  const data = await res.json();
  if (data.error === 'limit_reached') return { limit: true, cost: data.cost ?? 5 };
  if (!res.ok) throw new Error(data.error || 'Could not steal that video');
  return { idea: data.idea as CompetitorIdea };
}

// Today's drop: a few fresh ideas picked and pitched for this creator, turning
// over at 9:00 their time. The server builds it on the first call of the day,
// so the first open can take a few seconds. Null when the call fails or the
// function is not there, and the page simply goes without.
export interface DailyDrop {
  date: string;
  nextAt: string;
  size: number;
  items: CompetitorIdea[];
  // Nothing to search for yet: no brain and no connected channel.
  needsProfile?: boolean;
}

export async function fetchDailyDrop(token: string): Promise<DailyDrop | null> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await callFunction('daily-ideas', token, { timezone });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.items) ? data as DailyDrop : null;
  } catch {
    return null;
  }
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

// Triage state. 'new' is today's drop minus what has been ruled on; what is
// not saved by the next drop is gone.
export type IdeaFilter = 'new' | 'saved' | 'dismissed';

export function filterIdeas(ideas: CompetitorIdea[], filter: IdeaFilter): CompetitorIdea[] {
  if (filter === 'saved') return ideas.filter(i => i.liked === true);
  if (filter === 'dismissed') return ideas.filter(i => i.liked === false);
  return ideas.filter(i => i.liked == null);
}

