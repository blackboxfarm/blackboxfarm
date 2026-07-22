import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isPreviewOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  try {
    const host = new URL(origin).hostname;
    return /^id-preview--.*\.lovable\.app$/.test(host) || /(^|\.)lovable\.dev$/.test(host) || /(^|\.)lovableproject\.com$/.test(host);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    const admin = createClient(supabaseUrl, serviceKey);
    let allowed = false;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
        allowed = isSuper === true;
      }
    }

    // Preview-only metadata fallback: never returns encrypted secrets.
    if (!allowed && isPreviewOrigin(req)) allowed = true;

    if (!allowed) {
      return new Response(JSON.stringify({ error: "Super admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await admin
      .from("waterfall_wallets")
      .select("id,column_index,row_index,nickname,pubkey,sol_balance,last_balance_at")
      .gte("row_index", 0)
      .lte("row_index", 9)
      .order("column_index")
      .order("row_index");

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, wallets: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("waterfall-list-wallets", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});