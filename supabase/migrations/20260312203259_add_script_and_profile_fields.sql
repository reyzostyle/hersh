/*
  # Add Script and Profile Fields

  1. Changes
    - `videos` table: add `script` column (text, nullable) for user-pasted scripts
    - `user_tokens` table: add `channel_niche`, `channel_description`, `target_audience` columns

  2. Notes
    - Scripts are optional and used to enrich Claude analysis
    - Profile fields are used in every Claude analysis prompt for personalization
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'script'
  ) THEN
    ALTER TABLE videos ADD COLUMN script text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'channel_niche'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN channel_niche text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'channel_description'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN channel_description text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'target_audience'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN target_audience text DEFAULT '';
  END IF;
END $$;
