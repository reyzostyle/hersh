-- Give batch hook analysis (analyze-hooks) its own counter, separate from the
-- video-analysis counter (analyses_used). Previously both shared analyses_used.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS hook_analyses_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS hook_analyses_reset_at timestamptz;
