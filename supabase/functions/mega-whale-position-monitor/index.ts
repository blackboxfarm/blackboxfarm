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
  original_amount_tokens: number;
  entry_price_sol: number;
  current_price_sol: number;
  high_price_sol: number;
  low_price_sol?: number;
  pnl_percent: number;
  status: string;
  opened_at: string;
  partial_sells_count: number;
  total_sold_tokens: number;
  average_sell_price_sol: number;
}

interface UserConfig {
  user_id: string;
  auto_sell_enabled: boolean;
  take_profit_pct: number;
  stop_loss_pct: number;
  trailing_stop_enabled: boolean;
  trailing_stop_pct: number;
  price_check_interval_seconds: number;
  max_position_age_hours: number;
  // Partial sell settings
  sell_percent_initial: number;
  sell_percent_remaining: number;
  remaining_position_take_profit_pct: number;
  remaining_position_stop_loss_pct: number;
}

// Track active monitors to prevent duplicates
const activeMonitors = new Set<string>();

async function getPriceFromDexScreener(tokenMint: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
    );
    if (!response.ok) return null;
    
    const data = await response.json();
    const pairs = data?.pairs;
    if (!pairs || pairs.length === 0) return null;
    
    const solPair = pairs.find((p: any) => 
      p.quoteToken?.symbol?.toUpperCase() === 'SOL' ||
      p.baseToken?.symbol?.toUpperCase() === 'SOL'
    ) || pairs[0];
    
    if (solPair.quoteToken?.symbol?.toUpperCase() === 'SOL') {
      return parseFloat(solPair.priceNative);
    } else if (solPair.baseToken?.symbol?.toUpperCase() === 'SOL') {
      return 1 / parseFloat(solPair.priceNative);
    }
    
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
  const jupPrice = await getPriceFromJupiter(tokenMint);
  if (jupPrice) return jupPrice;
  return await getPriceFromDexScreener(tokenMint);
}

