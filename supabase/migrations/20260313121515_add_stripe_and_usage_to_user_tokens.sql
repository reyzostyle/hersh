/*
  # Add Stripe subscription and usage tracking to user_tokens

  ## Summary
  Extends the user_tokens table with subscription plan tracking, analysis usage counters,
  and Stripe customer/subscription identifiers.

  ## Changes to user_tokens
  - `plan` (text, default 'free') — current subscription plan: 'free', 'pro', or 'agency'
  - `analyses_used` (integer, default 0) — number of analyses run in current period
  - `analyses_reset_at` (timestamptz) — when the monthly counter resets (null for free plan)
  - `stripe_customer_id` (text) — Stripe customer ID for this user
  - `stripe_subscription_id` (text) — active Stripe subscription ID

  ## Notes
  - Free plan: 3 analyses total lifetime cap
  - Pro plan: 30 analyses per month
  - Agency plan: 200 analyses per month
  - reset_at is set to 30 days from subscription start and refreshed on each cycle
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'plan'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN plan text NOT NULL DEFAULT 'free';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'analyses_used'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN analyses_used integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'analyses_reset_at'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN analyses_reset_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN stripe_customer_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN stripe_subscription_id text;
  END IF;
END $$;
