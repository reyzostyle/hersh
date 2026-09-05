import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import Stripe from 'npm:stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// One-time credit top-up, separate from the subscription checkout
// (create-checkout-session) — mode: 'payment', not 'subscription'. Pack
// size/price live entirely in the Stripe product (STRIPE_CREDIT_PACK_*_ID),
// same "never trust a client-supplied price" rule as the subscription flow.
// PACK_CREDITS must match whatever quantity the Stripe product actually
// represents — it's what the webhook credits on payment success, since
// Stripe doesn't know what "a credit" means, only what was paid.
const PACKS: Record<string, { envVar: string; credits: number }> = {
  small: { envVar: 'STRIPE_CREDIT_PACK_SMALL_PRODUCT_ID', credits: 100 },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) throw new Error('Stripe secret key not configured');
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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
    const userId = user.id;

    const { pack } = await req.json().catch(() => ({ pack: 'small' }));
    const packDef = PACKS[pack] || PACKS.small;
    const productId = Deno.env.get(packDef.envVar);
    if (!productId) throw new Error('No price configured for this credit pack yet');

    const product = await stripe.products.retrieve(productId);
    const dp = product.default_price;
    let priceId: string | undefined;
    if (typeof dp === 'string') {
      priceId = dp;
    } else if (dp && typeof dp === 'object' && 'id' in dp) {
      priceId = dp.id;
    } else {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
      priceId = prices.data.find((p) => !p.recurring)?.id;
    }
    if (!priceId) throw new Error('No price configured for this credit pack yet');

    const { data: authUser, error: getUserError } = await supabase.auth.admin.getUserById(userId);
    if (getUserError || !authUser?.user) throw new Error('User not found');
    const userEmail = authUser.user.email!;

    const { data: tokenRow } = await supabase
      .from('user_tokens')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = tokenRow?.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (err: any) {
        if (err?.code === 'resource_missing') {
          customerId = null;
          await supabase.from('user_tokens').update({ stripe_customer_id: null }).eq('user_id', userId);
        } else {
          throw err;
        }
      }
    }
    if (!customerId) {
      const existingCustomers = await stripe.customers.list({ email: userEmail, limit: 1 });
      customerId = existingCustomers.data[0]?.id;
      if (!customerId) {
        const customer = await stripe.customers.create({ email: userEmail, metadata: { userId } });
        customerId = customer.id;
      }
      await supabase.from('user_tokens').update({ stripe_customer_id: customerId }).eq('user_id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: 'https://chumoku.co/?topup=success',
      cancel_url: 'https://chumoku.co/',
      metadata: { userId, credits: String(packDef.credits), type: 'credit_topup' },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[create-credit-topup-session] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
