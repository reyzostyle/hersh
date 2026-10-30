// deno-lint-ignore-file no-explicit-any
// One email to one person, now, through Resend: for mail about something they
// did (a purchase), not the drip (send-onboarding-emails batches and retries
// those). Never throws: a failed email must not fail the payment it is about.
import type { RenderedEmail } from './emails.ts';

export async function sendEmail(supabase: any, userId: string, email: RenderedEmail): Promise<void> {
  try {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) { console.warn('[send-email] no RESEND_API_KEY, skipped'); return; }
    const { data } = await supabase.auth.admin.getUserById(userId);
    const to = data?.user?.email;
    if (!to) return;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Chumoku <noti@chumoku.co>',
        to: [to], subject: email.subject, html: email.html, text: email.text,
      }),
    });
    if (!res.ok) console.error('[send-email]', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('[send-email]', e);
  }
}
