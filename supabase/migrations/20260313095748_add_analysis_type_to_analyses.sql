/*
  # Add analysis_type to analyses table

  ## Changes
  - Adds `analysis_type` column to `analyses` table
    - Values: 'basic' (title + stats only) or 'advanced' (title + stats + script)
    - Defaults to 'basic' for existing rows

  ## Notes
  - Non-destructive: existing rows get the default value 'basic'
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'analysis_type'
  ) THEN
    ALTER TABLE analyses ADD COLUMN analysis_type text NOT NULL DEFAULT 'basic';
  END IF;
END $$;
