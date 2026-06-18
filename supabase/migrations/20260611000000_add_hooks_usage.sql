-- Separate monthly quota for Hook Lab (analyze-hook-text), independent of the
-- video analyses counter (analyses_used). Free plan: 10 hook checks / month.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS hooks_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS hooks_reset_at timestamptz;