async function executePartialSell(
  supabase: any,
  position: Position,
  sellPercent: number,
  reason: string
): Promise<{ success: boolean; signature?: string; amountSold?: number; error?: string }> {
  try {
    const tokensToSell = Math.floor(position.amount_tokens * (sellPercent / 100));
    console.log(`🚨 EXECUTING ${sellPercent}% SELL (${tokensToSell} tokens) for position ${position.id}, reason: ${reason}`);
    
    const { data: wallet, error: walletError } = await supabase
      .from("mega_whale_auto_buy_wallets")
      .select("id, pubkey, secret_key_encrypted")
      .eq("id", position.wallet_id)
      .single();
    
    if (walletError || !wallet) {
      console.error("Failed to get wallet:", walletError);
      return { success: false, error: "Wallet not found" };
    }
    
    const sellAll = sellPercent >= 100;
    
    const { data: swapResult, error: swapError } = await supabase.functions.invoke(
      "raydium-swap",
      {
        body: {
          side: "sell",
          tokenMint: position.token_mint,
          sellAll: sellAll,
          amount: sellAll ? undefined : tokensToSell,
          ownerSecret: wallet.secret_key_encrypted,
          slippageBps: 500,
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
    console.log(`✅ Partial sell (${sellPercent}%) executed successfully, signature: ${signature}`);
    
    return { success: true, signature, amountSold: tokensToSell };
  } catch (error) {
    console.error("Execute partial sell error:", error);
    return { success: false, error: String(error) };
  }
}

async function checkAndUpdatePosition(
  supabase: any,
  position: Position,
  config: UserConfig | undefined
): Promise<{ sold: boolean; partial?: boolean; reason?: string; error?: string; currentPrice?: number; pnlPercent?: number }> {
  const currentPrice = await getTokenPrice(position.token_mint);
  
  if (!currentPrice) {
    return { sold: false, error: "Price unavailable" };
  }

  const pnlPercent = ((currentPrice - position.entry_price_sol) / position.entry_price_sol) * 100;
  const pnlSol = (currentPrice - position.entry_price_sol) * position.amount_tokens;
  
  const highPrice = Math.max(position.high_price_sol || currentPrice, currentPrice);
  const lowPrice = Math.min(position.low_price_sol || currentPrice, currentPrice);
  
  await supabase
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
    .eq("status", "open");

  position.current_price_sol = currentPrice;
  position.high_price_sol = highPrice;
  position.low_price_sol = lowPrice;
  position.pnl_percent = pnlPercent;
  
  if (!config || !config.auto_sell_enabled) {
    return { sold: false, currentPrice, pnlPercent };
  }

  // Determine sell conditions based on partial sell count
  const isFirstSell = (position.partial_sells_count || 0) === 0;
  const takeProfitTarget = isFirstSell ? config.take_profit_pct : config.remaining_position_take_profit_pct;
  const stopLossTarget = isFirstSell ? config.stop_loss_pct : config.remaining_position_stop_loss_pct;
  const sellPercent = isFirstSell ? (config.sell_percent_initial || 100) : (config.sell_percent_remaining || 100);

  let shouldSell = false;
  let sellReason = "";

  if (pnlPercent >= takeProfitTarget) {
    shouldSell = true;
    sellReason = `take_profit_${takeProfitTarget}%`;
    console.log(`🎯 TAKE PROFIT: ${position.token_symbol || position.token_mint} at ${pnlPercent.toFixed(2)}% (target: ${takeProfitTarget}%)`);
  }
  else if (pnlPercent <= -stopLossTarget) {
    shouldSell = true;
    sellReason = `stop_loss_${stopLossTarget}%`;
    console.log(`🛑 STOP LOSS: ${position.token_symbol || position.token_mint} at ${pnlPercent.toFixed(2)}% (target: -${stopLossTarget}%)`);
  }
  else if (config.trailing_stop_enabled && highPrice > 0) {
    const dropFromHigh = ((highPrice - currentPrice) / highPrice) * 100;
    if (dropFromHigh >= config.trailing_stop_pct && pnlPercent > 0) {
      shouldSell = true;
      sellReason = `trailing_stop_${config.trailing_stop_pct}%_from_high`;
      console.log(`📉 TRAILING STOP: ${position.token_symbol || position.token_mint} dropped ${dropFromHigh.toFixed(2)}% from high`);
    }
  }

  if (shouldSell) {
    const sellResult = await executePartialSell(supabase, position, sellPercent, sellReason);
    
    if (sellResult.success) {
      const isFullSell = sellPercent >= 100;
      const newAmountTokens = isFullSell ? 0 : position.amount_tokens - (sellResult.amountSold || 0);
      const newTotalSold = (position.total_sold_tokens || 0) + (sellResult.amountSold || 0);
      
      // Calculate new average sell price
      const prevSellValue = (position.average_sell_price_sol || 0) * (position.total_sold_tokens || 0);
      const thisSellValue = currentPrice * (sellResult.amountSold || 0);
      const newAvgSellPrice = newTotalSold > 0 ? (prevSellValue + thisSellValue) / newTotalSold : currentPrice;
      
      if (isFullSell) {
        // Full sell - close position
        await supabase
          .from("mega_whale_positions")
          .update({
            status: sellReason.includes("take_profit") ? "take_profit" : 
                    sellReason.includes("stop_loss") ? "stopped_out" : "sold",
            amount_tokens: 0,
            sell_signature: sellResult.signature,
            sell_price_sol: currentPrice,
            sell_amount_sol: currentPrice * position.amount_tokens,
            closed_at: new Date().toISOString(),
            partial_sells_count: (position.partial_sells_count || 0) + 1,
            total_sold_tokens: newTotalSold,
            average_sell_price_sol: newAvgSellPrice,
          })
          .eq("id", position.id);

        return { sold: true, partial: false, reason: sellReason, currentPrice, pnlPercent };
      } else {
        // Partial sell - update position with remaining tokens and reset entry price to current for tracking new gains
        await supabase
          .from("mega_whale_positions")
          .update({
            amount_tokens: newAmountTokens,
            partial_sells_count: (position.partial_sells_count || 0) + 1,
            total_sold_tokens: newTotalSold,
            average_sell_price_sol: newAvgSellPrice,
            // Reset high_price to current for trailing stop on remaining position
            high_price_sol: currentPrice,
            // Update entry price to current for calculating new P&L on remaining position
            entry_price_sol: currentPrice,
            last_partial_sell_at: new Date().toISOString(),
          })
          .eq("id", position.id);

        console.log(`💰 PARTIAL SELL COMPLETE: Sold ${sellPercent}%, ${newAmountTokens} tokens remaining`);
        return { sold: false, partial: true, reason: `partial_${sellPercent}%_${sellReason}`, currentPrice, pnlPercent };
      }
    } else {
      return { sold: false, error: sellResult.error, currentPrice, pnlPercent };
    }
  }

  return { sold: false, currentPrice, pnlPercent };
}

// Continuous monitoring until position is sold
async function monitorUntilSold(
  supabaseUrl: string,
  supabaseServiceKey: string,
  position: Position,
  config: UserConfig
): Promise<void> {
  const monitorKey = position.id;
  
  if (activeMonitors.has(monitorKey)) {
    console.log(`Monitor already active for ${position.id}`);
    return;
  }
  
  activeMonitors.add(monitorKey);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const checkIntervalMs = (config.price_check_interval_seconds || 5) * 1000;
  const maxAgeMs = (config.max_position_age_hours || 24) * 60 * 60 * 1000;
  const positionOpenedAt = new Date(position.opened_at).getTime();
  
  console.log(`🚀 CONTINUOUS MONITORING started for ${position.token_symbol || position.token_mint}`);
  console.log(`   Check interval: ${config.price_check_interval_seconds || 5}s | Max age: ${config.max_position_age_hours || 24}h`);
  console.log(`   Take profit: ${config.take_profit_pct}% | Stop loss: ${config.stop_loss_pct}%`);
  console.log(`   Initial sell: ${config.sell_percent_initial || 100}% | Remaining targets: TP ${config.remaining_position_take_profit_pct}% / SL ${config.remaining_position_stop_loss_pct}%`);
  
  let checkCount = 0;
  
  try {
    while (true) {
      checkCount++;
      const now = Date.now();
      
      // Safety: stop if position is too old
      if (now - positionOpenedAt > maxAgeMs) {
        console.log(`⏰ Position ${position.id} exceeded max age (${config.max_position_age_hours}h), stopping monitor`);
        break;
      }
      
      // Re-fetch position to check if still open
      const { data: freshPosition, error } = await supabase
        .from("mega_whale_positions")
        .select("*")
        .eq("id", position.id)
        .eq("status", "open")
        .single();
      
      if (error || !freshPosition) {
        console.log(`Position ${position.id} no longer open, stopping monitor`);
        break;
      }
      
      const result = await checkAndUpdatePosition(supabase, freshPosition, config);
      
      const emoji = result.pnlPercent && result.pnlPercent > 0 ? "📈" : "📉";
      const partialInfo = freshPosition.partial_sells_count > 0 ? ` [Partial sells: ${freshPosition.partial_sells_count}]` : "";
      console.log(`${emoji} Check #${checkCount} | ${position.token_symbol || position.token_mint.slice(0,8)} | ` +
        `P&L: ${result.pnlPercent?.toFixed(2) || '?'}% | Price: ${result.currentPrice?.toExponential(4) || '?'} SOL${partialInfo}`);
      
      if (result.partial) {
        console.log(`💰 PARTIAL SELL executed - ${result.reason}. Continuing to monitor remaining position...`);
      }
      
      if (result.sold) {
        console.log(`✅ FULLY SOLD! ${position.token_symbol || position.token_mint} - ${result.reason}`);
        break;
      }
      
      // Wait for configured interval before next check
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
  } catch (error) {
    console.error(`Monitor error for ${position.id}:`, error);
  } finally {
    activeMonitors.delete(monitorKey);
    console.log(`🏁 Monitor ended for ${position.token_symbol || position.token_mint} after ${checkCount} checks`);
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

    console.log(`Position monitor triggered, batch: ${batchSize}`);

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

    // Get configs for all users
    const userIds = [...new Set(positions.map((p: Position) => p.user_id))];
    
    const { data: configs } = await supabase
      .from("mega_whale_auto_buy_config")
      .select("user_id, auto_sell_enabled, take_profit_pct, stop_loss_pct, trailing_stop_enabled, trailing_stop_pct, price_check_interval_seconds, max_position_age_hours, sell_percent_initial, sell_percent_remaining, remaining_position_take_profit_pct, remaining_position_stop_loss_pct")
      .in("user_id", userIds);

    const configMap = new Map<string, UserConfig>();
    (configs || []).forEach((c: UserConfig) => configMap.set(c.user_id, c));

    const results = {
      processed: 0,
      monitorsStarted: 0,
      alreadyMonitoring: 0,
    };

    // Start continuous monitoring for each position
    for (const position of positions as Position[]) {
      results.processed++;
      
      const config = configMap.get(position.user_id);
      if (!config) {
        console.log(`No config for user ${position.user_id}, skipping`);
        continue;
      }
      
      if (activeMonitors.has(position.id)) {
        results.alreadyMonitoring++;
        continue;
      }
      
      // Start background monitoring that runs until sold
      EdgeRuntime.waitUntil(
        monitorUntilSold(supabaseUrl, supabaseServiceKey, position, config)
      );
      results.monitorsStarted++;
    }

    console.log(`Monitor results:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        message: `Started ${results.monitorsStarted} continuous monitors (checking every ${configs?.[0]?.price_check_interval_seconds || 5}s until sold)`
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
