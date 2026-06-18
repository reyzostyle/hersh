CREATE TABLE IF NOT EXISTS channel_deep_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_identity text,
  working_direction text,
  audience_match text,
  content_themes jsonb,
  direction_recommendation text,
  biggest_risk text,
  video_count int,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE channel_deep_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own deep analyses" ON channel_deep_analyses;
CREATE POLICY "Users see own deep analyses" ON channel_deep_analyses FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_channel_deep_analyses_user_created ON channel_deep_analyses(user_id, created_at DESC);
