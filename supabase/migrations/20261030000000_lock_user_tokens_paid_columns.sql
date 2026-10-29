-- The update policy on user_tokens lets a signed-in user write any column of
-- their own row, which includes plan, credits_used and bonus_credits: one call
-- from the browser console was a free Pro plan. Row-level security cannot say
-- which columns, so the table privileges do: clients may write only what the
-- web app and the iOS app actually write (see SettingsPage, Onboarding,
-- SettingsView, BrainSection, YouTubeSection). Everything about money and
-- usage is written by edge functions with the service role, which these
-- grants do not touch.
REVOKE INSERT, UPDATE, DELETE ON public.user_tokens FROM anon, authenticated;

GRANT UPDATE (
  channel_description,
  creator_level,
  brain_overrides,
  onboarding_completed,
  access_token,
  refresh_token,
  youtube_channel_name,
  youtube_channel_thumbnail,
  updated_at
) ON public.user_tokens TO authenticated;

-- Only for the rare account whose row the signup trigger did not create.
GRANT INSERT (
  user_id,
  access_token,
  refresh_token,
  channel_description,
  creator_level,
  onboarding_completed
) ON public.user_tokens TO authenticated;
