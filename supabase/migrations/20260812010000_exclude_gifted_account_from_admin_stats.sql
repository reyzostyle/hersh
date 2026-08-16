-- osterholtfinn@gmail.com was manually bumped to the agency plan as a gift
-- (no Stripe subscription behind it) — same reasoning as the other excluded
-- accounts in 20260801000000: it doesn't represent real revenue or growth
-- and would otherwise inflate plan counts / MRR-adjacent numbers even though
-- it has no plan_events row today.
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
  excluded_emails text[] := ARRAY['reyzostyle@gmail.com', 'julianpockl@gmail.com', 'qqnikitin@gmail.com', 'osterholtfinn@gmail.com'];
  excluded_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO excluded_ids
  FROM auth.users WHERE email = ANY(excluded_emails);

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM auth.users WHERE NOT (email = ANY(excluded_emails))),
    'new_users_today', (SELECT count(*) FROM auth.users WHERE created_at >= today_start AND NOT (email = ANY(excluded_emails))),
    'new_users_28d', (SELECT count(*) FROM auth.users WHERE created_at >= window_start AND NOT (email = ANY(excluded_emails))),
    'active_users_28d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= window_start AND NOT (email = ANY(excluded_emails))),
    'daily_signups', (
      SELECT coalesce(jsonb_agg(cnt ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT gs::date AS d, (SELECT count(*) FROM auth.users u WHERE u.created_at::date = gs::date AND NOT (u.email = ANY(excluded_emails))) AS cnt
        FROM generate_series((today_start - interval '27 days')::date, today_start::date, interval '1 day') gs
      ) t
    ),
    'plan_free', (SELECT count(*) FROM user_tokens WHERE (plan = 'free' OR plan IS NULL) AND NOT (user_id = ANY(excluded_ids))),
    'plan_plus', (SELECT count(*) FROM user_tokens WHERE plan = 'pro' AND NOT (user_id = ANY(excluded_ids))),
    'plan_pro', (SELECT count(*) FROM user_tokens WHERE plan = 'agency' AND NOT (user_id = ANY(excluded_ids))),
    'new_subs_today', (SELECT count(*) FROM plan_events WHERE event_type = 'subscribed' AND created_at >= today_start AND NOT (user_id = ANY(excluded_ids))),
    'new_subs_28d', (SELECT count(*) FROM plan_events WHERE event_type = 'subscribed' AND created_at >= window_start AND NOT (user_id = ANY(excluded_ids))),
    'cancels_28d', (SELECT count(*) FROM plan_events WHERE event_type = 'cancelled' AND created_at >= window_start AND NOT (user_id = ANY(excluded_ids))),
    'revenue_28d_cents', (SELECT coalesce(sum(amount_cents), 0) FROM plan_events WHERE event_type = 'subscribed' AND created_at >= window_start AND NOT (user_id = ANY(excluded_ids))),
    'daily_subs', (
      SELECT coalesce(jsonb_agg(cnt ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT gs::date AS d, (SELECT count(*) FROM plan_events p WHERE p.event_type = 'subscribed' AND p.created_at::date = gs::date AND NOT (p.user_id = ANY(excluded_ids))) AS cnt
        FROM generate_series((today_start - interval '27 days')::date, today_start::date, interval '1 day') gs
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO service_role;
