import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ADMIN_EMAIL = 'reyzostyle@gmail.com';

// Earnings are payable once past their hold and once the balance clears this.
// Low on purpose: a partner who earned a little should still be able to take
// it out rather than watch it sit there.
const MIN_PAYOUT_CENTS = 1000;

// Codes that would be confusing or impersonating in a link.
const RESERVED_CODES = new Set([
  'admin', 'api', 'app', 'auth', 'billing', 'support', 'help', 'team',
  'chumoku', 'chumokumedia', 'official', 'staff', 'login', 'signup', 'www',
]);

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

  // Verify the JWT signature via the auth server — never trust a decoded-only
  // token. (A forged token with the admin's UUID as `sub` would otherwise pass.)
  const token2 = authHeader.replace('Bearer ', '');
  let authUser: any;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token2);
    if (error || !user) throw new Error('invalid token');
    authUser = user;
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const isAdmin = authUser.email === ADMIN_EMAIL;

  // ── POST: create new partner (admin only) ──────────────────────────────
  if (req.method === 'POST') {
    const body = await req.json();

    // ── Self-serve: any signed-in user claims their own affiliate link ──
    if (!isAdmin || body.self_serve) {
      const raw = String(body.code ?? '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{2,23}$/.test(raw)) {
        return new Response(
          JSON.stringify({ error: 'Use 3-24 characters: letters, numbers, dashes or underscores.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (RESERVED_CODES.has(raw)) {
        return new Response(
          JSON.stringify({ error: 'That one is taken. Try another.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: existing } = await supabase
        .from('referral_codes').select('code').eq('owner_user_id', authUser.id).maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ error: `You already have a link: ${existing.code}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { error } = await supabase.from('referral_codes').insert({
        code: raw,
        partner_name: authUser.email || raw,
        owner_user_id: authUser.id,
      });
      if (error) {
        // 23505 is the unique violation on either the code or the one-per-owner index
        const msg = error.code === '23505' ? 'That one is taken. Try another.' : error.message;
        return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, code: raw }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { code, partner_name, owner_email } = body;
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

  // ── PUT: partner saves their own payout details ────────────────────────
  if (req.method === 'PUT') {
    const { payout_method, payout_details, payout_in_credits } = await req.json();
    if (payout_method && payout_method !== 'paypal') {
      return new Response(JSON.stringify({ error: 'Payouts go out by PayPal' }), { status: 400, headers: corsHeaders });
    }
    const { error } = await supabase
      .from('referral_codes')
      .update({
        payout_method: 'paypal',
        payout_details: payout_details ? String(payout_details).slice(0, 200) : null,
        payout_in_credits: !!payout_in_credits,
      })
      .eq('owner_user_id', authUser.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── PATCH: assign owner email, or settle up (admin only) ─────────────
  if (req.method === 'PATCH') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    const body = await req.json();

    // Marking a partner paid. `paid_out` has existed on referral_conversions
    // since the table was created and nothing ever set it, which meant the
    // first real payout would have been an UPDATE typed by hand in the SQL
    // editor - the exact move that took signup down once already.
    //
    // Only settled earnings are marked: anything still inside its 30-day hold
    // has not been paid, and sweeping it up here would silently erase the hold
    // for money that may yet be refunded.
    if (body.action === 'mark_paid') {
      const code = String(body.code ?? '');
      if (!code) return new Response(JSON.stringify({ error: 'code required' }), { status: 400, headers: corsHeaders });

      const { data: rows, error: readErr } = await supabase
        .from('referral_conversions')
        .select('id, commission_cents, hold_until, paid_out')
        .eq('referral_code', code);
      if (readErr) return new Response(JSON.stringify({ error: readErr.message }), { status: 400, headers: corsHeaders });

      const now = Date.now();
      const settled = (rows ?? []).filter((r: any) =>
        !r.paid_out && (!r.hold_until || new Date(r.hold_until).getTime() <= now));
      if (settled.length === 0) {
        return new Response(JSON.stringify({ error: 'Nothing settled to pay out yet.' }), { status: 400, headers: corsHeaders });
      }

      const cents = settled.reduce((t: number, r: any) => t + (r.commission_cents || 0), 0);
      const { error: updErr } = await supabase
        .from('referral_conversions')
        .update({ paid_out: true })
        .in('id', settled.map((r: any) => r.id));
      if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers: corsHeaders });

      return new Response(JSON.stringify({ ok: true, marked: settled.length, cents }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { code, owner_email } = body;
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
        supabase.from('referral_conversions')
          .select('commission_cents, hold_until, paid_out, kind').eq('referral_code', rc.code),
      ]);
      const rows = convRows ?? [];
      const now = Date.now();
      const sum = (rs: any[]) => rs.reduce((s: number, r: any) => s + (r.commission_cents ?? 0), 0);

      // An earning is available once it is past its hold and not yet paid.
      // Rows predating the hold column have no hold to wait out.
      const unpaid = rows.filter((r: any) => !r.paid_out);
      const pending = unpaid.filter((r: any) => r.hold_until && new Date(r.hold_until).getTime() > now);
      const available = unpaid.filter((r: any) => !r.hold_until || new Date(r.hold_until).getTime() <= now);

      const available_cents = sum(available);
      return {
        ...rc,
        signups: signups ?? 0,
        conversions: rows.length,
        total_commission_cents: sum(rows),
        pending_cents: sum(pending),
        available_cents,
        paid_out_cents: sum(rows.filter((r: any) => r.paid_out)),
        can_withdraw: available_cents >= MIN_PAYOUT_CENTS,
        min_payout_cents: MIN_PAYOUT_CENTS,
      };
    }));
  }

  if (isAdmin) {
    const { data: codes } = await supabase.from('referral_codes').select('*').order('created_at', { ascending: false });
    const partners = await getStats(codes ?? []);
    // `partner` as well as `partners`. The admin owns a referral code like
    // anyone else, but this branch only ever returned the list, so "View as a
    // partner" read `data.partner`, found nothing, and showed the join-us pitch
    // to someone who joined months ago.
    const own = partners.find((p: any) => p.owner_user_id === authUser.id) ?? null;
    return new Response(JSON.stringify({ partners, partner: own }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Partner: find code linked to this user
  const { data: code } = await supabase.from('referral_codes').select('*').eq('owner_user_id', authUser.id).maybeSingle();
  if (!code) return new Response(JSON.stringify({ partner: null }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const [result] = await getStats([code]);
  return new Response(JSON.stringify({ partner: result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
