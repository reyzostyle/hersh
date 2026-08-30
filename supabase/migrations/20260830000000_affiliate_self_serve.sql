-- Self-serve affiliate program.
--
-- Three things the old partner system couldn't express:
--   1. commission is 30% now, not the 50% that was set for hand-picked partners
--   2. a conversion can be a renewal, not just the first payment, and the
--      program runs for 12 months per referred subscriber
--   3. earnings sit in a hold before they can be paid out, so a refund or
--      chargeback lands before the money leaves

ALTER TABLE referral_codes ALTER COLUMN commission_percent SET DEFAULT 30;

-- Where to send the money. Held here rather than on the user so that a partner
-- who is also a customer keeps the two roles separate.
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS payout_method text;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS payout_details text;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS payout_in_credits boolean NOT NULL DEFAULT false;

-- 'initial' = the checkout that started the subscription, 'renewal' = a
-- later billing cycle. Existing rows are all initial payments.
ALTER TABLE referral_conversions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'initial';

-- Earnings become payable after this moment. Backfilled as immediately
-- payable: those conversions are long past any refund window.
ALTER TABLE referral_conversions ADD COLUMN IF NOT EXISTS hold_until timestamptz;

-- Renewal lookups walk a single subscriber's history to find when their
-- 12-month window opened.
CREATE INDEX IF NOT EXISTS idx_referral_conversions_user_created
  ON referral_conversions(referred_user_id, created_at);

-- One affiliate link per account, enforced at the database rather than in the
-- function that creates them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_one_per_owner
  ON referral_codes(owner_user_id) WHERE owner_user_id IS NOT NULL;
