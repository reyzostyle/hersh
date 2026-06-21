-- Hidden monthly limit for competitor script generation (generate-competitor-script).
-- Plus(pro): 30/mo, Pro(agency): 50/mo. Not advertised in the UI.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS script_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS script_reset_at timestamptz;
