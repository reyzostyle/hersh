-- Competitors now surfaces videos that beat their own channel's median
-- views-per-day, instead of whatever was posted most recently. The multiple is
-- stored so the UI can show it ("2.4x") and so old rows stay distinguishable
-- from new ones (NULL = picked up before scoring existed, or too little
-- channel history to score against).
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS outlier_score real;

-- `liked` predates this file but was only ever applied straight to the
-- database, so it is missing from a clean migration run.
ALTER TABLE competitor_ideas ADD COLUMN IF NOT EXISTS liked boolean;
