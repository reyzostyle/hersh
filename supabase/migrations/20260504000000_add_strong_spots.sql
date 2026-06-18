ALTER TABLE analyses ADD COLUMN IF NOT EXISTS strong_spots text[] DEFAULT '{}';
