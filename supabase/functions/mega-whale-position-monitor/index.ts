import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Position {
  id: string;
  user_id: string;
  wallet_id: string;
  token_mint: string;
  token_symbol: string;
  amount_tokens: number;
  entry_price_sol: number;
  current_price_sol: number;
  high_price_sol: number;
  low_price_sol?: number;
  pnl_percent: number;
  status: string;
  opened_at: string;
}

interface UserConfig {
  user_id: string;
  auto_sell_enabled: boolean;
  take_profit_pct: number;
  stop_loss_pct: number;
  trailing_stop_enabled: boolean;
  trailing_stop_pct: number;
}

// Track rapid monitoring to avoid duplicate loops
const activeRapidMonitors = new Set<string>();

async function getPriceFromDexScreener(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
    );
    if (!response.ok) return null;
    
    const data = await response.json();
    const pairs = data?.pairs;
    if (!pairs || pairs.length === 0) return null;
    
    // Find SOL pair or use first pair
    const solPair = pairs.find((p: any) => 
      p.quoteToken?.symbol?.toUpperCase() === 'SOL' ||
      p.baseToken?.symbol?.toUpperCase() === 'SOL'
    ) || pairs[0];
    
    // Get price in SOL
    if (solPair.quoteToken?.symbol?.toUpperCase() === 'SOL') {
      return parseFloat(solPair.priceNative);
    } else if (solPair.baseToken?.symbol?.toUpperCase() === 'SOL') {
      return 1 / parseFloat(solPair.priceNative);
    }
    
    // Fallback: convert USD price to SOL
    const priceUsd = parseFloat(solPair.priceUsd);
    if (priceUsd && priceUsd > 0) {
      const solResponse = await fetch(
        "https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112"
      );
      if (solResponse.ok) {
        const solData = await solResponse.json();
        const solPriceUsd = parseFloat(solData?.pairs?.[0]?.priceUsd || "0");
        if (solPriceUsd > 0) {
          return priceUsd / solPriceUsd;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`DexScreener price fetch failed for ${tokenMint}:`, error);
    return null;
  }
}

async function getPriceFromJupiter(tokenMint: string): Promise<number | null> {
  try {
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const response = await fetch(
      `https://price.jup.ag/v6/price?ids=${tokenMint}&vsToken=${SOL_MINT}`
    );
    if (!response.ok) return null;
    
    const data = await response.json();
    const price = data?.data?.[tokenMint]?.price;
    return typeof price === "number" && price > 0 ? price : null;
  } catch (error) {
    console.error(`Jupiter price fetch failed for ${tokenMint}:`, error);
    return null;
  }
}

async function getTokenPrice(tokenMint: string): Promise<number | null> {
  // Try Jupiter first (more accurate for SOL pairs)
  const jupPrice = await getPriceFromJupiter(tokenMint);
  if (jupPrice) return jupPrice;
  
  // Fallback to DexScreener
  return await getPriceFromDexScreener(tokenMint);
}

async function executeSell(
  supabase: any,
  position: Position,
  reason: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    console.log(`🚨 EXECUTING SELL for position ${position.id}, reason: ${reason}`);
    
    // Get wallet secret for signing
    const { data: wallet, error: walletError } = await supabase
      .from("mega_whale_auto_buy_wallets")
      .select("id, pubkey, secret_key_encrypted")
      .eq("id", position.wallet_id)
      .single();
    
    if (walletError || !wallet) {
      console.error("Failed to get wallet:", walletError);
      return { success: false, error: "Wallet not found" };
    }
    
    // Call raydium-swap to execute sell
    const { data: swapResult, error: swapError } = await supabase.functions.invoke(
      "raydium-swap",
      {
        body: {
          side: "sell",
          tokenMint: position.token_mint,
          sellAll: true,
          ownerSecret: wallet.secret_key_encrypted,
          slippageBps: 500, // 5% slippage for sells
          confirmPolicy: "confirmed",
        },
      }
    );
    
    if (swapError) {
      console.error("Swap error:", swapError);
      return { success: false, error: swapError.message };
    }
    
    if (swapResult?.error) {
      console.error("Swap returned error:", swapResult.error);
      return { success: false, error: swapResult.error };
    }
    
    const signature = swapResult?.signature || swapResult?.signatures?.[0];
    console.log(`✅ Sell executed successfully, signature: ${signature}`);
    
    return { success: true, signature };
  } catch (error) {
    console.error("Execute sell error:", error);
    return { success: false, error: String(error) };
  }
}

