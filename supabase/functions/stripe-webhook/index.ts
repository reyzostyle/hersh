import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import Stripe from 'npm:stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get('STRIPE_PRO_PRICE_ID') || '']: 'pro',
  [Deno.env.get('STRIPE_AGENCY_PRICE_ID') || '']: 'agency',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeSecretKey) throw new Error('Stripe secret key not configured');

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.text();
    let event: Stripe.Event;

    if (webhookSecret) {
      const signature = req.headers.get('stripe-signature');
      if (!signature) throw new Error('Missing stripe-signature header');
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`[stripe-webhook] event=${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) {
        console.error('[stripe-webhook] No userId in session metadata');
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const subscriptionId = session.subscription as string;
      let plan = 'pro';

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id || '';
        plan = PRICE_TO_PLAN[priceId] || 'pro';
      }

      const resetAt = new Date();
      resetAt.setDate(resetAt.getDate() + 30);

      await supabase
        .from('user_tokens')
        .update({
          plan,
          analyses_used: 0,
          analyses_reset_at: resetAt.toISOString(),
          stripe_subscription_id: subscriptionId || null,
        })
        .eq('user_id', userId);

      console.log(`[stripe-webhook] Updated user ${userId} to plan=${plan}`);

      // Record referral conversion if user came via a ref link
      const amountCents = session.amount_total ?? 0;
      if (amountCents > 0) {
        const { data: tokenRow } = await supabase
          .from('user_tokens')
          .select('referral_code')
          .eq('user_id', userId)
          .maybeSingle();

        if (tokenRow?.referral_code) {
          const { data: refCode } = await supabase
            .from('referral_codes')
            .select('commission_percent')
            .eq('code', tokenRow.referral_code)
            .maybeSingle();

          if (refCode) {
            const commissionCents = Math.round(amountCents * refCode.commission_percent / 100);
            await supabase.from('referral_conversions').insert({
              referral_code: tokenRow.referral_code,
              referred_user_id: userId,
              plan,
              amount_cents: amountCents,
              commission_cents: commissionCents,
              stripe_subscription_id: subscriptionId || null,
            });
            console.log(`[stripe-webhook] Referral conversion: code=${tokenRow.referral_code} commission=$${commissionCents / 100}`);
          }
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: tokenRow } = await supabase
        .from('user_tokens')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (tokenRow) {
        await supabase
          .from('user_tokens')
          .update({
            plan: 'free',
            stripe_subscription_id: null,
            analyses_reset_at: null,
          })
          .eq('user_id', tokenRow.user_id);

        console.log(`[stripe-webhook] Downgraded user ${tokenRow.user_id} to free`);
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id || '';
      const plan = PRICE_TO_PLAN[priceId] || 'pro';
      const customerId = subscription.customer as string;

      const { data: tokenRow } = await supabase
        .from('user_tokens')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();

      if (tokenRow) {
        const resetAt = new Date();
        resetAt.setDate(resetAt.getDate() + 30);

        await supabase
          .from('user_tokens')
          .update({
            plan,
            analyses_used: 0,
            analyses_reset_at: resetAt.toISOString(),
          })
          .eq('user_id', tokenRow.user_id);

        console.log(`[stripe-webhook] Reset usage for user ${tokenRow.user_id}, plan=${plan}`);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[stripe-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
