-- In-app purchases from the iOS app (apple-iap, apple-notifications).
-- A subscription bought through Apple is the same plan as one bought through
-- Stripe; these columns say which store it came from and when it runs out.
ALTER TABLE public.user_tokens ADD COLUMN IF NOT EXISTS apple_original_transaction_id text;
ALTER TABLE public.user_tokens ADD COLUMN IF NOT EXISTS apple_product_id text;
ALTER TABLE public.user_tokens ADD COLUMN IF NOT EXISTS apple_expires_at timestamptz;

-- One Apple subscription feeds one account.
CREATE UNIQUE INDEX IF NOT EXISTS user_tokens_apple_original_transaction_id
  ON public.user_tokens (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

-- Every transaction handled once: a renewal resets credits once, a top-up
-- credits once, however many times the app and Apple's notifications report it.
CREATE TABLE IF NOT EXISTS public.apple_transactions (
  transaction_id text PRIMARY KEY,
  original_transaction_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id text NOT NULL,
  environment text,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.apple_transactions ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role reads or writes it.
