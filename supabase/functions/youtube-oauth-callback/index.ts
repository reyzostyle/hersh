import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  code: string;
  userId: string;
  redirectUri: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { code, userId, redirectUri }: RequestBody = await req.json();

    const clientId = Deno.env.get('YOUTUBE_CLIENT_ID');
    const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[youtube-oauth-callback] Token exchange failed:', errText);
      throw new Error(`Failed to exchange code for tokens: ${errText}`);
    }

    const tokens = await tokenResponse.json();
    console.log('[youtube-oauth-callback] Token exchange success, has refresh_token:', !!tokens.refresh_token);

    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + (tokens.expires_in || 3600));

    const upsertData: Record<string, unknown> = {
      user_id: userId,
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

    if (error) throw new Error(`DB error: ${error.message} (code: ${error.code})`);

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
