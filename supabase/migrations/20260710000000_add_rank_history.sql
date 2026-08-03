-- Rank system: one finalized row per user per season (calendar month).
-- Current-season RP is always computed live from analyses/videos/user_tokens;
-- this table stores closed seasons for the 25% carryover and rank history.
CREATE TABLE IF NOT EXISTS rank_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season text NOT NULL, -- 'YYYY-MM'
  rp integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'Iron',
  breakdown jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, season)
);

ALTER TABLE rank_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own rank history"
  ON rank_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rank history"
  ON rank_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
