import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const REDIRECT_URI = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1/youtube-oauth-callback';
const APP_URL = 'https://hersh.live';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Server-side GET callback from Google
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // userId passed via state
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      return Response.redirect(`${APP_URL}?youtube_error=${errorParam}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${APP_URL}?youtube_error=missing_params`, 302);
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
        return Response.redirect(`${APP_URL}?youtube_error=${encodeURIComponent(errText)}`, 302);
      }

      const tokens = await tokenResponse.json();
      console.log('[GET] Token exchange success, has refresh_token:', !!tokens.refresh_token);

      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + (tokens.expires_in || 3600));

      const upsertData: Record<string, unknown> = {
        user_id: state,
        access_token: tokens.access_token,
        token_expiry: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (tokens.refresh_token) {
        upsertData.refresh_token = tokens.refresh_token;
      }

      const { error } = await supabase
        .from('user_tokens')
        .upsert(upsertData, { onConflict: 'user_id' });

      if (error) {
        console.error('[GET] DB error:', error);
        return Response.redirect(`${APP_URL}?youtube_error=${encodeURIComponent(error.message)}`, 302);
      }

      return Response.redirect(`${APP_URL}?youtube_connected=true`, 302);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GET] Fatal error:', msg);
      return Response.redirect(`${APP_URL}?youtube_error=${encodeURIComponent(msg)}`, 302);
    }
  }

  // Legacy POST support (kept for compatibility)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    );

    const { code, userId, redirectUri } = await req.json();
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
