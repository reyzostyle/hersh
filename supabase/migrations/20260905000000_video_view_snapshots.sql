-- Views over time, so the first hours of a video mean something.
--
-- The YouTube Analytics API stops at a `day` dimension. There is no hour, and
-- no views-per-hour metric anywhere, so the only way to know how fast a video
-- moved in its first three hours is to have written the number down at the
-- time. It cannot be recovered later: by tomorrow the API will only say the
-- video got N views yesterday.
--
-- This is the table that writes it down. One row per video per check, and the
-- rate is the difference between two rows.
--
-- Keyed by video and NOT by user, like competitor_videos: two people tracking
-- the same channel share one row and one API call. The videos worth sampling
-- are the recent ones - a video stops changing quickly after about a week - so
-- the sampler picks its targets by published_at rather than tracking a list.
CREATE TABLE IF NOT EXISTS video_snapshots (
  video_id text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views bigint NOT NULL,
  likes bigint,
  comments bigint,
  PRIMARY KEY (video_id, captured_at)
);

-- Every read is "the samples for this video, oldest first", which is what both
-- a rate and a curve are built from.
CREATE INDEX IF NOT EXISTS video_snapshots_video_idx
  ON video_snapshots(video_id, captured_at);

-- Used by the cleanup below and by any "what is still moving" query.
CREATE INDEX IF NOT EXISTS video_snapshots_captured_idx
  ON video_snapshots(captured_at);

ALTER TABLE video_snapshots ENABLE ROW LEVEL SECURITY;

-- No policies at all: the browser never reads this directly. It is raw
-- measurement, and what the product shows is derived from it by an edge
-- function under the service role. Leaving it unreadable also keeps it from
-- becoming a list of which videos everyone here is watching.

-- Views per hour between the two samples that bracket a window.
--
-- Deliberately not "views divided by age": a video published 30 hours ago with
-- 3,000 views averages 100/h and may have done all of it in the first two.
-- The rate that says whether something is alive right now is the rate between
-- the last two measurements, and the rate that says whether it started well is
-- the one across its first hours. Both are this function with different bounds.
CREATE OR REPLACE FUNCTION public.video_vph(
  p_video_id text,
  p_since timestamptz DEFAULT now() - interval '6 hours',
  p_until timestamptz DEFAULT now()
)
RETURNS real
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT
      (SELECT views FROM video_snapshots
        WHERE video_id = p_video_id AND captured_at >= p_since AND captured_at <= p_until
        ORDER BY captured_at ASC LIMIT 1) AS first_views,
      (SELECT captured_at FROM video_snapshots
        WHERE video_id = p_video_id AND captured_at >= p_since AND captured_at <= p_until
        ORDER BY captured_at ASC LIMIT 1) AS first_at,
      (SELECT views FROM video_snapshots
        WHERE video_id = p_video_id AND captured_at >= p_since AND captured_at <= p_until
        ORDER BY captured_at DESC LIMIT 1) AS last_views,
      (SELECT captured_at FROM video_snapshots
        WHERE video_id = p_video_id AND captured_at >= p_since AND captured_at <= p_until
        ORDER BY captured_at DESC LIMIT 1) AS last_at
  )
  -- NULL rather than 0 when there is only one sample: "we have not measured
  -- this yet" and "it gained nothing" are different answers, and rounding the
  -- first into the second is how a dashboard starts lying.
  SELECT CASE
    WHEN first_at IS NULL OR last_at IS NULL THEN NULL
    WHEN extract(epoch FROM (last_at - first_at)) < 600 THEN NULL
    ELSE (last_views - first_views) / (extract(epoch FROM (last_at - first_at)) / 3600.0)
  END::real
  FROM bounds;
$$;

REVOKE ALL ON FUNCTION public.video_vph(text, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.video_vph(text, timestamptz, timestamptz) TO service_role;
