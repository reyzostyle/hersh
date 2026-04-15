import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Check Pro plan
    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle();

    const plan = tokenRow?.plan || 'free';
    const isAdmin = user.email === ADMIN_EMAIL;

    if (!isAdmin && plan !== 'agency') {
      return new Response(
        JSON.stringify({ error: 'Video file upload requires the Pro plan.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fileName } = await req.json();
    const safeName = (fileName || 'video').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storagePath = `${user.id}/${Date.now()}_${safeName}`;

    // Generate signed upload URL using service role (bypasses RLS entirely)
    const { data, error } = await supabase.storage
      .from('video-uploads')
      .createSignedUploadUrl(storagePath);

    if (error) throw new Error(`Failed to create upload URL: ${error.message}`);

    console.log(`[get-upload-url] user=${user.id}, path=${storagePath}`);

    return new Response(
      JSON.stringify({ signedUrl: data.signedUrl, storagePath, token: data.token }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[get-upload-url] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
