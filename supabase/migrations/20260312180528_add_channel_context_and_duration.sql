/*
  # Add channel context and video duration fields

  1. Changes to `user_tokens` table
    - Add `channel_context` column to store user's channel description/niche
    
  2. Changes to `videos` table
    - Add `duration` column to store video length in seconds
    
  3. Security
    - No RLS changes needed as tables already have RLS enabled
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'channel_context'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN channel_context text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'duration'
  ) THEN
    ALTER TABLE videos ADD COLUMN duration integer DEFAULT 0;
  END IF;
END $$;
