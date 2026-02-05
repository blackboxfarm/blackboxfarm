// Backfill banner_url column from Dexscreener headers for existing posted tokens
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

    // Get tokens missing banner_url
    const { data: tokens, error: fetchError } = await supabase
      .from("holders_intel_seen_tokens")
      .select("token_mint, symbol")
      .is("banner_url", null)
      .eq("was_posted", true);

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    console.log(`[backfill-banner-urls] Found ${tokens?.length || 0} tokens without banner_url`);

    const results = {
      total: tokens?.length || 0,
      updated: 0,
      noHeader: 0,
      errors: 0,
      details: [] as { mint: string; symbol: string; status: string; banner?: string }[],
    };

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 10;
    const DELAY_MS = 1000;

    for (let i = 0; i < (tokens?.length || 0); i += BATCH_SIZE) {
      const batch = tokens!.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (token) => {
        try {
          // Fetch from Dexscreener
          const response = await fetch(
            `https://api.dexscreener.com/tokens/v1/solana/${token.token_mint}`,
            { headers: { "Accept": "application/json" } }
          );

          if (!response.ok) {
            results.errors++;
            results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "api_error" });
            return;
          }

          const data = await response.json();
          const pairs = Array.isArray(data) ? data : [];
          
          // Get header from first pair with one
          let headerUrl: string | null = null;
          for (const pair of pairs) {
            if (pair?.info?.header) {
              headerUrl = pair.info.header;
              break;
            }
          }

          if (headerUrl) {
            const { error: updateError } = await supabase
              .from("holders_intel_seen_tokens")
              .update({ banner_url: headerUrl })
              .eq("token_mint", token.token_mint);

            if (updateError) {
              results.errors++;
              results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "update_error" });
            } else {
              results.updated++;
              results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "updated", banner: headerUrl });
            }
          } else {
            results.noHeader++;
            results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "no_header" });
          }
        } catch (err) {
          results.errors++;
          results.details.push({ mint: token.token_mint, symbol: token.symbol, status: `error: ${err}` });
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches
      if (i + BATCH_SIZE < (tokens?.length || 0)) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      console.log(`[backfill-banner-urls] Processed ${Math.min(i + BATCH_SIZE, tokens?.length || 0)}/${tokens?.length || 0}`);
    }

    console.log(`[backfill-banner-urls] Complete: ${results.updated} updated, ${results.noHeader} no header, ${results.errors} errors`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[backfill-banner-urls] Error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
