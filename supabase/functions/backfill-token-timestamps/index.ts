// Backfill minted_at and bonded_at timestamps using DexScreener as primary source
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Check bonding status via DexScreener - if has liquidity on Raydium, it's bonded
async function fetchDexScreenerData(tokenMint: string) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const pairs = data.pairs || [];
    
    // Find Raydium pair (indicates bonding)
    const raydiumPair = pairs.find((p: any) => 
      p.dexId === 'raydium' && p.liquidity?.usd > 1000
    );
    
    // Get any pair for creation time estimate
    const anyPair = pairs[0];
    
    return {
      isBonded: !!raydiumPair,
      liquidity: raydiumPair?.liquidity?.usd || anyPair?.liquidity?.usd || 0,
      marketCap: anyPair?.marketCap || anyPair?.fdv || 0,
      priceUsd: parseFloat(anyPair?.priceUsd) || 0,
      pairCreatedAt: raydiumPair?.pairCreatedAt || anyPair?.pairCreatedAt,
    };
  } catch (err) {
    console.error(`[DexScreener] Error for ${tokenMint}:`, err);
    return null;
  }
}

// Fetch from pump.fun for minted_at
async function fetchPumpFunData(tokenMint: string) {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { "Accept": "application/json" },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      createdTimestamp: data.created_timestamp,
      completeTimestamp: data.complete_timestamp,
      complete: data.complete,
      raydiumPool: data.raydium_pool,
      kingOfHillTimestamp: data.king_of_the_hill_timestamp,
    };
  } catch (err) {
    console.error(`[PumpFun] Error for ${tokenMint}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all posted tokens
    const { data: tokens, error: fetchError } = await supabase
      .from("holders_intel_seen_tokens")
      .select("token_mint, symbol, minted_at, bonded_at")
      .eq("was_posted", true);

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    // Filter to those needing any timestamp updates
    const tokensToProcess = (tokens || []).filter(t => !t.minted_at || !t.bonded_at);
    console.log(`[backfill-timestamps] Processing ${tokensToProcess.length} tokens needing timestamps`);

    const results = {
      total: tokensToProcess.length,
      mintedUpdated: 0,
      bondedUpdated: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[],
    };

    // Process in batches
    const BATCH_SIZE = 5;
    const DELAY_MS = 1000;

    for (let i = 0; i < tokensToProcess.length; i += BATCH_SIZE) {
      const batch = tokensToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (token) => {
        try {
          const updates: { minted_at?: string; bonded_at?: string } = {};
          let status = "";

          // Fetch from both sources in parallel
          const [dexData, pumpData] = await Promise.all([
            fetchDexScreenerData(token.token_mint),
            fetchPumpFunData(token.token_mint),
          ]);

          // Minted time - prefer pump.fun, fallback to DexScreener pairCreatedAt
          if (!token.minted_at) {
            if (pumpData?.createdTimestamp) {
              updates.minted_at = new Date(pumpData.createdTimestamp).toISOString();
              results.mintedUpdated++;
              status += "minted(pumpfun) ";
            } else if (dexData?.pairCreatedAt) {
              // Use DexScreener pair creation as approximate mint time
              updates.minted_at = new Date(dexData.pairCreatedAt).toISOString();
              results.mintedUpdated++;
              status += "minted(dex) ";
            }
          }

          // Bonded time - check multiple sources
          if (!token.bonded_at) {
            let bondedAt: string | null = null;

            // 1. Pump.fun complete_timestamp
            if (pumpData?.complete && pumpData?.completeTimestamp) {
              bondedAt = new Date(pumpData.completeTimestamp).toISOString();
              status += "bonded(pumpfun) ";
            }
            // 2. Pump.fun king_of_hill_timestamp as proxy
            else if (pumpData?.raydiumPool && pumpData?.kingOfHillTimestamp) {
              bondedAt = new Date(pumpData.kingOfHillTimestamp).toISOString();
              status += "bonded(koth) ";
            }
            // 3. DexScreener shows Raydium pair with liquidity
            else if (dexData?.isBonded && dexData?.pairCreatedAt) {
              bondedAt = new Date(dexData.pairCreatedAt).toISOString();
              status += "bonded(dex) ";
            }
            // 4. DexScreener shows high liquidity (definitely bonded even without exact time)
            else if (dexData?.liquidity && dexData.liquidity > 50000) {
              // Use pair creation time or now as fallback
              bondedAt = dexData.pairCreatedAt 
                ? new Date(dexData.pairCreatedAt).toISOString()
                : new Date().toISOString();
              status += "bonded(liq>50k) ";
            }

            if (bondedAt) {
              updates.bonded_at = bondedAt;
              results.bondedUpdated++;
            }
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("holders_intel_seen_tokens")
              .update(updates)
              .eq("token_mint", token.token_mint);

            if (updateError) {
              results.errors++;
              status = "update_error";
            }
          } else {
            results.skipped++;
            status = status || "no_data";
          }

          results.details.push({
            mint: token.token_mint.slice(0, 8),
            symbol: token.symbol,
            status: status.trim() || "no_updates",
            mcap: dexData?.marketCap ? `$${(dexData.marketCap / 1e6).toFixed(1)}M` : "-",
            liq: dexData?.liquidity ? `$${(dexData.liquidity / 1e3).toFixed(0)}K` : "-",
          });
        } catch (err) {
          results.errors++;
          results.details.push({
            mint: token.token_mint.slice(0, 8),
            symbol: token.symbol,
            status: `error: ${err}`,
          });
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches for rate limits
      if (i + BATCH_SIZE < tokensToProcess.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      console.log(`[backfill-timestamps] Processed ${Math.min(i + BATCH_SIZE, tokensToProcess.length)}/${tokensToProcess.length}`);
    }

    console.log(`[backfill-timestamps] Complete: ${results.mintedUpdated} minted, ${results.bondedUpdated} bonded`);

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
