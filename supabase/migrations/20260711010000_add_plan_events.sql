-- Append-only log of subscription events (new + cancelled), populated by the
-- Stripe webhook. user_tokens only holds the *current* plan, so without this
-- there's no way to answer "how many people subscribed today" — this table
-- powers the admin dashboard's daily/28-day metrics.
CREATE TABLE IF NOT EXISTS plan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('subscribed', 'cancelled')),
  amount_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_events_created_at_idx ON plan_events (created_at);

-- No user-facing RLS policies: this table is only ever read by the
-- admin-stats edge function via the service-role key, and only ever written
-- by the stripe-webhook edge function (also service-role). Row Level
-- Security is enabled with no policies, so it's inaccessible from the client
-- entirely (anon/authenticated roles get zero rows either way).
ALTER TABLE plan_events ENABLE ROW LEVEL SECURITY;
