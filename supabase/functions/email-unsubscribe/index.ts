import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// One-click unsubscribe. Public by design: it's reached from a link in an
// inbox, so there is no session to authenticate against. The token is the
// capability, which is why it's a random uuid per user rather than the user
// id, and why it only ever grants this one action.
//
// Handles POST as well as GET because RFC 8058 one-click (the
// List-Unsubscribe-Post header the worker sets) has the mail client POST here
// with no user interaction. Answering only GET would leave Gmail's native
// unsubscribe button silently doing nothing.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function page(title: string, message: string, status: number): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#0A0F1A;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:420px;margin:15vh auto;padding:28px;background:#0E1626;border:1px solid rgba(255,255,255,0.08);border-radius:16px;text-align:center;">
    <div style="font-size:15px;font-weight:800;letter-spacing:2px;color:#fff;margin-bottom:16px;">CHUMOKU</div>
    <p style="color:#E5EAF2;font-size:16px;margin:0 0 8px;">${title}</p>
    <p style="color:#8A94A6;font-size:14px;line-height:1.6;margin:0;">${message}</p>
  </div>
</body></html>`,
    { status, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = new URL(req.url).searchParams.get('token');
  if (!token) return page('Link is missing its token', 'Nothing was changed.', 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Matching on the token alone: an unknown one is answered the same way as a
  // known one below, so this can't be used to probe which tokens exist.
  const { data, error } = await supabase
    .from('email_prefs')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .is('unsubscribed_at', null)
    .select('user_id');

  if (error) return page('Something went wrong', 'Try the link again in a minute.', 500);

  // Already-unsubscribed and never-existed both land here, and both are told
  // the same thing. Repeat clicks should read as success, not as an error.
  if (!data || data.length === 0) {
    return page("You're unsubscribed", 'No more onboarding emails will be sent.', 200);
  }

  // Only the drip is cancelled. Account mail (password resets, receipts) is
  // transactional and is not governed by this flag.
  await supabase
    .from('email_drip')
    .update({ status: 'skipped' })
    .eq('user_id', data[0].user_id)
    .eq('status', 'pending');

  return page("You're unsubscribed", 'No more onboarding emails will be sent.', 200);
});
