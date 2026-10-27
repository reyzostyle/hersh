-- Ideas from the creator's own channel (2026-10-27).
--
-- The daily drop now also suggests videos built on what worked on the
-- creator's OWN uploads (_shared/own-ideas.ts). They live in competitor_ideas
-- so save, dismiss, Saved and Chat work on them unchanged, but nothing has
-- tested them and there is no real video behind them: video_id is a made-up
-- `ai-` key and the client draws them as suggestions, not as Shorts.
-- Apply by hand (`supabase db query --linked -f`), never `db push`.

-- 'ai' for these; NULL for everything taken from a real Short.
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS source text
  CHECK (source IS NULL OR source = 'ai');
-- The upload it builds on: {video_id, title, views, multiple, why}.
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS basis jsonb;
