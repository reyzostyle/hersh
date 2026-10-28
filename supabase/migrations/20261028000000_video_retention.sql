-- Real retention for the creator's own Shorts (2026-10-28).
--
-- Until now the curve was fetched inside a video review, turned into "at ~12%
-- of the video: -25% viewers" and thrown away. The model then guessed the
-- seconds, and on Ivan's 0:41 Short it wrote "a 25% drop at 0:05-0:07" when
-- Studio shows 150% falling to 50% by 0:03. Nothing outside that one review
-- could see the curve at all: not the chat, not scripts, not the brain.
--
-- One row per video, written by sync-retention (daily cron, Settings, the
-- review, the chat) and read by every prompt that talks about their numbers.
-- Apply by hand (`supabase db query --linked -f`), never `db push`.

CREATE TABLE IF NOT EXISTS video_retention (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text,
  published_at timestamptz,
  duration_s integer,
  -- Every start or replay (YouTube's Shorts "views" since 2025-03-31).
  views integer,
  -- Views that got past the first seconds. engaged_views / views is the
  -- closest the API comes to Studio's "stayed to watch".
  engaged_views integer,
  stayed_pct numeric,
  avg_view_s numeric,
  avg_view_pct numeric,
  likes integer,
  comments integer,
  shares integer,
  subs_gained integer,
  -- [{r, w, rel}]: r = share of the video elapsed (0.01-1), w = audienceWatchRatio
  -- (1 = 100%, over 1 = replays), rel = relativeRetentionPerformance (0-1).
  curve jsonb,
  -- [{from_s, to_s, from_pct, to_pct, lost, says, shows}], biggest first.
  drops jsonb,
  -- [{t, says, shows}]: what is said and on screen, by second.
  beats jsonb,
  beats_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

ALTER TABLE video_retention ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own retention" ON video_retention;
CREATE POLICY "own retention" ON video_retention
  FOR SELECT USING (auth.uid() = user_id);

-- What the curves add up to: {summary, lessons: [{rule, evidence}],
-- stayed_median, avg_view_median, videos, made_at}. Read with the brain.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS retention_lessons jsonb;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS retention_synced_at timestamptz;
-- 'no_scope' when YouTube refused the Analytics read (connected before the
-- scope, or unticked it): Settings asks them to reconnect.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS retention_error text;
