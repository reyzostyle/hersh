/*
  # Add video_context column to videos table

  ## Summary
  Adds an optional `video_context` column to the `videos` table so users can
  describe what a specific video is about (e.g. "Korean dance tutorial for beginners").
  This context is passed to the AI analysis alongside the script to improve hook recommendations.

  ## Changes
  - `videos` table: new nullable text column `video_context`

  ## Notes
  - Column is nullable; existing rows are unaffected
  - No RLS changes needed (existing policies on videos table already cover this column)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'video_context'
  ) THEN
    ALTER TABLE videos ADD COLUMN video_context text;
  END IF;
END $$;
