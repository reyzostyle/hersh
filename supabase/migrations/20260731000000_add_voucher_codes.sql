-- Voucher/perk codes redeemable in Settings → Redeem code. The code catalog
-- itself lives server-side in the redeem-code edge function, not the client.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS bonus_analyses integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS bonus_hooks integer NOT NULL DEFAULT 0;
-- Rank RP-earning boost, scoped to a single season ('YYYY-MM'); ignored once
-- the season rolls over rather than explicitly cleared.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS rank_boost_season text;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS rank_boost_multiplier numeric NOT NULL DEFAULT 1;

-- One row per (user, code) enforces one redemption per code per account.
CREATE TABLE IF NOT EXISTS redeemed_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);

-- No client policies: only the redeem-code edge function (service role)
-- reads/writes this table.
ALTER TABLE redeemed_codes ENABLE ROW LEVEL SECURITY;
