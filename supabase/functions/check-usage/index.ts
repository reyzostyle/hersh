import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  pro: 30,
  agency: 50,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    console.log('[check-usage] env check:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceKey,
      hasAnonKey: !!anonKey,
    });

    if (!supabaseUrl || !serviceKey) {
      console.error('[check-usage] Missing env vars');
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const token = authHeader.replace('Bearer ', '');
    // Try REST /auth/v1/user (uses service key as apikey so it works without anon key env var)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    console.log('[check-usage] auth status:', userRes.status);
    if (!userRes.ok) {
      const txt = await userRes.text();
      console.error('[check-usage] Auth failed:', userRes.status, txt);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const authUser = await userRes.json();
    const userId = authUser.id;
    console.log('[check-usage] userId:', userId);

    const { data: tokenRow, error } = await supabaseAdmin
      .from('user_tokens')
      .select('plan, analyses_used, analyses_reset_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    const plan = tokenRow?.plan || 'free';
    let analysesUsed = tokenRow?.analyses_used || 0;
    const analysesLimit = PLAN_LIMITS[plan] ?? 3;

    if (plan !== 'free' && tokenRow?.analyses_reset_at) {
      const resetAt = new Date(tokenRow.analyses_reset_at);
      if (new Date() > resetAt) {
        const newResetAt = new Date();
        newResetAt.setDate(newResetAt.getDate() + 30);
        await supabaseAdmin
          .from('user_tokens')
          .update({ analyses_used: 0, analyses_reset_at: newResetAt.toISOString() })
          .eq('user_id', userId);
        analysesUsed = 0;
      }
    }

    const canAnalyze = analysesUsed < analysesLimit;

    return new Response(
      JSON.stringify({ canAnalyze, analysesUsed, analysesLimit, plan }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[check-usage] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
