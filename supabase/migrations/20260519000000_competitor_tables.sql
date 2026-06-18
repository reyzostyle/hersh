CREATE TABLE IF NOT EXISTS competitor_channels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text,
  channel_thumbnail text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS competitor_ideas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text,
  channel_name text,
  video_id text,
  video_title text,
  video_thumbnail text,
  video_views bigint,
  video_published_at timestamptz,
  concept text,
  adapted_idea text,
  outline jsonb,
  script text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, video_id)
);
