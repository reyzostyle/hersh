/*
  # Hersh - YouTube Shorts Analyzer Schema

  1. New Tables
    - `user_tokens`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `access_token` (text) - YouTube OAuth access token
      - `refresh_token` (text) - YouTube OAuth refresh token
      - `token_expiry` (timestamptz) - When the access token expires
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `videos`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `video_id` (text) - YouTube video ID
      - `title` (text)
      - `views` (bigint)
      - `retention_percentage` (numeric)
      - `average_view_duration` (numeric) - in seconds
      - `transcript` (text)
      - `thumbnail_url` (text)
      - `published_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `analyses`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `video_ids` (text[]) - Array of video IDs analyzed together
      - `hook_analysis` (jsonb) - Claude's analysis of hooks
      - `weak_spots` (jsonb) - Identified weak points
      - `new_hook_ideas` (jsonb) - Generated hook ideas
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own data
*/

CREATE TABLE IF NOT EXISTS user_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_expiry timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_id text NOT NULL,
  title text NOT NULL,
  views bigint DEFAULT 0,
  retention_percentage numeric DEFAULT 0,
  average_view_duration numeric DEFAULT 0,
  transcript text,
  thumbnail_url text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, video_id)
);

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_ids text[] NOT NULL,
  hook_analysis jsonb,
  weak_spots jsonb,
  new_hook_ideas jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens"
  ON user_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
  ON user_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON user_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON user_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own videos"
  ON videos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos"
  ON videos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);