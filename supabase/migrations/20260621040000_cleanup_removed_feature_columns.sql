-- Cleanup of schema left behind by removed features:
--   * batch hook analysis (analyze-hooks)        -> hook_analyses_used / _reset_at
--   * deep channel analysis (deep-channel-analysis) -> deep_analyses_used / _reset_at, channel_deep_analyses
--   * Niche tab (analyze-niche-video, fetch-niche-shorts) -> my_style, niche_* tables
-- All of these are unused by the current codebase.

-- user_tokens counter columns
ALTER TABLE user_tokens DROP COLUMN IF EXISTS hook_analyses_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS hook_analyses_reset_at;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS deep_analyses_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS deep_analyses_reset_at;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS my_style;

-- Orphaned tables
DROP TABLE IF EXISTS channel_deep_analyses;
DROP TABLE IF EXISTS niche_saved_ideas;
DROP TABLE IF EXISTS niche_competitor_channels;
