-- Onboarding drip: a queue, not a sender.
--
-- The trigger below runs INSIDE the signup transaction, so it must never do
-- network I/O — an HTTP call to an email provider here would add its latency
-- (and its outages) to every single sign-up, and a provider timeout would
-- roll the new user back. So signup only writes four rows and returns; a
-- separate worker (functions/send-onboarding-emails) delivers them later.
--
-- Idempotency is enforced by the (user_id, step) unique index rather than by
-- the worker remembering anything: a retried or double-fired trigger cannot
-- create a second copy of the same email, and the worker's claim step is a
-- conditional UPDATE, so two concurrent runs can't both grab the same row.

CREATE TABLE IF NOT EXISTS email_drip (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  -- 1 = welcome, 2 = competitors, 3 = hook/script, 4 = upgrade
  step        smallint NOT NULL CHECK (step BETWEEN 1 AND 4),
  send_at     timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts    smallint NOT NULL DEFAULT 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_drip_user_step_idx ON email_drip (user_id, step);
-- The worker's only query: due, still pending, oldest first.
CREATE INDEX IF NOT EXISTS email_drip_due_idx ON email_drip (send_at) WHERE status = 'pending';

-- Per-user mail preferences. Separate from user_tokens because it must exist
-- for every signup regardless of whether that row does, and because the
-- unsubscribe token is a public-facing capability: it travels in a URL, so it
-- gets its own random value rather than reusing the user id.
CREATE TABLE IF NOT EXISTS email_prefs (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unsubscribed_at  timestamptz,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_prefs_token_idx ON email_prefs (unsubscribe_token);

-- Both tables are service-role only. RLS is enabled with NO policies, which
-- denies every anon/authenticated request outright — the queue holds email
-- addresses and the tokens are unsubscribe capabilities, so nothing here is
-- reachable from the client. The service role bypasses RLS by design.
ALTER TABLE email_drip  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_prefs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION enqueue_onboarding_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Users created without an address (shouldn't happen on the current auth
  -- providers, but phone/anonymous sign-ins exist) have nothing to send to.
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO email_prefs (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO email_drip (user_id, email, step, send_at)
  VALUES
    (NEW.id, NEW.email, 1, now()),
    (NEW.id, NEW.email, 2, now() + interval '24 hours'),
    (NEW.id, NEW.email, 3, now() + interval '3 days'),
    (NEW.id, NEW.email, 4, now() + interval '5 days')
  ON CONFLICT (user_id, step) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_enqueue_emails ON auth.users;
CREATE TRIGGER on_auth_user_created_enqueue_emails
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION enqueue_onboarding_emails();
