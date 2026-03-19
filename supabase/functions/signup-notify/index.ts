import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is called by a database webhook on new user signup
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { record, type } = await req.json();
    
    // Only process INSERT events (new signups)
    if (type !== 'INSERT' || !record) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id: userId, email, created_at } = record;

    console.log(`[signup-notify] New user signup: ${email}`);

    // ──────────────────────────────────────────────
    // 🚨 WATCHED EMAIL ALERT
    // ──────────────────────────────────────────────
    const WATCHED_EMAILS = ['mohad222@gmail.com'];
    const isWatchedEmail = WATCHED_EMAILS.includes(email?.toLowerCase());
    if (isWatchedEmail) {
      console.log(`[signup-notify] 🚨 WATCHED EMAIL DETECTED: ${email}`);
    }

    // ──────────────────────────────────────────────
    // 1) Auto-link Stripe subscription if this email matches a paying customer
    // ──────────────────────────────────────────────
    let linkedTier: string | null = null;
    try {
      const { data: stripeCustomer } = await supabase
        .from('stripe_customers')
        .select('*')
        .eq('email', email)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (stripeCustomer) {
        console.log(`[signup-notify] Found active Stripe customer for ${email}, auto-linking subscription`);
        linkedTier = stripeCustomer.tier_key;

        // Update stripe_customers with matched user_id
        await supabase
          .from('stripe_customers')
          .update({ matched_user_id: userId })
          .eq('id', stripeCustomer.id);

        // Create web_user_subscriptions entry
        const { error: subError } = await supabase
          .from('web_user_subscriptions')
          .upsert({
            user_id: userId,
            tier_key: stripeCustomer.tier_key,
            is_active: true,
            stripe_subscription_id: stripeCustomer.stripe_subscription_id,
            expires_at: stripeCustomer.current_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,tier_key' });

        if (subError) {
          console.error('[signup-notify] Error linking subscription:', subError);
        } else {
          console.log(`[signup-notify] ✅ Auto-linked ${email} to ${stripeCustomer.tier_key} tier`);
        }
      }
    } catch (linkErr) {
      console.log('[signup-notify] No Stripe customer found to link (this is normal for free signups)');
    }

    // ──────────────────────────────────────────────
    // 2) Send welcome email to the new user
    // ──────────────────────────────────────────────
    try {
      await supabase.functions.invoke('subscriber-welcome', {
        body: {
          emailType: 'new_user_welcome',
          email,
        },
      });
      console.log('[signup-notify] Welcome email sent to user');
    } catch (welcomeErr) {
      console.error('[signup-notify] Failed to send welcome email:', welcomeErr);
    }

    // ──────────────────────────────────────────────
    // 3) Admin notification
    // ──────────────────────────────────────────────
    const linkedNote = linkedTier 
      ? `\n🔗 Auto-linked to ${linkedTier.toUpperCase()} Stripe subscription!` 
      : '';

    const { data, error } = await supabase.functions.invoke('admin-notify', {
      body: {
        type: 'new_signup',
        title: linkedTier ? '🔗 New Signup (Stripe Linked!)' : 'New User Signup',
        message: `A new user has registered!\n\n📧 Email: ${email}\n🆔 User ID: ${userId?.slice(0, 8)}...${linkedNote}`,
        metadata: {
          user_id: userId,
          email,
          created_at,
          auto_linked_tier: linkedTier,
        },
        channels: ['email', 'telegram', 'database'],
      },
    });

    if (error) {
      console.error('[signup-notify] Error calling admin-notify:', error);
    } else {
      console.log('[signup-notify] Notification sent successfully');
    }

    return new Response(
      JSON.stringify({ success: true, notified: !error, linkedTier }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[signup-notify] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
