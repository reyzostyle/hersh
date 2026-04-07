/*
  # Add likes_count and comment_count to videos

  1. Changes
    - `videos` table: add `likes_count` (bigint, default 0) for like count
    - `videos` table: add `comment_count` (bigint, default 0) for comment count

  2. Notes
    - These are fetched from the YouTube Data API v3 statistics
    - Default 0 so existing rows remain valid
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'likes_count'
  ) THEN
    ALTER TABLE videos ADD COLUMN likes_count bigint DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'comment_count'
  ) THEN
    ALTER TABLE videos ADD COLUMN comment_count bigint DEFAULT 0;
  END IF;
END $$;
