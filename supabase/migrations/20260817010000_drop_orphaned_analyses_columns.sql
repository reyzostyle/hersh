-- Free plan now spends from the shared credit pool too (one-time grant, see
-- 20260817000000_add_unified_credits.sql's loadCreditStatus), so these are
-- no longer read or written anywhere live (only the already-dead, unused
-- check-usage function still referenced them).
ALTER TABLE user_tokens DROP COLUMN IF EXISTS analyses_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS analyses_reset_at;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS bonus_analyses;
