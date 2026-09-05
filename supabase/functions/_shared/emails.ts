// Onboarding drip copy + markup.
//
// Kept as one module so the worker stays plumbing and the words live in a
// single place you can edit without touching delivery logic.
//
// Markup rules that email clients force on us, and why this looks dated:
//   - table wrapper, not flexbox: Outlook's Word renderer ignores modern CSS
//   - every style inlined: Gmail strips <style> blocks in many contexts
//   - the CTA is a padded <a>, not a <button>: buttons don't render reliably
//   - explicit colours on every element: clients inject their own defaults,
//     and a dark shell with inherited text colour goes black-on-black
// Each email ships a text/plain twin. That isn't politeness, it's
// deliverability: HTML-only mail scores as spammier almost everywhere.

const BRAND = '#0EA4E9';
const BG = '#0A0F1A';
const CARD = '#0E1626';
const TEXT = '#E5EAF2';
const MUTED = '#8A94A6';

export interface EmailCtx {
  appUrl: string;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(opts: {
  preheader: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  unsubscribeUrl: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};">
  <!-- Preheader: the grey line clients show next to the subject. Hidden in the
       body itself, otherwise it renders twice. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD};border:1px solid rgba(255,255,255,0.08);border-radius:16px;">
        <tr><td style="padding:28px 28px 8px 28px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:2px;color:#FFFFFF;">CHUMOKU</div>
        </td></tr>
        <tr><td style="padding:8px 28px 4px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${TEXT};">
          ${opts.body}
        </td></tr>
        <tr><td style="padding:20px 28px 28px 28px;">
          <a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND};color:#FFFFFF;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">${opts.ctaLabel}</a>
        </td></tr>
        <tr><td style="padding:0 28px 26px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid rgba(255,255,255,0.07);padding-top:18px;">
          you're getting this because you made a chumoku account.
          <a href="${opts.unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">unsubscribe</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 14px 0;">${s}</p>`;
const strong = (s: string) => `<strong style="color:#FFFFFF;">${s}</strong>`;

// Step 1 — immediately on signup.
function welcome(ctx: EmailCtx): RenderedEmail {
  const text = `you're in.

20 credits are sitting on your account. no card, nothing to activate.

quick thing worth knowing: chumoku only does youtube shorts. not long-form,
not podcast clips, not everything at once. that's the whole point, it's why
it can tell you the exact second people swiped instead of handing you a
generic content tip.

fastest way to see what it actually does: paste a link to your last short.
you get back the second people left, a score on your hook, and what to
change next time.

analyze your first short: ${ctx.appUrl}

unsubscribe: ${ctx.unsubscribeUrl}`;

  return {
    subject: "you're in. 20 credits are on your account",
    text,
    html: layout({
      preheader: 'paste your last short and see where people actually left',
      ctaLabel: 'analyze my first short',
      ctaUrl: ctx.appUrl,
      unsubscribeUrl: ctx.unsubscribeUrl,
      body:
        p("you're in.") +
        p(`${strong('20 credits')} are sitting on your account. no card, nothing to activate.`) +
        p(`one thing worth knowing up front: chumoku only does ${strong('youtube shorts')}. not long-form, not podcast clips, not everything at once. that's the point. it's why it can name the exact second people swiped instead of handing you a generic content tip.`) +
        p('fastest way to see what it does is to paste a link to your last short. you get back the second people left, a score on your hook, and what to change next time.'),
    }),
  };
}

// Step 2 — +24h.
function competitors(ctx: EmailCtx): RenderedEmail {
  const url = ctx.appUrl;
  const text = `most "find trending ideas" tools just show you whatever is big right now.
chumoku does the opposite.

you add channels in your niche, and it only surfaces the shorts that beat
that channel's OWN average views per day. so a small channel's breakout
shows up, and a big channel's routine upload doesn't. that difference is
the whole feature.

then it re-angles the idea for your niche and writes it out as a script in
your voice, so you're not copying anyone.

finding them costs nothing. you only spend a credit on the one you decide
to open.

find your outliers: ${url}

unsubscribe: ${ctx.unsubscribeUrl}`;

  return {
    subject: 'steal what already works (not what "trends")',
    text,
    html: layout({
      preheader: "outliers on their channel, not whatever is big this week",
      ctaLabel: 'find my outliers',
      ctaUrl: url,
      unsubscribeUrl: ctx.unsubscribeUrl,
      body:
        p('most "trending ideas" tools show you whatever is big right now. chumoku does the opposite.') +
        p(`you add channels in your niche, and it only surfaces shorts that beat ${strong("that channel's own average views per day")}. a small channel's breakout shows up. a big channel's routine upload doesn't. that difference is the whole feature.`) +
        p('then it re-angles the idea for your niche and writes it out as a script in your voice, so you land it as your video instead of a copy.') +
        p(`finding them costs ${strong('nothing')}. you only spend a credit on the one you decide to open.`),
    }),
  };
}

