import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      "https://apxauapuusmgwbbzjgfl.supabase.co",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get config
    const { data: config } = await supabase
      .from("pumpfun_monitor_config")
      .select("*")
      .single();

    if (!config) throw new Error("No config found");

    const maxRugcheck = config.max_rugcheck_score_fantasy ?? 5000;
    const minHolders = config.min_holder_count_fantasy ?? 75;
    const minVolume = config.min_volume_sol_fantasy ?? 10;
    const minMcap = config.min_market_cap_usd ?? 5000;
    const maxDust = config.max_dust_holder_pct ?? 25;

    // Get watching tokens
    const { data: watching } = await supabase
      .from("pumpfun_watchlist")
      .select("id, token_symbol, holder_count, volume_sol, market_cap_usd, rugcheck_score, dust_holder_pct")
      .eq("status", "watching");

    if (!watching?.length) {
      return new Response(JSON.stringify({ message: "No watching tokens", rejected: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rejected = 0;
    const results: any[] = [];

    for (const token of watching) {
      const reasons: string[] = [];
      if ((token.holder_count ?? 0) < minHolders) reasons.push(`holders_below_${minHolders}`);
      if ((token.volume_sol ?? 0) < minVolume) reasons.push(`volume_below_${minVolume}sol`);
      if (token.market_cap_usd != null && token.market_cap_usd < minMcap) reasons.push(`mcap_below_${minMcap}`);
      if (token.rugcheck_score != null && token.rugcheck_score > maxRugcheck) reasons.push(`rugcheck_above_${maxRugcheck}`);
      if (token.dust_holder_pct != null && token.dust_holder_pct > maxDust) reasons.push(`dust_above_${maxDust}pct`);

      if (reasons.length > 0) {
        await supabase
          .from("pumpfun_watchlist")
          .update({
            status: "rejected",
            rejection_reason: "red_flag_filter_reeval",
            rejection_type: "red_flag",
            rejection_reasons: reasons,
            removed_at: new Date().toISOString(),
            removal_reason: `Failed red flag re-evaluation: ${reasons.join(", ")}`,
          })
          .eq("id", token.id);
        rejected++;
        results.push({ symbol: token.token_symbol, reasons });
      }
    }

    return new Response(JSON.stringify({ rejected, total: watching.length, kept: watching.length - rejected, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