async function checkAndUpdatePosition(
  supabase: any,
  position: Position,
  config: UserConfig | undefined
): Promise<{ sold: boolean; reason?: string; error?: string }> {
  // Get current price
  const currentPrice = await getTokenPrice(position.token_mint);
  
  if (!currentPrice) {
    console.log(`Could not get price for ${position.token_mint}`);
    return { sold: false, error: "Price unavailable" };
  }

  // Calculate P&L
  const pnlPercent = ((currentPrice - position.entry_price_sol) / position.entry_price_sol) * 100;
  const pnlSol = (currentPrice - position.entry_price_sol) * position.amount_tokens;
  
  // Update high/low watermarks
  const highPrice = Math.max(position.high_price_sol || currentPrice, currentPrice);
  const lowPrice = Math.min(position.low_price_sol || currentPrice, currentPrice);
  
  // Update position with current price
  const { error: updateError } = await supabase
    .from("mega_whale_positions")
    .update({
      current_price_sol: currentPrice,
      high_price_sol: highPrice,
      low_price_sol: lowPrice,
      pnl_percent: pnlPercent,
      pnl_sol: pnlSol,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", position.id)
    .eq("status", "open"); // Only update if still open

  if (updateError) {
    console.error(`Failed to update position ${position.id}:`, updateError);
    return { sold: false, error: "Update failed" };
  }

  // Update local position state for subsequent checks
  position.current_price_sol = currentPrice;
  position.high_price_sol = highPrice;
  position.low_price_sol = lowPrice;
  position.pnl_percent = pnlPercent;
  
  if (!config || !config.auto_sell_enabled) {
    return { sold: false };
  }

  // Check sell conditions
  let shouldSell = false;
  let sellReason = "";

  // Take Profit check
  if (pnlPercent >= config.take_profit_pct) {
    shouldSell = true;
    sellReason = `take_profit_${config.take_profit_pct}%`;
    console.log(`🎯 TAKE PROFIT for ${position.token_symbol || position.token_mint}: ${pnlPercent.toFixed(2)}% >= ${config.take_profit_pct}%`);
  }
  
  // Stop Loss check
  else if (pnlPercent <= -config.stop_loss_pct) {
    shouldSell = true;
    sellReason = `stop_loss_${config.stop_loss_pct}%`;
    console.log(`🛑 STOP LOSS for ${position.token_symbol || position.token_mint}: ${pnlPercent.toFixed(2)}% <= -${config.stop_loss_pct}%`);
  }
  
  // Trailing Stop check
  else if (config.trailing_stop_enabled && highPrice > 0) {
    const dropFromHigh = ((highPrice - currentPrice) / highPrice) * 100;
    if (dropFromHigh >= config.trailing_stop_pct && pnlPercent > 0) {
      shouldSell = true;
      sellReason = `trailing_stop_${config.trailing_stop_pct}%_from_high`;
      console.log(`📉 TRAILING STOP for ${position.token_symbol || position.token_mint}: dropped ${dropFromHigh.toFixed(2)}% from high`);
    }
  }

  // Execute sell if conditions met
  if (shouldSell) {
    const sellResult = await executeSell(supabase, position, sellReason);
    
    if (sellResult.success) {
      await supabase
        .from("mega_whale_positions")
        .update({
          status: sellReason.includes("take_profit") ? "take_profit" : 
                  sellReason.includes("stop_loss") ? "stopped_out" : "sold",
          sell_signature: sellResult.signature,
          sell_price_sol: currentPrice,
          sell_amount_sol: currentPrice * position.amount_tokens,
          closed_at: new Date().toISOString(),
        })
        .eq("id", position.id);

      return { sold: true, reason: sellReason };
    } else {
      return { sold: false, error: sellResult.error };
    }
  }

  return { sold: false };
}

// Rapid monitoring for fresh positions - checks every 5 seconds
async function rapidMonitorPosition(
  supabaseUrl: string,
  supabaseServiceKey: string,
  position: Position,
  config: UserConfig | undefined,
  durationSeconds: number = 90
): Promise<void> {
  const monitorKey = position.id;
  
  // Prevent duplicate monitors
  if (activeRapidMonitors.has(monitorKey)) {
    console.log(`Rapid monitor already active for ${position.id}`);
    return;
  }
  
  activeRapidMonitors.add(monitorKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`🚀 Starting RAPID MONITORING for ${position.token_symbol || position.token_mint} (every 5 sec for ${durationSeconds}s)`);
  
  const startTime = Date.now();
  const checkInterval = 5000; // 5 seconds
  let checkCount = 0;
  
  try {
    while (Date.now() - startTime < durationSeconds * 1000) {
      checkCount++;
      
      // Re-fetch position to check if still open
      const { data: freshPosition, error } = await supabase
        .from("mega_whale_positions")
        .select("*")
        .eq("id", position.id)
        .eq("status", "open")
        .single();
      
      if (error || !freshPosition) {
        console.log(`Position ${position.id} no longer open, stopping rapid monitor`);
        break;
      }
      
      const result = await checkAndUpdatePosition(supabase, freshPosition, config);
      
      console.log(`⚡ Rapid check #${checkCount} for ${position.token_symbol || position.token_mint}: ` +
        `P&L: ${freshPosition.pnl_percent?.toFixed(2) || '?'}% | ` +
        `Price: ${freshPosition.current_price_sol?.toFixed(10) || '?'} SOL`);
      
      if (result.sold) {
        console.log(`✅ Position sold during rapid monitoring: ${result.reason}`);
        break;
      }
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  } catch (error) {
    console.error(`Rapid monitor error for ${position.id}:`, error);
  } finally {
    activeRapidMonitors.delete(monitorKey);
    console.log(`🏁 Rapid monitoring ended for ${position.token_symbol || position.token_mint} after ${checkCount} checks`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 20;
    const action = body.action || "monitor_all";

    console.log(`Position monitor starting - action: ${action}, batch: ${batchSize}`);

    // Get all open positions
    const { data: positions, error: positionsError } = await supabase
      .from("mega_whale_positions")
      .select("*")
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(batchSize);

    if (positionsError) {
      console.error("Failed to fetch positions:", positionsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch positions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!positions || positions.length === 0) {
      console.log("No open positions to monitor");
      return new Response(
        JSON.stringify({ message: "No open positions", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${positions.length} open positions`);

    // Categorize positions by age
    const now = Date.now();
    const FRESH_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
    
    const freshPositions: Position[] = [];
    const olderPositions: Position[] = [];
    
    for (const pos of positions as Position[]) {
      const openedAt = new Date(pos.opened_at).getTime();
      if (now - openedAt < FRESH_THRESHOLD_MS) {
        freshPositions.push(pos);
      } else {
        olderPositions.push(pos);
      }
    }

    console.log(`Fresh positions (< 15 min): ${freshPositions.length}, Older: ${olderPositions.length}`);

    // Get unique user IDs to fetch their configs
    const userIds = [...new Set(positions.map((p: Position) => p.user_id))];
    
    const { data: configs, error: configsError } = await supabase
      .from("mega_whale_auto_buy_config")
      .select("user_id, auto_sell_enabled, take_profit_pct, stop_loss_pct, trailing_stop_enabled, trailing_stop_pct")
      .in("user_id", userIds);

    if (configsError) {
      console.error("Failed to fetch configs:", configsError);
    }

    const configMap = new Map<string, UserConfig>();
    (configs || []).forEach((c: UserConfig) => configMap.set(c.user_id, c));

    const results = {
      processed: 0,
      priceUpdates: 0,
      sellsTriggered: 0,
      rapidMonitorsStarted: 0,
      errors: [] as string[],
    };

    // Start rapid monitoring for fresh positions (runs in background)
    for (const position of freshPositions) {
      const config = configMap.get(position.user_id);
      
      // Check once immediately
      const result = await checkAndUpdatePosition(supabase, position, config);
      results.processed++;
      results.priceUpdates++;
      
      if (result.sold) {
        results.sellsTriggered++;
        continue;
      }
      
      // Start background rapid monitoring if not already active
      if (!activeRapidMonitors.has(position.id)) {
        // Use waitUntil to run in background without blocking response
        EdgeRuntime.waitUntil(
          rapidMonitorPosition(supabaseUrl, supabaseServiceKey, position, config, 90)
        );
        results.rapidMonitorsStarted++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Process older positions with single check
    for (const position of olderPositions) {
      try {
        results.processed++;
        const config = configMap.get(position.user_id);
        const result = await checkAndUpdatePosition(supabase, position, config);
        
        results.priceUpdates++;
        if (result.sold) {
          results.sellsTriggered++;
        }
        if (result.error) {
          results.errors.push(`${position.id}: ${result.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (posError) {
        console.error(`Error processing position ${position.id}:`, posError);
        results.errors.push(`Error for ${position.id}: ${String(posError)}`);
      }
    }

    console.log(`Position monitor complete:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        message: freshPositions.length > 0 
          ? `Started ${results.rapidMonitorsStarted} rapid monitors (5-sec checks) for fresh positions`
          : "Standard monitoring completed"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Position monitor error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
