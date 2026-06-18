import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const REDIRECT_URI = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1/notion-oauth-callback';
const APP_URL = 'https://hershymedia.com';

function redirect(status: 'connected' | 'error') {
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}/?notion=${status}` } });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // userId
    const error = url.searchParams.get('error');

    if (error || !code || !state) {
      console.error('[notion-oauth-callback] missing code/state or error:', error);
      return redirect('error');
    }

    const clientId = Deno.env.get('NOTION_CLIENT_ID')!;
    const clientSecret = Deno.env.get('NOTION_CLIENT_SECRET')!;
    const basic = btoa(`${clientId}:${clientSecret}`);

    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });

    if (!tokenRes.ok) {
      console.error('[notion-oauth-callback] token exchange failed:', tokenRes.status, await tokenRes.text());
      return redirect('error');
    }

    const tok = await tokenRes.json();

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: upsertErr } = await supabase
      .from('notion_connections')
      .upsert({
        user_id: state,
        access_token: tok.access_token,
        workspace_id: tok.workspace_id ?? null,
        workspace_name: tok.workspace_name ?? null,
        bot_id: tok.bot_id ?? null,
        database_id: null,
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error('[notion-oauth-callback] upsert failed:', upsertErr);
      return redirect('error');
    }

    return redirect('connected');
  } catch (e) {
    console.error('[notion-oauth-callback] Error:', e);
    return redirect('error');
  }
});
