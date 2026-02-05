// Backfill minted_at and bonded_at timestamps from pump.fun API
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get tokens missing minted_at or bonded_at
    const { data: tokens, error: fetchError } = await supabase
      .from("holders_intel_seen_tokens")
      .select("token_mint, symbol, minted_at, bonded_at")
      .eq("was_posted", true);

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    // Filter to those needing timestamp updates
    const tokensToProcess = (tokens || []).filter(t => !t.minted_at);
    console.log(`[backfill-timestamps] Found ${tokensToProcess.length} tokens needing timestamps (of ${tokens?.length || 0} total)`);

    const results = {
      total: tokensToProcess.length,
      mintedUpdated: 0,
      bondedUpdated: 0,
      notPumpFun: 0,
      errors: 0,
      details: [] as { mint: string; symbol: string; status: string; minted?: string; bonded?: string }[],
    };

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;
    const DELAY_MS = 500;

    for (let i = 0; i < tokensToProcess.length; i += BATCH_SIZE) {
      const batch = tokensToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (token) => {
        try {
          // Fetch from pump.fun API
          const response = await fetch(
            `https://frontend-api.pump.fun/coins/${token.token_mint}`,
            { headers: { "Accept": "application/json" } }
          );

          if (!response.ok) {
            // Not a pump.fun token or API error
            results.notPumpFun++;
            results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "not_pumpfun" });
            return;
          }

          const data = await response.json();
          const updates: { minted_at?: string; bonded_at?: string } = {};
          let detailStatus = "";

          // created_timestamp is in milliseconds
          if (data.created_timestamp) {
            const mintedAt = new Date(data.created_timestamp).toISOString();
            updates.minted_at = mintedAt;
            results.mintedUpdated++;
            detailStatus += "minted ";
          }

          // Check if bonded (complete = true means graduated to Raydium)
          if (data.complete && data.complete_timestamp) {
            const bondedAt = new Date(data.complete_timestamp).toISOString();
            updates.bonded_at = bondedAt;
            results.bondedUpdated++;
            detailStatus += "bonded ";
          } else if (data.raydium_pool) {
            // Has Raydium pool but no timestamp - use king_of_the_hill_timestamp as proxy
            if (data.king_of_the_hill_timestamp) {
              const bondedAt = new Date(data.king_of_the_hill_timestamp).toISOString();
              updates.bonded_at = bondedAt;
              results.bondedUpdated++;
              detailStatus += "bonded(koth) ";
            }
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("holders_intel_seen_tokens")
              .update(updates)
              .eq("token_mint", token.token_mint);

            if (updateError) {
              results.errors++;
              results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "update_error" });
              return;
            }
          }

          if (!detailStatus) {
            detailStatus = "no_timestamps";
          }

          results.details.push({ 
            mint: token.token_mint, 
            symbol: token.symbol, 
            status: detailStatus.trim(),
            minted: updates.minted_at,
            bonded: updates.bonded_at,
          });
        } catch (err) {
          results.errors++;
          results.details.push({ mint: token.token_mint, symbol: token.symbol, status: `error: ${err}` });
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches
      if (i + BATCH_SIZE < tokensToProcess.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      console.log(`[backfill-timestamps] Processed ${Math.min(i + BATCH_SIZE, tokensToProcess.length)}/${tokensToProcess.length}`);
    }

    console.log(`[backfill-timestamps] Complete: ${results.mintedUpdated} minted, ${results.bondedUpdated} bonded, ${results.notPumpFun} not pump.fun`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[backfill-timestamps] Error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
