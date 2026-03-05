import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const user = userData.user;
    const { code, xHandle } = await req.json();

    if (!code || !xHandle) {
      throw new Error("Code and X handle are required");
    }

    const cleanHandle = xHandle.trim().replace(/^@/, "");
    if (!cleanHandle || cleanHandle.length > 50) {
      throw new Error("Invalid X handle");
    }

    // Find matching active code
    const { data: codeRecord, error: codeError } = await supabase
      .from("x_community_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("is_active", true)
      .single();

    if (codeError || !codeRecord) {
      return new Response(JSON.stringify({ success: false, message: "Invalid or expired code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check expiry
    if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
      return new Response(JSON.stringify({ success: false, message: "This code has expired" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check max uses
    if (codeRecord.max_uses && codeRecord.use_count >= codeRecord.max_uses) {
      return new Response(JSON.stringify({ success: false, message: "This code has reached its usage limit" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check if user already redeemed this code
    const { data: existing } = await supabase
      .from("x_community_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("code_id", codeRecord.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: false, message: "You have already redeemed this code" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Record redemption
    const { error: redeemError } = await supabase
      .from("x_community_redemptions")
      .insert({ user_id: user.id, code_id: codeRecord.id, x_handle: cleanHandle });

    if (redeemError) throw redeemError;

    // Increment use count
    await supabase
      .from("x_community_codes")
      .update({ use_count: codeRecord.use_count + 1 })
      .eq("id", codeRecord.id);

    // Upsert X subscriber tier for user
    await supabase
      .from("web_user_subscriptions")
      .upsert({
        user_id: user.id,
        tier_key: "x_subscriber",
        x_handle_linked: cleanHandle,
        x_subscription_verified: true,
        is_active: true,
      }, { onConflict: "user_id,tier_key" });

    return new Response(JSON.stringify({
      success: true,
      message: "X Subscriber access unlocked! You now have enhanced features and discounted pricing.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[VERIFY-X-CODE]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
