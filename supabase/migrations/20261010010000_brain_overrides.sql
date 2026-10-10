-- What the creator corrected in their brain by hand (Settings, 2026-10-10).
-- Kept apart from `brain` so the weekly rebuild never overwrites it; merged over
-- the read on every load (_shared/brain.ts mergeBrain). `voice` here replaces
-- the heard voice's description (_shared/voice.ts loadVoiceBlock).
-- Apply by hand (`supabase db query --linked -f`), never `db push`.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS brain_overrides jsonb;
