-- Referral system tables

CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  partner_name text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  commission_percent int NOT NULL DEFAULT 50,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code text NOT NULL REFERENCES referral_codes(code) ON DELETE CASCADE,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan text NOT NULL,
  amount_cents int NOT NULL DEFAULT 0,
  commission_cents int NOT NULL DEFAULT 0,
  stripe_subscription_id text,
  paid_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Track which referral code a user signed up with
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS referral_code text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referral_codes_owner ON referral_codes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_code ON referral_conversions(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_user ON referral_conversions(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_referral_code ON user_tokens(referral_code);

-- RLS
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_conversions ENABLE ROW LEVEL SECURITY;

-- Partners can read their own code
CREATE POLICY "Partners can view own code"
  ON referral_codes FOR SELECT
  USING (owner_user_id = auth.uid());

-- Partners can read their own conversions
CREATE POLICY "Partners can view own conversions"
  ON referral_conversions FOR SELECT
  USING (referral_code IN (
    SELECT code FROM referral_codes WHERE owner_user_id = auth.uid()
  ));

-- Service role has full access (edge functions)
CREATE POLICY "Service role full access to referral_codes"
  ON referral_codes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to referral_conversions"
  ON referral_conversions FOR ALL
  USING (auth.role() = 'service_role');