// Step 3 — +3d.
function hookAndScript(ctx: EmailCtx): RenderedEmail {
  const text = `most shorts don't die at the end. they die around second 3.

you don't have to guess at that one. paste your hook (or the whole script)
BEFORE you film and chumoku scores it, tells you where it drags, and gives
you three rewrites that still sound like you and not a corporate robot.

script lab does the same for the full thing: it flags the weak middle and
the CTA nobody sticks around for, while a rewrite still costs you nothing
but a few minutes.

fixing this before you shoot is the cheapest edit you'll ever make.

check a hook: ${ctx.appUrl}

unsubscribe: ${ctx.unsubscribeUrl}`;

  return {
    subject: 'your first 3 seconds decide the whole video',
    text,
    html: layout({
      preheader: 'score the hook before you film, not after it flops',
      ctaLabel: 'check a hook',
      ctaUrl: ctx.appUrl,
      unsubscribeUrl: ctx.unsubscribeUrl,
      body:
        p("most shorts don't die at the end. they die around second 3.") +
        p(`paste your hook, or the whole script, ${strong('before you film')}. chumoku scores it, says where it drags, and gives you three rewrites that still sound like you instead of a corporate robot.`) +
        p('script lab does the same for the full thing: it flags the weak middle and the CTA nobody sticks around for, while a rewrite still costs you nothing but a few minutes.') +
        p("fixing it before you shoot is the cheapest edit you'll ever make."),
    }),
  };
}

// Step 4 — +5d.
function upgrade(ctx: EmailCtx): RenderedEmail {
  const url = `${ctx.appUrl}/#pricing`;
  const text = `you've had about a week with it, so here's the honest version.

the free 20 credits are a one-time grant. they don't refill monthly. once
they're gone that's it until you upgrade.

Plus is $9.99/mo: 300 credits every month, plus competitor tracking, which
is the part people actually stick around for.
Pro is $19.99/mo: unlimited credits, for when you're posting daily or
running more than one channel.

if you connected your youtube, the paid tiers are also where the retention
reads get useful, because you're checking every upload instead of
rationing.

see the plans: ${url}

unsubscribe: ${ctx.unsubscribeUrl}`;

  return {
    subject: 'running low on credits?',
    text,
    html: layout({
      preheader: 'the free 20 are one-time, here is what the paid tiers change',
      ctaLabel: 'see the plans',
      ctaUrl: url,
      unsubscribeUrl: ctx.unsubscribeUrl,
      body:
        p("you've had about a week with it, so here's the honest version.") +
        p(`the free 20 credits are a ${strong('one-time grant')}. they don't refill monthly. once they're gone that's it until you upgrade.`) +
        p(`${strong('Plus, $9.99/mo')} gets you 300 credits a month plus competitor tracking, which is the part people actually stick around for. ${strong('Pro, $19.99/mo')} is unlimited credits, for posting daily or running more than one channel.`) +
        p('if you connected your youtube, the paid tiers are where the retention reads get useful, because you check every upload instead of rationing.'),
    }),
  };
}

// Order is data, not control flow: swapping two steps here (and the matching
// send_at intervals in the migration) reorders the sequence without touching
// the worker.
//
// hookAndScript now goes out at +24h and competitors at +3d (swapped from the
// first draft): competitor tracking is Plus-only, so pitching it to a free
// user on day one before they've had a chance to spend a single credit was
// pushing an upgrade nobody asked for yet. Hook/script checks work on the
// free tier, so that's the thing worth showing first.
export const DRIP_STEPS: Record<number, (ctx: EmailCtx) => RenderedEmail> = {
  1: welcome,
  2: hookAndScript,
  3: competitors,
  4: upgrade,
};

export function renderStep(step: number, ctx: EmailCtx): RenderedEmail | null {
  const fn = DRIP_STEPS[step];
  return fn ? fn(ctx) : null;
}
