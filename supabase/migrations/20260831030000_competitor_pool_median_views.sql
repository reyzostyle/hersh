-- The pool's outlier score stopped being about velocity.
--
-- It used to be views-per-day against the channel's median views-per-day, which
-- is the intuitive way to normalise for age and the wrong one for Shorts: a
-- Short earns nearly all its views in week one, so dividing by lifetime makes
-- an older video's number collapse. On the live pool that put a 1.1M-view Short
-- from four days ago at 552x and a 4.2M-view one from four months ago at 70x -
-- the metric was ranking by age while claiming to rank by performance.
--
-- It is now total views against the channel's median total views, over videos
-- at least a week old. So the bookkeeping column holds a different quantity and
-- needs a name that says so.
ALTER TABLE competitor_channel_pool
  RENAME COLUMN median_velocity TO median_views;

-- Every pooled row was scored under the old formula, so the numbers on them are
-- not comparable to anything written from here on. Clearing both tables makes
-- the next refresh rebuild them: the pool is derived data, cheap to refetch,
-- and a user's saves and dismissals live in competitor_ideas and are untouched
-- by this - which is the whole point of having split the two.
DELETE FROM competitor_videos;
DELETE FROM competitor_channel_pool;
