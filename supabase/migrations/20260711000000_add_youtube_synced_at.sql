-- Tracks the last time fetch-youtube-data pulled fresh channel stats (views,
-- likes, comments, retention) for this user, so callers can decide whether a
-- background refresh is due instead of re-syncing on every page load.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS youtube_synced_at timestamptz;
