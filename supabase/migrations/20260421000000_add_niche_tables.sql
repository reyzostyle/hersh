-- Add creator style field to user_tokens (used for script personalization)
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS my_style text;

-- Competitor channels saved by users for the Ниша tab
CREATE TABLE IF NOT EXISTS niche_competitor_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_url text NOT NULL,
  channel_id text,
  channel_name text,
  channel_handle text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE niche_competitor_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "niche_channels_user_policy"
  ON niche_competitor_channels FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Script ideas saved from the Ниша tab
CREATE TABLE IF NOT EXISTS niche_saved_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_video_id text NOT NULL,
  source_video_title text,
  source_channel_name text,
  hook text NOT NULL,
  script text NOT NULL,
  first_frame text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE niche_saved_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "niche_ideas_user_policy"
  ON niche_saved_ideas FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
