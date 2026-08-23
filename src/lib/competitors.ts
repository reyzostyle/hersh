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

export interface IdeaFolder {
  id: string;
  name: string;
  created_at: string;
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
  folder_id: string | null;
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

// ─── Feed filtering / sorting ────────────────────────────────────────────────

// Triage state, not a quality filter: "New" only holds ideas you haven't ruled
// on yet, so it empties as you work instead of growing forever. Anything left
// untouched this long is stale enough to drop out on its own — the row stays in
// the database so the same video is never analyzed (or paid for) twice.
export type IdeaFilter = 'new' | 'saved' | 'dismissed';

const STALE_AFTER_DAYS = 21;

function isStale(idea: CompetitorIdea): boolean {
  const published = idea.video_published_at ?? idea.created_at;
  if (!published) return false;
  const ageDays = (Date.now() - new Date(published).getTime()) / 86_400_000;
  return ageDays > STALE_AFTER_DAYS;
}

export function filterIdeas(ideas: CompetitorIdea[], filter: IdeaFilter): CompetitorIdea[] {
  if (filter === 'saved') return ideas.filter(i => i.liked === true);
  if (filter === 'dismissed') return ideas.filter(i => i.liked === false);
  return ideas.filter(i => i.liked == null && !isStale(i));
}

// The axis every competitor tool leads with (TubeLab ships 5x/10x/25x/50x
// buttons, 1of10 filters on outlier score) and the one this feed was missing:
// how far above its own channel's pace a video actually landed. Kept to 2x/5x
// because the backend only surfaces videos that already beat their average,
// so the interesting range starts higher than a generic tool's.
export type OutlierFloor = 0 | 2 | 5;
export type IdeaSort = 'outlier' | 'recent' | 'views';

export function sortAndFilterIdeas(
  ideas: CompetitorIdea[],
  { floor, sort, channelId }: { floor: OutlierFloor; sort: IdeaSort; channelId: string | null }
): CompetitorIdea[] {
  const out = ideas.filter(i => {
    if (channelId && i.channel_id !== channelId) return false;
    // An unscored idea has no claim to a floor above zero, so it drops out
    // as soon as one is set rather than silently ranking as 0x.
    if (floor > 0 && (i.outlier_score ?? 0) < floor) return false;
    return true;
  });

  return out.sort((a, b) => {
    if (sort === 'views') return (b.video_views ?? 0) - (a.video_views ?? 0);
    if (sort === 'recent') {
      const at = new Date(a.video_published_at ?? a.created_at).getTime();
      const bt = new Date(b.video_published_at ?? b.created_at).getTime();
      return bt - at;
    }
    return (b.outlier_score ?? 0) - (a.outlier_score ?? 0);
  });
}
