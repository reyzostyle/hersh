import { corsHeaders } from '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { buildBrain } from '../_shared/brain.ts';

const REDIRECT_URI = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1/youtube-oauth-callback';
const APP_URL = 'https://chumoku.co';

const CORS = corsHeaders({ methods: 'GET, POST, PUT, DELETE, OPTIONS' });

// The ids of a channel's uploads, newest first, up to `max`.
async function uploadIds(accessToken: string, max = 200): Promise<Set<string> | null> {
  const h = { Authorization: `Bearer ${accessToken}` };
  const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: h });
  if (!ch.ok) return null;
  const playlist = (await ch.json()).items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlist) return new Set();
  const ids = new Set<string>();
  let page = '';
  while (ids.size < max) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${playlist}${page ? `&pageToken=${page}` : ''}`, { headers: h });
    if (!r.ok) return null;
    const j = await r.json();
    for (const it of j.items ?? []) if (it.contentDetails?.videoId) ids.add(it.contentDetails.videoId);
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return ids;
}

// A different YouTube account was connected (2026-10-30): everything read off
// the old one goes, or its Shorts, their retention and what was learned from
// them keep feeding every prompt as if they were this channel's. Whatever is
// not among the new channel's uploads is the old channel's. Reconnecting the
// same channel deletes nothing.
// deno-lint-ignore no-explicit-any
async function forgetOtherChannel(supabase: any, userId: string, accessToken: string): Promise<boolean> {
  const mine = await uploadIds(accessToken);
  if (!mine) return false; // could not list: leave everything rather than guess
  const { data: rows } = await supabase.from('videos').select('video_id').eq('user_id', userId);
  const { data: ret } = await supabase.from('video_retention').select('video_id').eq('user_id', userId);
  const foreign = [...new Set([...(rows ?? []), ...(ret ?? [])].map((r: { video_id: string }) => r.video_id))]
    .filter(id => !mine.has(id));
  if (!foreign.length) return false;
  for (let i = 0; i < foreign.length; i += 100) {
    const batch = foreign.slice(i, i + 100);
    await supabase.from('videos').delete().eq('user_id', userId).in('video_id', batch);
    await supabase.from('video_retention').delete().eq('user_id', userId).in('video_id', batch);
  }
  await supabase.from('user_tokens').update({
    channel_scan: null, channel_scan_at: null,
    retention_lessons: null, retention_synced_at: null, retention_error: null,
    voice: null,
  }).eq('user_id', userId);
  console.log(`[youtube-oauth-callback] ${userId}: new channel, forgot ${foreign.length} videos of the old one`);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  // Server-side GET callback from Google
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    // userId passed via state; the iOS app appends ":ios" so the browser
    // sheet it opened is closed by a redirect to its own scheme.
    const [state, from] = (url.searchParams.get('state') ?? '').split(':');
    const back = from === 'ios' ? 'chumoku://youtube' : APP_URL;
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      return Response.redirect(`${back}?youtube_error=${errorParam}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${back}?youtube_error=missing_params`, 302);
    }

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
      );

      const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
      const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

      console.log('[GET] Exchanging code, redirectUri:', REDIRECT_URI);

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error('[GET] Token exchange failed:', errText);
        return Response.redirect(`${back}?youtube_error=${encodeURIComponent(errText)}`, 302);
      }

      const tokens = await tokenResponse.json();
      console.log('[GET] Token exchange success, has refresh_token:', !!tokens.refresh_token);

      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + (tokens.expires_in || 3600));

      // Fetch YouTube channel name
      let youtubeChannelName = '';
      let youtubeChannelThumbnail = '';
      try {
        const channelRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        if (channelRes.ok) {
          const channelData = await channelRes.json();
          const ch = channelData.items?.[0];
          if (ch) {
            youtubeChannelName = ch.snippet.title || '';
            youtubeChannelThumbnail = ch.snippet.thumbnails?.default?.url || '';
          }
        }
      } catch (e) {
        console.log('[GET] Could not fetch channel name:', e);
      }

      const upsertData: Record<string, unknown> = {
        user_id: state,
        access_token: tokens.access_token,
        token_expiry: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
        youtube_channel_name: youtubeChannelName || null,
        youtube_channel_thumbnail: youtubeChannelThumbnail || null,
      };
      if (tokens.refresh_token) {
        upsertData.refresh_token = tokens.refresh_token;
      }

      const { error } = await supabase
        .from('user_tokens')
        .upsert(upsertData, { onConflict: 'user_id' });

      if (error) {
        console.error('[GET] DB error:', error);
        return Response.redirect(`${back}?youtube_error=${encodeURIComponent(error.message)}`, 302);
      }

      // The brain was read off the old channel too: rebuild it off this one,
      // after the redirect so connecting does not wait on a model call.
      try {
        if (await forgetOtherChannel(supabase, state, tokens.access_token)) {
          // deno-lint-ignore no-explicit-any
          (globalThis as any).EdgeRuntime?.waitUntil(buildBrain(supabase, state).catch(e => console.error('[GET] rebuild brain', e)));
        }
      } catch (e) {
        console.error('[GET] forget old channel', e);
      }

      return Response.redirect(`${back}?youtube_connected=true`, 302);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GET] Fatal error:', msg);
      return Response.redirect(`${back}?youtube_error=${encodeURIComponent(msg)}`, 302);
    }
  }

  // Legacy POST support (kept for compatibility)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const userId = user.id;

    const { code, redirectUri } = await req.json();
    console.log('[POST] redirectUri:', redirectUri);

    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Failed to exchange code for tokens: ${errText}`);
    }

    const tokens = await tokenResponse.json();

    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + (tokens.expires_in || 3600));

    const upsertData: Record<string, unknown> = {
      user_id: userId,
      access_token: tokens.access_token,
      token_expiry: expiryDate.toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) upsertData.refresh_token = tokens.refresh_token;

    const { error } = await supabase
      .from('user_tokens')
      .upsert(upsertData, { onConflict: 'user_id' });

    if (error) throw new Error(`DB error: ${error.message}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
