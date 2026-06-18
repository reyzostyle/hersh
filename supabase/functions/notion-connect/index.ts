import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const REDIRECT_URI = 'https://ezlousklksipvwuinpzq.supabase.co/functions/v1/notion-oauth-callback';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify the JWT signature via the auth server
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const { action } = await req.json().catch(() => ({ action: 'status' }));

    // ── status: is the user connected? (never returns the token) ──────────────
    if (action === 'status') {
      const { data } = await supabase
        .from('notion_connections')
        .select('workspace_name, created_at')
        .eq('user_id', userId)
        .maybeSingle();
      return json({ connected: !!data, workspace_name: data?.workspace_name ?? null });
    }

    // ── disconnect ────────────────────────────────────────────────────────────
    if (action === 'disconnect') {
      await supabase.from('notion_connections').delete().eq('user_id', userId);
      return json({ ok: true });
    }

    // ── start: build the Notion authorize URL (paid plans only) ───────────────
    if (action === 'start') {
      const { data: planRow } = await supabase.from('user_tokens').select('plan').eq('user_id', userId).maybeSingle();
      if ((planRow?.plan || 'free') === 'free') {
        return new Response(JSON.stringify({ error: 'upgrade_required' }), { status: 403, headers: corsHeaders });
      }
      const clientId = Deno.env.get('NOTION_CLIENT_ID')!;
      const url = `https://api.notion.com/v1/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=code&owner=user&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(userId)}`;
      return json({ url });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('[notion-connect] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), { status: 500, headers: corsHeaders });
  }

  function json(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
