import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[admin-stripe-customer-details] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    // Super admin gate
    const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuperAdmin) {
      log("DENIED non-super-admin access", { userId: user.id });
      return new Response(JSON.stringify({ error: "Super admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, email } = body as { user_id?: string; email?: string };

    let lookupEmail = email;
    if (!lookupEmail && user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", user_id)
        .maybeSingle();
      lookupEmail = profile?.email ?? undefined;
      if (!lookupEmail) {
        const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
        lookupEmail = authUser?.user?.email ?? undefined;
      }
    }

    if (!lookupEmail) {
      return new Response(JSON.stringify({ error: "No email found for lookup" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    log("Looking up customer", { email: lookupEmail });
    const customers = await stripe.customers.list({ email: lookupEmail, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ found: false, email: lookupEmail }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer = customers.data[0];
    const customerId = customer.id;

    // Parallel fetch
    const [subsRes, invoicesRes, pmsRes, chargesRes] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 }),
      stripe.invoices.list({ customer: customerId, limit: 10 }),
      stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 5 }),
      stripe.charges.list({ customer: customerId, limit: 10 }),
    ]);

    const subscriptions = subsRes.data.map((s) => {
      const item = s.items?.data?.[0];
      const periodEnd =
        (s as any).current_period_end ?? item?.current_period_end ?? null;
      const periodStart =
        (s as any).current_period_start ?? item?.current_period_start ?? null;
      return {
        id: s.id,
        status: s.status,
        cancel_at_period_end: s.cancel_at_period_end,
        canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
        product_id: item?.price?.product as string | null,
        price_id: item?.price?.id ?? null,
        amount: item?.price?.unit_amount ?? null,
        currency: item?.price?.currency ?? null,
        interval: item?.price?.recurring?.interval ?? null,
        nickname: item?.price?.nickname ?? null,
      };
    });

    const invoices = invoicesRes.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      created: new Date(inv.created * 1000).toISOString(),
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
      attempt_count: inv.attempt_count,
    }));

    const paymentMethods = pmsRes.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
      is_default: customer.invoice_settings?.default_payment_method === pm.id,
    }));

    const lifetimeSpend = chargesRes.data
      .filter((c) => c.status === "succeeded" && !c.refunded)
      .reduce((sum, c) => sum + c.amount, 0);

    const totalRefunded = chargesRes.data.reduce((sum, c) => sum + (c.amount_refunded || 0), 0);

    return new Response(
      JSON.stringify({
        found: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          balance: customer.balance,
          currency: customer.currency,
          created: new Date(customer.created * 1000).toISOString(),
          delinquent: customer.delinquent,
          dashboard_url: `https://dashboard.stripe.com/customers/${customer.id}`,
        },
        subscriptions,
        invoices,
        payment_methods: paymentMethods,
        lifetime_spend: lifetimeSpend,
        total_refunded: totalRefunded,
        invoice_count: invoices.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});