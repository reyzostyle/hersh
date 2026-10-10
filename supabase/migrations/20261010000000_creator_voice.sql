-- How the creator actually talks, heard in their own top Shorts (2026-10-10).
-- Built by _shared/voice.ts from the daily-ideas cron, read by the chat and the
-- outline writer so scripts sound like the person filming them.
-- Apply by hand (`supabase db query --linked -f`), never `db push`.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS voice jsonb;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS voice_at timestamptz;
