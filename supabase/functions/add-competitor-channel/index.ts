import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Verifies the JWT signature via the auth server (not just decoding it) and
// returns the authenticated user id. Throws on any invalid/forged token.
async function getUserIdFromToken(supabase: any, token: string): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('invalid token');
  return user.id;
}

async function resolveChannelId(channelUrl: string, ytApiKey: string): Promise<{ channelId: string; channelName: string; channelThumbnail: string }> {
  const url = channelUrl.trim();

  // Extract path from URL
  let path = url;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    path = parsed.pathname;
  } catch {
    // use as-is
  }

  // /channel/UCxxxxxxx
  const channelMatch = path.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  if (channelMatch) {
    const channelId = channelMatch[1];
    const info = await fetchChannelInfo(channelId, ytApiKey);
    return info;
  }

  // /@handle
  const handleMatch = path.match(/\/@([^/]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    return await searchChannelByHandle(handle, ytApiKey);
  }

  // /c/name or /user/name
  const nameMatch = path.match(/\/(?:c|user)\/([^/]+)/);
  if (nameMatch) {
    const name = nameMatch[1];
    return await searchChannelByHandle(name, ytApiKey);
  }

  // Bare handle like @somechannel
  const bareHandle = url.match(/^@?([a-zA-Z0-9_.-]+)$/);
  if (bareHandle) {
    return await searchChannelByHandle(bareHandle[1], ytApiKey);
  }

  throw new Error('Could not parse channel URL. Try a URL like youtube.com/@channelname or youtube.com/channel/UCxxxxxxx');
}

async function fetchChannelInfo(channelId: string, ytApiKey: string): Promise<{ channelId: string; channelName: string; channelThumbnail: string }> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?id=${channelId}&part=snippet&key=${ytApiKey}`
  );
  if (!res.ok) throw new Error(`YouTube API error: ${await res.text()}`);
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('Channel not found');
  return {
    channelId,
    channelName: item.snippet.title,
    channelThumbnail: item.snippet.thumbnails?.default?.url || '',
  };
}

async function searchChannelByHandle(handle: string, ytApiKey: string): Promise<{ channelId: string; channelName: string; channelThumbnail: string }> {
  // First try the forHandle parameter (works for @handles)
  const handleRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(handle)}&part=snippet&key=${ytApiKey}`
  );
  if (handleRes.ok) {
    const data = await handleRes.json();
    const item = data.items?.[0];
    if (item) {
      return {
        channelId: item.id,
        channelName: item.snippet.title,
        channelThumbnail: item.snippet.thumbnails?.default?.url || '',
      };
    }
  }

  // Fall back to search
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(handle)}&type=channel&part=snippet&maxResults=1&key=${ytApiKey}`
  );
  if (!searchRes.ok) throw new Error(`YouTube search error: ${await searchRes.text()}`);
  const searchData = await searchRes.json();
  const item = searchData.items?.[0];
  if (!item) throw new Error(`Channel not found for: ${handle}`);
  return {
    channelId: item.snippet.channelId,
    channelName: item.snippet.title,
    channelThumbnail: item.snippet.thumbnails?.default?.url || '',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ytApiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!ytApiKey) throw new Error('YouTube API key not configured');

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');

    let userId: string;
    try {
      userId = await getUserIdFromToken(supabase, token);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders });
    }

    // Plan check — Competitors is Plus+
    const { data: planRow } = await supabase
      .from('user_tokens').select('plan').eq('user_id', userId).maybeSingle();
    const userPlan = planRow?.plan || 'free';
    if (userPlan === 'free') {
      return new Response(JSON.stringify({ error: 'upgrade_required', plan_required: 'plus' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { channelUrl } = await req.json();
    if (!channelUrl) {
      return new Response(JSON.stringify({ error: 'channelUrl is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check existing channel count
    const { data: existing, error: countError } = await supabase
      .from('competitor_channels')
      .select('id')
      .eq('user_id', userId);

    if (countError) throw countError;
    if ((existing?.length ?? 0) >= 5) {
      return new Response(
        JSON.stringify({ error: 'You can track up to 5 competitor channels. Remove one to add another.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[add-competitor-channel] Resolving channel:', channelUrl);
    const { channelId, channelName, channelThumbnail } = await resolveChannelId(channelUrl, ytApiKey);
    console.log('[add-competitor-channel] Resolved:', channelId, channelName);

    const { data: inserted, error: insertError } = await supabase
      .from('competitor_channels')
      .upsert(
        { user_id: userId, channel_id: channelId, channel_url: channelUrl, channel_title: channelName, thumbnail_url: channelThumbnail },
        { onConflict: 'user_id,channel_id' }
      )
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, channel: inserted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[add-competitor-channel] Error:', error);
    const msg = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error !== null && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
