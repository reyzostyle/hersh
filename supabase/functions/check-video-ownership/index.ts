import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to refresh access token: ${errText}`);
  }

  const tokens = await tokenResponse.json();
  return tokens.access_token;
}

// The connected account's own channel id (authoritative).
async function getOwnChannelId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.id ?? null;
}

// The channel that owns a given video (public snippet data).
async function getVideoChannelId(
  accessToken: string,
  videoId: string
): Promise<{ channelId: string | null; title: string | null }> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return { channelId: null, title: null };
  const data = await res.json();
  const item = data.items?.[0];
  return {
    channelId: item?.snippet?.channelId ?? null,
    title: item?.snippet?.title ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { videoId } = await req.json().catch(() => ({ videoId: null }));
    if (!videoId || typeof videoId !== 'string') return json({ error: 'Missing videoId' }, 400);

    const { data: tokenData } = await supabase
      .from('user_tokens')
      .select('access_token, refresh_token, token_expiry')
      .eq('user_id', user.id)
      .maybeSingle();

    // No YouTube account connected — can't determine ownership.
    if (!tokenData?.access_token) {
      return json({ connected: false, isOwn: false });
    }

    let accessToken = tokenData.access_token as string;
    const expiry = tokenData.token_expiry ? new Date(tokenData.token_expiry) : new Date(0);
    if (expiry < new Date() && tokenData.refresh_token) {
      accessToken = await refreshAccessToken(tokenData.refresh_token);
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + 3600);
      await supabase
        .from('user_tokens')
        .update({
          access_token: accessToken,
          token_expiry: newExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    }

    const [ownChannelId, video] = await Promise.all([
      getOwnChannelId(accessToken),
      getVideoChannelId(accessToken, videoId),
    ]);

    const isOwn =
      !!ownChannelId && !!video.channelId && ownChannelId === video.channelId;

    return json({
      connected: true,
      isOwn,
      videoChannelId: video.channelId,
      ownChannelId,
      videoTitle: video.title,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Ownership check failed' }, 500);
  }
});
