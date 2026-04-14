-- Track referral signups immediately on registration,
-- without depending on user_tokens (which is only created on YouTube connect)
CREATE TABLE IF NOT EXISTS referral_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referral_code text NOT NULL REFERENCES referral_codes(code),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_referral_signups_code ON referral_signups(referral_code);

ALTER TABLE referral_signups ENABLE ROW LEVEL SECURITY;

-- Users can only see their own signup record
CREATE POLICY "Users can view own referral signup"
  ON referral_signups FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own signup record
CREATE POLICY "Users can insert own referral signup"
  ON referral_signups FOR INSERT
  WITH CHECK (auth.uid() = user_id);
