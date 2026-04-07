/*
  # Create Competitor Tables

  Creates competitor_channels and competitor_videos tables
  for tracking competitor YouTube Shorts data.
*/

CREATE TABLE IF NOT EXISTS public.competitor_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_url text NOT NULL,
  channel_title text,
  channel_handle text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel_id)
);

ALTER TABLE public.competitor_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own competitor channels"
  ON public.competitor_channels FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own competitor channels"
  ON public.competitor_channels FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own competitor channels"
  ON public.competitor_channels FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.competitor_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  video_id text NOT NULL,
  title text,
  views bigint DEFAULT 0,
  duration integer DEFAULT 0,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

ALTER TABLE public.competitor_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own competitor videos"
  ON public.competitor_videos FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own competitor videos"
  ON public.competitor_videos FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own competitor videos"
  ON public.competitor_videos FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX competitor_videos_user_id_idx ON public.competitor_videos (user_id);
CREATE INDEX competitor_videos_channel_id_idx ON public.competitor_videos (channel_id);
