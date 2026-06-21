-- Throttle "idle" competitor runs (no new videos, no tokens spent):
-- allow a few free attempts, then rate-limit how often they can be retried.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS competitor_idle_count integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS competitor_idle_at timestamptz;
