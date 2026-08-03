import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Server-side catalog — the client never sees what a code grants, only
// whether it worked. Codes are matched case-insensitively.
const CODES: Record<string, { type: 'analyses' | 'hooks' | 'rank_multiplier'; value: number; message: string }> = {
  MU15: { type: 'rank_multiplier', value: 1.5, message: '1.5x RP boost active for this season!' },
  AN5: { type: 'analyses', value: 5, message: '+5 video analyses added to your account.' },
  HL5: { type: 'hooks', value: 5, message: '+5 hook checks added to your account.' },
};

function seasonOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function addBonus(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  field: 'bonus_analyses' | 'bonus_hooks',
  amount: number
) {
  const { data: existing } = await supabase.from('user_tokens').select(field).eq('user_id', userId).maybeSingle();
  if (existing) {
    await supabase.from('user_tokens').update({ [field]: (existing[field] || 0) + amount }).eq('user_id', userId);
  } else {
    await supabase.from('user_tokens').insert({ user_id: userId, access_token: '', refresh_token: '', [field]: amount });
  }
}

async function setRankBoost(supabase: ReturnType<typeof createClient>, userId: string, multiplier: number) {
  const { data: existing } = await supabase.from('user_tokens').select('user_id').eq('user_id', userId).maybeSingle();
  const patch = { rank_boost_season: seasonOf(new Date()), rank_boost_multiplier: multiplier };
  if (existing) {
    await supabase.from('user_tokens').update(patch).eq('user_id', userId);
  } else {
    await supabase.from('user_tokens').insert({ user_id: userId, access_token: '', refresh_token: '', ...patch });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) {
      return new Response(JSON.stringify({ error: 'Enter a code.' }), { status: 400, headers: corsHeaders });
    }

    const entry = CODES[code];
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Invalid or expired code.' }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // One redemption per code per account — the unique constraint is the
    // real guard; catching 23505 handles the race of a double-click too.
    const { error: insertError } = await supabase.from('redeemed_codes').insert({ user_id: user.id, code });
    if (insertError) {
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ error: "You've already redeemed this code." }), { status: 400, headers: corsHeaders });
      }
      throw insertError;
    }

    if (entry.type === 'analyses') {
      await addBonus(supabase, user.id, 'bonus_analyses', entry.value);
    } else if (entry.type === 'hooks') {
      await addBonus(supabase, user.id, 'bonus_hooks', entry.value);
    } else if (entry.type === 'rank_multiplier') {
      await setRankBoost(supabase, user.id, entry.value);
    }

    console.log(`[redeem-code] user=${user.id} code=${code} type=${entry.type}`);

    return new Response(JSON.stringify({ success: true, message: entry.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[redeem-code] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
