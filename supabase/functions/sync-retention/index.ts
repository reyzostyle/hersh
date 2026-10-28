import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { syncUser } from '../_shared/retention-sync.ts';
import { freshAccessToken } from '../_shared/youtube-token.ts';
import { fetchStats, fetchCurve, perSecond, findDrops, mmss, rawReport, ownVideoRetention, retentionBlock, loadUsual } from '../_shared/retention.ts';

// Real retention for the creator's own Shorts into video_retention, and the
// lessons drawn from it (_shared/retention-sync.ts).
//
// - signed in (Settings, or the app after it syncs the uploads): the caller;
//   with videoId, just that Short, its transcript read if it has none;
// - pg_cron, hourly, with x-cron-secret: whoever has not been synced for a
//   day, oldest first, until the time budget is spent. A body with userId
//   runs that one account; with debug and videoId it also returns the raw
//   Analytics answer, for checking the numbers against Studio.

const CORS = corsHeaders({ methods: 'POST, OPTIONS' });
const CRON_BUDGET_MS = 110_000;
const STALE_MS = 20 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  const started = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );
    const body = await req.json().catch(() => ({}));

    const provided = req.headers.get('x-cron-secret');
    if (provided) {
      const cronSecret = Deno.env.get('CRON_SECRET');
      if (!cronSecret || provided !== cronSecret) return json({ error: 'Unauthorized' }, 401);

      if (typeof body.userId === 'string' && body.userId) {
        if (body.debug && typeof body.videoId === 'string') {
          const token = await freshAccessToken(supabase, body.userId);
          if (!token) return json({ error: 'not_connected' });
          // Any report, for checking a number against Studio by hand.
          if (body.query && typeof body.query === 'object') return json(await rawReport(token, body.query));
          // Exactly what a prompt gets for this video.
          if (body.block) {
            const { row } = await ownVideoRetention(supabase, body.userId, body.videoId, { token, beats: true });
            return json({ block: row ? retentionBlock(row, await loadUsual(supabase, body.userId, body.videoId), { script: true }) : null });
          }
          const { data: v } = await supabase.from('videos').select('duration, title')
            .eq('user_id', body.userId).eq('video_id', body.videoId).maybeSingle();
          const stats = (await fetchStats(token, [body.videoId])).get(body.videoId) ?? null;
          const curve = await fetchCurve(token, body.videoId);
          const sec = curve.length && v?.duration ? perSecond(curve, v.duration) : [];
          return json({
            title: v?.title, duration: v?.duration, stats,
            stayed: stats?.engagedViews != null && stats.views ? stats.engagedViews / stats.views : null,
            perSecond: sec.map((p, s) => `${mmss(s)} ${Math.round(p)}%`),
            drops: findDrops(sec),
            rawFirst: curve.slice(0, 12),
          });
        }
        const r = await syncUser(supabase, body.userId, {
          beatsBudget: Number(body.beats) || 6, deadline: started + CRON_BUDGET_MS, force: !!body.force,
        });
        return json(r);
      }

      const { data: users } = await supabase
        .from('user_tokens').select('user_id, retention_synced_at')
        .not('refresh_token', 'is', null)
        .or(`retention_synced_at.is.null,retention_synced_at.lt.${new Date(Date.now() - STALE_MS).toISOString()}`)
        .order('retention_synced_at', { ascending: true, nullsFirst: true })
        .limit(25);
      let done = 0, failed = 0;
      for (const u of users ?? []) {
        if (Date.now() - started > CRON_BUDGET_MS - 25_000) break;
        try {
          await syncUser(supabase, u.user_id, { beatsBudget: 4, deadline: started + CRON_BUDGET_MS });
          done++;
        } catch (e) {
          failed++;
          console.error(`[sync-retention] ${u.user_id} failed:`, e);
        }
      }
      return json({ done, failed, waiting: Math.max(0, (users?.length ?? 0) - done - failed) });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // One of their Shorts, with what is said in it: the retention screen asks
    // for this when a curve has no transcript yet, or when it opens a Short
    // that is not stored. Theirs is checked by the read itself: Analytics
    // answers for channel==MINE only.
    if (typeof body.videoId === 'string' && /^[\w-]{11}$/.test(body.videoId)) {
      const { row, error } = await ownVideoRetention(supabase, user.id, body.videoId, { beats: true });
      return json({ row, error });
    }

    const r = await syncUser(supabase, user.id, { beatsBudget: 4, deadline: started + CRON_BUDGET_MS, force: !!body.force });
    return json(r);
  } catch (e) {
    console.error('[sync-retention]', e);
    return json({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
  }
});
