import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || serviceKey;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Decode JWT payload (ES256-safe)
  const token2 = authHeader.replace('Bearer ', '');
  let authUser: any;
  try {
    const payload = JSON.parse(atob(token2.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.sub) throw new Error('no sub');
    const { data: { user }, error } = await supabase.auth.admin.getUserById(payload.sub);
    if (error || !user) throw new Error('not found');
    authUser = user;
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const isAdmin = authUser.email === ADMIN_EMAIL;

  // ── POST: create new partner (admin only) ──────────────────────────────
  if (req.method === 'POST') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    const { code, partner_name, owner_email } = await req.json();
    if (!code || !partner_name) return new Response(JSON.stringify({ error: 'code and partner_name required' }), { status: 400, headers: corsHeaders });

    let owner_user_id: string | null = null;
    if (owner_email) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const found = users?.users?.find((u: any) => u.email === owner_email);
      if (!found) return new Response(JSON.stringify({ error: `No user found with email: ${owner_email}` }), { status: 400, headers: corsHeaders });
      owner_user_id = found.id;
    }

    const { error } = await supabase.from('referral_codes').insert({
      code,
      partner_name,
      commission_percent: 50,
      owner_user_id,
    });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── PATCH: assign owner email to existing partner (admin only) ───────
  if (req.method === 'PATCH') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    const { code, owner_email } = await req.json();
    if (!code || !owner_email) return new Response(JSON.stringify({ error: 'code and owner_email required' }), { status: 400, headers: corsHeaders });

    const { data: users } = await supabase.auth.admin.listUsers();
    const found = users?.users?.find((u: any) => u.email === owner_email);
    if (!found) return new Response(JSON.stringify({ error: `No user found with email: ${owner_email}` }), { status: 400, headers: corsHeaders });

    const { error } = await supabase.from('referral_codes').update({ owner_user_id: found.id }).eq('code', code);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── DELETE: remove partner (admin only) ─────────────────────────────────
  if (req.method === 'DELETE') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    const { code } = await req.json();
    if (!code) return new Response(JSON.stringify({ error: 'code required' }), { status: 400, headers: corsHeaders });

    const { error } = await supabase.from('referral_codes').delete().eq('code', code);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── GET: fetch stats ───────────────────────────────────────────────────
  async function getStats(codes: any[]) {
    return await Promise.all(codes.map(async (rc) => {
      const [{ count: signups }, { data: convRows }] = await Promise.all([
        supabase.from('referral_signups').select('*', { count: 'exact', head: true }).eq('referral_code', rc.code),
        supabase.from('referral_conversions').select('commission_cents').eq('referral_code', rc.code),
      ]);
      const conversions = convRows?.length ?? 0;
      const total_commission_cents = convRows?.reduce((s: number, r: any) => s + (r.commission_cents ?? 0), 0) ?? 0;
      return { ...rc, signups: signups ?? 0, conversions, total_commission_cents };
    }));
  }

  if (isAdmin) {
    const { data: codes } = await supabase.from('referral_codes').select('*').order('created_at', { ascending: false });
    const partners = await getStats(codes ?? []);
    return new Response(JSON.stringify({ partners }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Partner: find code linked to this user
  const { data: code } = await supabase.from('referral_codes').select('*').eq('owner_user_id', authUser.id).maybeSingle();
  if (!code) return new Response(JSON.stringify({ partner: null }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const [result] = await getStats([code]);
  return new Response(JSON.stringify({ partner: result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
