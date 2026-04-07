/*
  # Add all missing columns to existing tables

  ## Changes
  - user_tokens: channel_context, channel_niche, channel_description, target_audience,
                 plan, analyses_used, analyses_reset_at, stripe_customer_id, stripe_subscription_id
  - videos: duration, script, likes_count, comment_count, video_context
  - analyses: analysis_type
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'channel_context') THEN
    ALTER TABLE user_tokens ADD COLUMN channel_context text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'channel_niche') THEN
    ALTER TABLE user_tokens ADD COLUMN channel_niche text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'channel_description') THEN
    ALTER TABLE user_tokens ADD COLUMN channel_description text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'target_audience') THEN
    ALTER TABLE user_tokens ADD COLUMN target_audience text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'plan') THEN
    ALTER TABLE user_tokens ADD COLUMN plan text NOT NULL DEFAULT 'free';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'analyses_used') THEN
    ALTER TABLE user_tokens ADD COLUMN analyses_used integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'analyses_reset_at') THEN
    ALTER TABLE user_tokens ADD COLUMN analyses_reset_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE user_tokens ADD COLUMN stripe_customer_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_tokens' AND column_name = 'stripe_subscription_id') THEN
    ALTER TABLE user_tokens ADD COLUMN stripe_subscription_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'duration') THEN
    ALTER TABLE videos ADD COLUMN duration integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'script') THEN
    ALTER TABLE videos ADD COLUMN script text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'likes_count') THEN
    ALTER TABLE videos ADD COLUMN likes_count bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'comment_count') THEN
    ALTER TABLE videos ADD COLUMN comment_count bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'video_context') THEN
    ALTER TABLE videos ADD COLUMN video_context text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'analysis_type') THEN
    ALTER TABLE analyses ADD COLUMN analysis_type text NOT NULL DEFAULT 'basic';
  END IF;
END $$;
