-- Post-signup onboarding: track completion and store the user's stated goal.
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS goal text;

-- Existing users shouldn't be forced through onboarding; only new signups
-- (which get a fresh row defaulting to false, or no row yet) should see it.
UPDATE user_tokens SET onboarding_completed = true WHERE onboarding_completed = false;
