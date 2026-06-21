import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import Stripe from 'npm:stripe@14.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
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

    const { priceId: requestedPriceId, plan } = await req.json();

    // Resolve the active price from the Stripe product, so price changes in
    // Stripe take effect without redeploying. Falls back to a price ID if a
    // product is not configured for the plan.
    const proProductId = Deno.env.get('STRIPE_PRO_PRODUCT_ID');       // plan 'pro'    = Hershy Plus
    const agencyProductId = Deno.env.get('STRIPE_AGENCY_PRODUCT_ID'); // plan 'agency' = Hershy Pro

    const productId = plan === 'pro' ? proProductId : plan === 'agency' ? agencyProductId : null;

    let priceId = requestedPriceId;
    if (productId) {
      const product = await stripe.products.retrieve(productId);
      const dp = product.default_price;
      if (typeof dp === 'string') {
        priceId = dp;
      } else if (dp && typeof dp === 'object' && 'id' in dp) {
        priceId = dp.id;
      } else {
        // No default price set — pick the first active recurring price.
        const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
        const recurring = prices.data.find((p) => p.recurring) || prices.data[0];
        if (recurring) priceId = recurring.id;
      }
    }

    if (!priceId) throw new Error('No price configured for this plan');

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
          await supabase
            .from('user_tokens')
            .update({ stripe_customer_id: null })
            .eq('user_id', userId);
        } else {
          throw err;
        }
      }
    }

    if (!customerId) {
      const existingCustomers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const customer = await stripe.customers.create({ email: userEmail, metadata: { userId } });
        customerId = customer.id;
      }

      await supabase
        .from('user_tokens')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: 'https://hershymedia.com/?checkout=success',
      cancel_url: 'https://hershymedia.com/',
      metadata: { userId },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[create-checkout-session] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
