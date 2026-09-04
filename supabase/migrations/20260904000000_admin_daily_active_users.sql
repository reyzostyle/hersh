-- Daily active users on the admin dashboard.
--
-- Measured from work done, not from sign-ins. auth.users only keeps
-- last_sign_in_at, a single timestamp that today's login overwrites, so a
-- 28-day series built from it would read 0 for every past day and today's
-- number in the last slot. It cannot be reconstructed, only recorded going
-- forward.
--
-- analyses and chat_messages both carry user_id and created_at and are the
-- only two things a creator can actually DO here, so a user who appears in
-- either on a given day used the product that day. That is the number worth
-- watching anyway: signing in and leaving is not usage.
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
    'active_users_today', (
      SELECT count(*) FROM (
        SELECT a.user_id FROM analyses a
          WHERE a.created_at >= today_start AND NOT (a.user_id = ANY(excluded_ids))
        UNION
        SELECT c.user_id FROM chat_messages c
          WHERE c.created_at >= today_start AND NOT (c.user_id = ANY(excluded_ids))
      ) act
    ),
    'active_users_7d', (
      SELECT count(*) FROM (
        SELECT a.user_id FROM analyses a
          WHERE a.created_at >= now() - interval '7 days' AND NOT (a.user_id = ANY(excluded_ids))
        UNION
        SELECT c.user_id FROM chat_messages c
          WHERE c.created_at >= now() - interval '7 days' AND NOT (c.user_id = ANY(excluded_ids))
      ) act
    ),
    'daily_active', (
      SELECT coalesce(jsonb_agg(cnt ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT gs::date AS d, (
          SELECT count(*) FROM (
            SELECT a.user_id FROM analyses a
              WHERE a.created_at::date = gs::date AND NOT (a.user_id = ANY(excluded_ids))
            UNION
            SELECT c.user_id FROM chat_messages c
              WHERE c.created_at::date = gs::date AND NOT (c.user_id = ANY(excluded_ids))
          ) act
        ) AS cnt
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
