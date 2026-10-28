-- The Shorts feed on its own (2026-10-28). Studio's "stayed to watch" is about
-- the feed; views from search or the channel page almost never swipe, so the
-- all-sources ratio read 39% on a Short Studio puts at 34.3%. Feed only: 37%.
-- Apply by hand (`supabase db query --linked -f`), never `db push`.
ALTER TABLE video_retention ADD COLUMN IF NOT EXISTS feed_views integer;
ALTER TABLE video_retention ADD COLUMN IF NOT EXISTS feed_engaged integer;
