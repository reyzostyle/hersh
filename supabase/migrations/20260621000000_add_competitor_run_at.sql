-- Track the last time a user triggered a competitor-ideas run, to enforce
-- a one-run-per-day limit on the (otherwise uncapped) fetch-competitor-ideas endpoint.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS competitor_run_at timestamptz;
