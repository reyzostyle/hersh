-- Splits competitor discovery into two layers.
--
-- Until now a competitor video became a row in competitor_ideas only after the
-- LLM had already read its transcript and written an angle, which cost a
-- credit. That put the expensive step BEFORE the user had looked at anything,
-- and it is what made the feed dead-end: the fetch could only afford a handful
-- of videos per channel (MAX_PER_CHANNEL 8) inside a 14-day window, so once
-- you had triaged those there was nothing left until a competitor happened to
-- post again.
--
-- The pool below is the cheap layer. Plain YouTube facts - title, views, when
-- it went up, how far it beat its channel's own pace - with no transcript, no
-- model call and no credit. It can hold every outlier from a channel's last 50
-- uploads instead of eight, so dismissing something just uncovers the next
-- one. The model only runs when the user opens or saves a specific video, and
-- that is the only thing that is billed.
--
-- Deliberately keyed by channel and NOT by user: two creators tracking the
-- same competitor share one row and one YouTube fetch. Per-user rows would
-- have meant re-spending the daily API quota once per subscriber on the same
-- public data, which is the ceiling this feature would have hit first.
-- The name was taken. 20260313125000 created a competitor_videos of its own
-- for the first version of this feature, keyed by user_id and holding a
-- thumbnail and a duration. Nothing has read or written it in a long time -
-- the feature moved to competitor_ideas - and it is empty, so it is dropped
-- rather than left beside the new one under a near-identical name. The drop
-- lives here, in the migration, so a database rebuilt from scratch ends up in
-- the same state as the live one.
DROP TABLE IF EXISTS competitor_videos;

CREATE TABLE IF NOT EXISTS competitor_videos (
  video_id text PRIMARY KEY,
  channel_id text NOT NULL,
  channel_name text,
  title text,
  views bigint,
  published_at timestamptz,
  -- Views per day against this channel's own median. NULL when the channel
  -- has too little history for a median to mean anything.
  outlier_score real,
  refreshed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS competitor_videos_channel_idx
  ON competitor_videos(channel_id, outlier_score DESC NULLS LAST);

-- One row per channel, tracking when its pool was last rebuilt. This is what
-- lets a refresh serve every user who tracks the channel off one API call:
-- a channel synced in the last hour is skipped, whoever asked for it.
CREATE TABLE IF NOT EXISTS competitor_channel_pool (
  channel_id text PRIMARY KEY,
  synced_at timestamptz DEFAULT now(),
  median_velocity real,
  video_count int DEFAULT 0
);

ALTER TABLE competitor_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_channel_pool ENABLE ROW LEVEL SECURITY;

-- The pool is public YouTube data, but it is still only readable through a
-- channel the reader actually tracks - otherwise the table would be a list of
-- what everyone else is watching, readable by anyone with a login.
DROP POLICY IF EXISTS "Users can read pooled videos for channels they track" ON competitor_videos;
CREATE POLICY "Users can read pooled videos for channels they track"
  ON competitor_videos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM competitor_channels c
      WHERE c.channel_id = competitor_videos.channel_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

-- No write policies on either table: the pool is filled by the refresh edge
-- function under the service role, which bypasses RLS. competitor_channel_pool
-- gets no policies at all, so it is invisible to the browser entirely - it is
-- sync bookkeeping, not user data.

-- competitor_ideas rows used to be created only by an edge function, so the
-- table never needed an INSERT policy. Now the browser writes one the moment
-- you dismiss or save something, before any model has run: the row IS the
-- record of the decision, and enrichment fills in concept/adapted_idea later
-- if it happens at all.
DROP POLICY IF EXISTS "Users can insert own competitor ideas" ON competitor_ideas;
CREATE POLICY "Users can insert own competitor ideas"
  ON competitor_ideas FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
