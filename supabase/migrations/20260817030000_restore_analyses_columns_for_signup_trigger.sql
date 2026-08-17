-- Incident 2026-08-17: the previous migration (20260817010000) dropped these
-- three columns as dead — dead in application code, which was true, but not
-- in the database. `create_user_tokens_on_signup()`, the AFTER INSERT
-- trigger on auth.users that provisions each new user's user_tokens row, was
-- created directly via the SQL editor at some point and was never captured
-- as a migration, so nothing in this folder could catch the dependency. Its
-- INSERT wrote analyses_used, so with the column gone that insert threw
-- inside the signup transaction and rolled auth.users back with it — every
-- signup failed, Google and email/password alike, from the moment the drop
-- shipped.
--
-- Fixed properly below by rewriting the trigger function itself to stop
-- writing that column, rather than leaving these columns as a permanent
-- crutch. This first block restores them just long enough for that rewrite
-- to run without erroring on a mid-migration mismatch; nothing re-reads them
-- afterwards.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS analyses_used integer NOT NULL DEFAULT 0;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS analyses_reset_at timestamptz;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS bonus_analyses integer NOT NULL DEFAULT 0;

-- Now brought under version control. SECURITY DEFINER is required, not
-- optional: user_tokens has had RLS enabled since the very first schema
-- migration (20260310191614), and the role that fires this trigger
-- (Supabase Auth's internal role, not the caller) has no policy granting it
-- write access — only running as the function's owner gets past RLS here.
CREATE OR REPLACE FUNCTION public.create_user_tokens_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_tokens (user_id, access_token, token_expiry, plan)
  VALUES (NEW.id, '', NOW(), 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop the crutch for real now that nothing in the database writes to it.
ALTER TABLE user_tokens DROP COLUMN IF EXISTS analyses_used;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS analyses_reset_at;
ALTER TABLE user_tokens DROP COLUMN IF EXISTS bonus_analyses;
