import { withRunLog } from '../_shared/run-logger.ts';
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
  "prod_U5rC0vzkGA6sfq": "pro",
  "prod_U8qZhEROQW6Iiu": "pro",
  "prod_U8qZ9TNN4LLryZ": "pro",
  "prod_U5rCvewEcZZetf": "dev",
  "prod_U5rCsGpO4RKofP": "dev",
  "prod_U5rCyXbfyw6nd6": "enterprise",
  "prod_U5rC0NjxwWKDTV": "enterprise",
};

serve(withRunLog('stripe-webhook', async (req) => {
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

      const isActive = subscription.status === "active" || subscription.status === "trialing";
      const productId = subscription.items.data[0]?.price?.product as string;
      const tierKey = PRODUCT_TO_TIER[productId] || "pro";
      const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
      const priceAmount = subscription.items.data[0]?.price?.unit_amount || null;
      const currency = subscription.items.data[0]?.price?.currency || 'usd';
      const interval = subscription.items.data[0]?.price?.recurring?.interval || null;

      // ──────────────────────────────────────────────
      // 1) Always upsert into stripe_customers (tracks ALL paying customers)
      // ──────────────────────────────────────────────
      const { error: scError } = await supabase
        .from("stripe_customers")
        .upsert({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          email,
          name: customer.name || null,
          tier_key: tierKey,
          is_active: isActive,
          amount_cents: priceAmount,
          currency,
          interval,
          current_period_end: expiresAt,
          stripe_product_id: productId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "stripe_customer_id" });

      if (scError) logStep("stripe_customers upsert error", { error: scError.message });
      else logStep("stripe_customers synced", { email, tierKey, isActive });

      // ──────────────────────────────────────────────
      // 2) Try to match to a Supabase user for web_user_subscriptions
      // ──────────────────────────────────────────────
      const { data: users } = await supabase.auth.admin.listUsers();
      const matchedUser = users?.users?.find(u => u.email === email);

      if (matchedUser) {
        const userId = matchedUser.id;

        // Update stripe_customers with matched user_id
        await supabase
          .from("stripe_customers")
          .update({ matched_user_id: userId })
          .eq("stripe_customer_id", customerId);

        logStep("Matched Supabase user", { userId, email });

        if (isActive) {
          const { error } = await supabase
            .from("web_user_subscriptions")
            .upsert({
              user_id: userId,
              tier_key: tierKey,
              is_active: true,
              stripe_subscription_id: subscription.id,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id,tier_key" });

          if (error) logStep("web_user_subscriptions upsert error", { error: error.message });
          else logStep("web_user_subscriptions synced");
        } else {
          const { error } = await supabase
            .from("web_user_subscriptions")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("tier_key", tierKey);

          if (error) logStep("Deactivation error", { error: error.message });
          else logStep("Subscription deactivated in DB");
        }
      } else {
        logStep("No Supabase user found — tracked in stripe_customers only", { email });
      }

      // ──────────────────────────────────────────────
      // 3) Admin notification
      // ──────────────────────────────────────────────
      const formattedAmount = priceAmount ? `$${(priceAmount / 100).toFixed(2)} ${currency.toUpperCase()}` : 'N/A';
      const hasAccount = matchedUser ? '✅ Has site account' : '⚠️ No site account';

      if (isActive && (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated")) {
        const eventLabel = event.type === "customer.subscription.created" ? "New Subscription" : "Subscription Renewed";
        await supabase.from("admin_notifications").insert({
          notification_type: "payment_confirmed",
          title: `💳 ${eventLabel}`,
          message: `${customer.name || email} subscribed to ${tierKey.toUpperCase()} tier\n\n💰 Amount: ${formattedAmount}\n📅 Expires: ${new Date(subscription.current_period_end * 1000).toLocaleDateString()}\n👤 ${hasAccount}`,
          metadata: {
            email,
            customer_name: customer.name,
            user_id: matchedUser?.id || null,
            tier: tierKey,
            amount: formattedAmount,
            product_id: productId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            event_type: event.type,
            has_site_account: !!matchedUser,
          },
          is_read: false,
        });

        // ──────────────────────────────────────────────
        // 4) Send subscriber email via subscriber-welcome
        // ──────────────────────────────────────────────
        try {
          if (event.type === "customer.subscription.created") {
            // New subscription — send welcome email
            await supabase.functions.invoke('subscriber-welcome', {
              body: {
                emailType: 'subscriber_welcome',
                email,
                name: customer.name || null,
                tierKey,
                amount: formattedAmount,
                isNewSubscription: true,
                needsAccountCreation: !matchedUser,
              },
            });
            logStep("Subscriber welcome email sent", { email, needsAccountCreation: !matchedUser });
          } else {
            // Renewal — send payment confirmation
            await supabase.functions.invoke('subscriber-welcome', {
              body: {
                emailType: 'subscription_renewed',
                email,
                name: customer.name || null,
                tierKey,
                amount: formattedAmount,
              },
            });
            logStep("Renewal confirmation email sent", { email });
          }
        } catch (emailErr) {
          logStep("Failed to send subscriber email", { error: String(emailErr) });
        }
      } else if (!isActive) {
        await supabase.from("admin_notifications").insert({
          notification_type: "transaction",
          title: "❌ Subscription Cancelled",
          message: `${customer.name || email} cancelled their ${tierKey.toUpperCase()} subscription`,
          metadata: { email, user_id: matchedUser?.id || null, tier: tierKey, event_type: event.type },
          is_read: false,
        });

        // Send cancellation email to subscriber
        try {
          await supabase.functions.invoke('subscriber-welcome', {
            body: {
              emailType: 'subscription_cancelled',
              email,
              name: customer.name || null,
              tierKey,
            },
          });
          logStep("Cancellation email sent", { email });
        } catch (emailErr) {
          logStep("Failed to send cancellation email", { error: String(emailErr) });
        }
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
}));

