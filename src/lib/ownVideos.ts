import { FUNCTIONS_URL, supabase, getUserId, getSessionToken } from './supabase';

// Pulling the creator's own uploads into `videos`.
//
// This is the wire that was never connected. `fetch-youtube-data` takes the
// user from the JWT, writes their Shorts into `videos`, and stamps
// `youtube_synced_at` - and the migration that added that column says plainly
// that callers should read it "to decide whether a background refresh is due".
// No caller was ever written, so the function was reachable and unreached:
// 45 accounts, 10 with YouTube connected, and 42 rows in `videos` between them.
//
// Everything downstream was starved by it. `snapshot-views` selects the videos
// to sample FROM `videos`, so with `videos` near-empty it had nothing to record
// and `video_snapshots` sat at zero rows - which in turn is why there is no
// baseline to say "this upload is running at 40% of your usual". The chain is
// sync, then snapshots, then anything that compares a video to your normal.

// How stale is stale. Views move all day, but this call costs YouTube quota and
// writes every Short on the channel, so it is a background refresh and not a
// live read - the numbers on screen come from channel-stats.
const STALE_MS = 6 * 60 * 60 * 1000;

// Once per page load, whatever remounts. The tab this is called from is
// remounted on every switch of the sidebar.
let askedThisLoad = false;

/**
 * Refreshes the creator's own videos if the last sync is old enough to bother.
 *
 * Fire and forget by design: nothing on screen waits for it, and a failure
 * costs a stale list rather than a broken page. Returns true if a sync was
 * actually started, which is only useful for tests and logging.
 */
export async function syncOwnVideos(force = false): Promise<boolean> {
  if (askedThisLoad && !force) return false;
  askedThisLoad = true;

  try {
    const userId = await getUserId();
    if (!userId) return false;

    const { data } = await supabase
      .from('user_tokens')
      .select('access_token, youtube_synced_at')
      .eq('user_id', userId)
      .maybeSingle();

    // No connected channel, nothing to sync. Not an error: most accounts are
    // in this state and the app works fine without it.
    if (!data?.access_token) return false;

    if (!force && data.youtube_synced_at) {
      const age = Date.now() - new Date(data.youtube_synced_at).getTime();
      if (age < STALE_MS) return false;
    }

    const token = await getSessionToken();
    if (!token) return false;

    await fetch(`${FUNCTIONS_URL}/fetch-youtube-data`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return true;
  } catch {
    // Background housekeeping. A page must never break over it.
    return false;
  }
}
