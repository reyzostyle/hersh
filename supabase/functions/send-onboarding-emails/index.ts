import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { renderStep } from '../_shared/emails.ts';
// NOTE: the version currently deployed (via the dashboard's in-browser editor,
// see chumoku-onboarding-email-drip memory) carries a physical copy of this
// module inside the function's own file tree instead of importing it from
// here — the browser editor deploys each function as a self-contained
// bundle and can't resolve a path above the function's own folder. This repo
// copy is the source of truth for the next `supabase functions deploy`, which
// resolves the relative import correctly and needs no manual duplication.

// Drip worker. Runs on a schedule, drains whatever is due, exits.
//
// Deliberately NOT called from the signup path: the trigger that fills this
// queue runs inside the signup transaction, so anything slow or flaky there
// would land on the user creating an account. Here, a provider outage just
// means rows stay pending and go out on the next tick.
//
// Not publicly invocable. It sends mail on the product's behalf, so it needs
// a shared secret (CRON_SECRET) even though it's deployed with JWT
// verification off so a scheduler can reach it.
//
// Safe by default: with no RESEND_API_KEY set it runs in dry-run and reports
// what it *would* send without touching the provider or the rows.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// One tick's worth. Resend's default limit is well above this; the cap exists
// so a backlog drains over several ticks instead of one 10-minute request
// that risks the function timeout mid-batch.
const BATCH_SIZE = 50;
// A step that has failed this many times is left alone rather than retried
// forever. Hard bounces don't get better by trying again.
const MAX_ATTEMPTS = 3;

interface DripRow {
  id: string;
  user_id: string;
  email: string;
  step: number;
  attempts: number;
}

async function sendViaResend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      // Gmail and friends surface a native unsubscribe control off these, and
      // their absence is a real spam-score penalty for bulk mail.
      headers: {
        'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.message || body?.error?.message || JSON.stringify(body);
    } catch { /* non-JSON error body */ }
    return { ok: false, error: detail };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // Accepted from either a header (schedulers) or the Authorization bearer.
  const provided = req.headers.get('x-cron-secret')
    || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  // The product signs these, not a person. "Rey from Hershy" was a founder
  // voice on a drip nobody replies to, and a name in the From line is a promise
  // of a human on the other end that this address does not keep.
  const from = Deno.env.get('EMAIL_FROM') || 'Chumoku <noti@chumoku.co>';
  const appUrl = Deno.env.get('APP_URL') || 'https://chumoku.co';
  const functionsUrl = `${supabaseUrl}/functions/v1`;
  const dryRun = !resendKey || new URL(req.url).searchParams.get('dry_run') === '1';

  const { data: due, error: dueErr } = await supabase
    .from('email_drip')
    .select('id, user_id, email, step, attempts')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('send_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (dueErr) {
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = (due || []) as DripRow[];
  const result = { due: rows.length, sent: 0, skipped: 0, failed: 0, dryRun };

  for (const row of rows) {
    // Claim first. The status filter makes this a compare-and-set, so if two
    // ticks overlap only one of them gets the row and nobody sends twice.
    const { data: claimed } = await supabase
      .from('email_drip')
      .update({ status: 'sending', attempts: row.attempts + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id');

    if (!claimed || claimed.length === 0) continue;

    // Opt-out is checked at send time, not enqueue time: someone who
    // unsubscribes on day 2 must not receive the day 3 and day 5 mails that
    // were queued before they asked to stop.
    const { data: prefs } = await supabase
      .from('email_prefs')
      .select('unsubscribed_at, unsubscribe_token')
      .eq('user_id', row.user_id)
      .maybeSingle();

    if (prefs?.unsubscribed_at) {
      await supabase.from('email_drip').update({ status: 'skipped' }).eq('id', row.id);
      result.skipped++;
      continue;
    }

    const unsubscribeUrl = `${functionsUrl}/email-unsubscribe?token=${prefs?.unsubscribe_token ?? ''}`;
    const rendered = renderStep(row.step, { appUrl, unsubscribeUrl });
    if (!rendered) {
      await supabase.from('email_drip')
        .update({ status: 'failed', last_error: `no template for step ${row.step}` })
        .eq('id', row.id);
      result.failed++;
      continue;
    }

    if (dryRun) {
      // Put the row back so a real run still delivers it.
      await supabase.from('email_drip')
        .update({ status: 'pending', attempts: row.attempts })
        .eq('id', row.id);
      result.sent++;
      continue;
    }

    const sent = await sendViaResend({
      apiKey: resendKey!, from, to: row.email,
      subject: rendered.subject, html: rendered.html, text: rendered.text,
      unsubscribeUrl,
    });

    if (sent.ok) {
      await supabase.from('email_drip')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id);
      result.sent++;
    } else {
      // Back to pending unless it's out of attempts, so a transient provider
      // blip is retried on the next tick instead of being dropped.
      const exhausted = row.attempts + 1 >= MAX_ATTEMPTS;
      await supabase.from('email_drip')
        .update({ status: exhausted ? 'failed' : 'pending', last_error: sent.error })
        .eq('id', row.id);
      result.failed++;
    }
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
