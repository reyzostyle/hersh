-- The daily drop (2026-10-06).
--
-- Every morning at 9:00 in the creator's own time zone, Ideas gets a short
-- stack of fresh ideas picked and pitched for them. Ideas used to happen only
-- when someone opened the tab and pressed Refresh, so nothing was ever waiting.
--
-- Built by the daily-ideas function: lazily when the creator opens Ideas, and
-- ahead of time by an hourly pg_cron job for anyone seen in the last two weeks.
-- Apply by hand (`supabase db query --linked -f`), never `db push`.

-- Which drop an idea arrived in. NULL for everything the feed pitched on its
-- own. An idea that has been in a drop never comes back in a later one.
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS drop_date date;
CREATE INDEX IF NOT EXISTS competitor_ideas_user_drop_idx ON competitor_ideas (user_id, drop_date);

-- IANA zone the browser reports, so 9:00 means the creator's 9:00.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS timezone text;
-- The last drop built (or being built) for this user. Doubles as the claim
-- that stops two builds racing.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS idea_drop_date date;
-- Last time they opened Ideas. The cron only prebuilds for people who come back.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS idea_seen_at timestamptz;
-- The niche search phrase, kept for a week so it is not rewritten every day.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS idea_query text;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS idea_query_at timestamptz;

-- What a niche search found, by phrase. search.list costs 100 quota units, so
-- one search feeds every creator with the same phrase for three days.
CREATE TABLE IF NOT EXISTS idea_search_cache (
  query text PRIMARY KEY,
  searched_at timestamptz NOT NULL DEFAULT now(),
  channels jsonb NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE idea_search_cache ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role reads or writes it.
