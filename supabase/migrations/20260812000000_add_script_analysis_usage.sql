-- Separate monthly quota for Script analysis (analyze-script-text), independent
-- of Hook Lab's hooks_used and unrelated to script_used (competitor-script
-- generation in generate-competitor-script — a different feature).
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS script_analyses_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS script_analyses_reset_at timestamptz;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS bonus_script_analyses integer NOT NULL DEFAULT 0;
