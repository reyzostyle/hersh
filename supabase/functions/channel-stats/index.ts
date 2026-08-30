import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Channel-level numbers for the Analytics tab. Read-only, no credits: this is
// the user's own data coming back from Google, not a model call, and charging
// for a page that refreshes itself would be charging for a clock tick.
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('YOUTUBE_CLIENT_ID')!,
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('user_id', user.id)
      .maybeSingle();

    // Not an error: most of the app works without a connected channel, and the
    // page says "connect YouTube" rather than showing a failure.
    if (!tokenRow?.access_token) {
      return new Response(JSON.stringify({ connected: false }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = tokenRow.access_token as string;
    const expiry = tokenRow.token_expiry ? new Date(tokenRow.token_expiry) : new Date(0);
    if (expiry < new Date() && tokenRow.refresh_token) {
      accessToken = await refreshAccessToken(tokenRow.refresh_token);
      const next = new Date();
      next.setSeconds(next.getSeconds() + 3600);
      await supabase.from('user_tokens')
        .update({ access_token: accessToken, token_expiry: next.toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    const auth = { headers: { Authorization: `Bearer ${accessToken}` } };

    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', auth);
    if (!chRes.ok) throw new Error(`Channel fetch failed: ${await chRes.text()}`);
    const ch = (await chRes.json()).items?.[0];

    // Last 28 days, which is the window YouTube Studio itself leads with.
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];
    let views28 = 0, subsGained28 = 0, watchMinutes28 = 0;
    try {
      const aRes = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${start}&endDate=${end}&metrics=views,subscribersGained,estimatedMinutesWatched`,
        auth);
      if (aRes.ok) {
        const row = (await aRes.json()).rows?.[0];
        if (row) { views28 = row[0] ?? 0; subsGained28 = row[1] ?? 0; watchMinutes28 = row[2] ?? 0; }
      }
    } catch { /* the scope may be missing; the totals below still render */ }

    return new Response(JSON.stringify({
      connected: true,
      channelTitle: ch?.snippet?.title ?? '',
      thumbnail: ch?.snippet?.thumbnails?.default?.url ?? '',
      subscribers: parseInt(ch?.statistics?.subscriberCount ?? '0'),
      totalViews: parseInt(ch?.statistics?.viewCount ?? '0'),
      videoCount: parseInt(ch?.statistics?.videoCount ?? '0'),
      views28, subsGained28, watchMinutes28,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[channel-stats]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
