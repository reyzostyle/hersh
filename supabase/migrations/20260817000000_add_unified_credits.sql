-- Product-wide credit pool, replacing four disconnected monthly counters
-- (hooks_used, script_analyses_used, script_used) plus Competitors' two
-- previously-uncounted LLM steps (idea concept extraction, outline
-- generation). One balance, one reset date, one bonus column for top-ups
-- and admin/voucher grants — every paid action debits from the same place.
--
-- Free plan is the one exception: video analysis stays on its OWN lifetime
-- counter (analyses_used / analyses_reset_at / bonus_analyses, untouched by
-- this migration) rather than joining the pool. That's deliberate, not an
-- oversight — free's 3-lifetime-videos cap is the anti-abuse gate on the
-- single most expensive action, and folding it into a monthly-reset pool
-- would quietly hand free users fresh video credits every month. Free's
-- hook/script checks (the cheap actions) DO use credits_used below, same as
-- paid plans; Competitors stays Plus+ only regardless, so free never touches
-- competitor-priced actions.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS credits_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS credits_reset_at timestamptz;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS bonus_credits integer NOT NULL DEFAULT 0;

-- Superseded by credits_used. competitor_run_at / competitor_idle_count /
-- competitor_idle_at are UNRELATED to spend (pure anti-spam rate limit on
-- the fetch button) and are intentionally left in place.
ALTER TABLE user_tokens DROP COLUMN IF EXISTS hooks_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS hooks_reset_at;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS bonus_hooks;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS script_analyses_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS script_analyses_reset_at;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS bonus_script_analyses;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS script_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS script_reset_at;
