-- Aggregate stats for the hidden admin dashboard. SECURITY DEFINER so it can
-- read auth.users (not otherwise exposed to PostgREST); execute is revoked
-- from anon/authenticated so the only caller is the admin-stats edge
-- function, which runs with the service-role key after verifying the
-- caller's email server-side.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now());
  window_start timestamptz := now() - interval '28 days';
BEGIN
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM auth.users),
    'new_users_today', (SELECT count(*) FROM auth.users WHERE created_at >= today_start),
    'new_users_28d', (SELECT count(*) FROM auth.users WHERE created_at >= window_start),
    'active_users_28d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= window_start),
    'daily_signups', (
      SELECT coalesce(jsonb_agg(cnt ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT gs::date AS d, (SELECT count(*) FROM auth.users u WHERE u.created_at::date = gs::date) AS cnt
        FROM generate_series((today_start - interval '27 days')::date, today_start::date, interval '1 day') gs
      ) t
    ),
    'plan_free', (SELECT count(*) FROM user_tokens WHERE plan = 'free' OR plan IS NULL),
    'plan_plus', (SELECT count(*) FROM user_tokens WHERE plan = 'pro'),
    'plan_pro', (SELECT count(*) FROM user_tokens WHERE plan = 'agency'),
    'new_subs_today', (SELECT count(*) FROM plan_events WHERE event_type = 'subscribed' AND created_at >= today_start),
    'new_subs_28d', (SELECT count(*) FROM plan_events WHERE event_type = 'subscribed' AND created_at >= window_start),
    'cancels_28d', (SELECT count(*) FROM plan_events WHERE event_type = 'cancelled' AND created_at >= window_start),
    'revenue_28d_cents', (SELECT coalesce(sum(amount_cents), 0) FROM plan_events WHERE event_type = 'subscribed' AND created_at >= window_start),
    'daily_subs', (
      SELECT coalesce(jsonb_agg(cnt ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT gs::date AS d, (SELECT count(*) FROM plan_events p WHERE p.event_type = 'subscribed' AND p.created_at::date = gs::date) AS cnt
        FROM generate_series((today_start - interval '27 days')::date, today_start::date, interval '1 day') gs
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO service_role;
