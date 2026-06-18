ALTER TABLE analyses ADD COLUMN IF NOT EXISTS is_my_video boolean DEFAULT false;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS video_title text;
