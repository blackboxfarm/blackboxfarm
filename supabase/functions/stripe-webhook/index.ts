import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Map Stripe product IDs to tier keys
const PRODUCT_TO_TIER: Record<string, string> = {
  "prod_U5rCqUTB2ivf09": "pro",
  "prod_U5rC0vzkGA6sfq": "pro",        // x_sub variant
  "prod_U5rCvewEcZZetf": "dev",
  "prod_U5rCsGpO4RKofP": "dev",        // x_sub variant
  "prod_U5rCyXbfyw6nd6": "enterprise",
  "prod_U5rC0NjxwWKDTV": "enterprise",  // x_sub variant
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) throw new Error("Missing Stripe env vars");

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("No signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    logStep("Signature verification failed", { error: String(err) });
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Get customer email
      const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
      const email = customer.email;
      if (!email) {
        logStep("No email on customer", { customerId });
        return new Response("OK", { status: 200 });
      }

      // Find Supabase user by email
      const { data: users } = await supabase.auth.admin.listUsers();
      const matchedUser = users?.users?.find(u => u.email === email);
      if (!matchedUser) {
        logStep("No Supabase user found for email", { email });
        return new Response("OK", { status: 200 });
      }

      const userId = matchedUser.id;
      const isActive = subscription.status === "active" || subscription.status === "trialing";
      const productId = subscription.items.data[0]?.price?.product as string;
      const tierKey = PRODUCT_TO_TIER[productId] || "pro";
      const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

      logStep("Syncing subscription", { userId, email, tierKey, isActive, expiresAt });

      if (isActive) {
        // Upsert active subscription
        const { error } = await supabase
          .from("web_user_subscriptions")
          .upsert({
            user_id: userId,
            tier_key: tierKey,
            is_active: true,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,tier_key" });

        if (error) logStep("Upsert error", { error: error.message });
        else logStep("Subscription synced to DB");
      } else {
        // Deactivate
        const { error } = await supabase
          .from("web_user_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("tier_key", tierKey);

        if (error) logStep("Deactivation error", { error: error.message });
        else logStep("Subscription deactivated in DB");
      }
    }
  } catch (err) {
    logStep("Processing error", { error: String(err) });
    return new Response("Processing error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
