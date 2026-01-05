import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN LIVE SELL MONITOR
 * 
 * Purpose: Monitor REAL positions, execute 90% sell at 1.5x target, track moonbags
 * Schedule: Every minute via cron
 * 
 * This is the LIVE equivalent of pumpfun-fantasy-sell-monitor
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

interface SellConfig {
  target_multiplier: number;
  sell_percentage: number;
  moonbag_percentage: number;
  moonbag_drawdown_limit: number;
  buy_wallet_id: string | null;
}

interface MonitorStats {
  positionsChecked: number;
  pricesUpdated: number;
  targetsSold: number;
  moonbagsCreated: number;
  moonbagsClosed: number;
  lpRemovalDetected: number;
  drawdownExits: number;
  errors: string[];
  durationMs: number;
}

// Get config - uses same config as fantasy but with live wallet
async function getConfig(supabase: any): Promise<SellConfig> {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('fantasy_target_multiplier, fantasy_sell_percentage, fantasy_moonbag_percentage, fantasy_moonbag_drawdown_limit, buy_wallet_id')
    .limit(1)
    .single();

  return {
    target_multiplier: data?.fantasy_target_multiplier ?? 1.5,
    sell_percentage: data?.fantasy_sell_percentage ?? 90,
    moonbag_percentage: data?.fantasy_moonbag_percentage ?? 10,
    moonbag_drawdown_limit: data?.fantasy_moonbag_drawdown_limit ?? 70,
    buy_wallet_id: data?.buy_wallet_id ?? null,
  };
}

// Get SOL price
async function getSolPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await response.json();
    return data?.data?.['So11111111111111111111111111111111111111112']?.price || 200;
  } catch {
    return 200;
  }
}

// Batch fetch prices from Jupiter
async function batchFetchPrices(mints: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  if (mints.length === 0) return priceMap;

  try {
    const batchSize = 100;
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      const response = await fetch(`https://api.jup.ag/price/v2?ids=${batch.join(',')}`);
      const data = await response.json();
      
      for (const mint of batch) {
        if (data?.data?.[mint]?.price) {
          priceMap.set(mint, data.data[mint].price);
        }
      }
      
      if (i + batchSize < mints.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch (error) {
    console.error('Error batch fetching prices:', error);
  }

  return priceMap;
}

// Check liquidity for moonbag positions
async function checkLiquidity(mint: string): Promise<{ liquidityUsd: number | null; lpRemoved: boolean }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await response.json();
    const pair = data?.pairs?.[0];
    
    if (!pair) {
      return { liquidityUsd: null, lpRemoved: true };
    }

    const liquidityUsd = pair.liquidity?.usd || 0;
    const lpRemoved = liquidityUsd < 500;
    
    return { liquidityUsd, lpRemoved };
  } catch (error) {
    console.error(`Error checking liquidity for ${mint}:`, error);
    return { liquidityUsd: null, lpRemoved: false };
  }
}

// Execute sell via raydium-swap
async function executeSell(
  supabase: any,
  walletId: string,
  tokenMint: string,
  tokenAmount: number,
  percentage: number
): Promise<{ success: boolean; signature?: string; amountSol?: number; error?: string }> {
  try {
    const sellAmount = Math.floor(tokenAmount * (percentage / 100));
    
    console.log(`🔄 Executing ${percentage}% sell: ${sellAmount} tokens of ${tokenMint}`);
    
    // Call raydium-swap to execute the sell
    const { data, error } = await supabase.functions.invoke('raydium-swap', {
      body: {
        action: 'swap',
        walletId,
        inputMint: tokenMint,
        outputMint: 'So11111111111111111111111111111111111111112', // SOL
        amount: sellAmount,
        slippageBps: 500,
      }
    });

    if (error) {
      console.error('Sell execution error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Unknown swap error' };
    }

    return {
      success: true,
      signature: data.signature,
      amountSol: data.outputAmount || 0,
    };
  } catch (error) {
    console.error('Sell error:', error);
    return { success: false, error: String(error) };
  }
}

// Main monitoring logic for LIVE positions
async function monitorPositions(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    positionsChecked: 0,
    pricesUpdated: 0,
    targetsSold: 0,
    moonbagsCreated: 0,
    moonbagsClosed: 0,
    lpRemovalDetected: 0,
    drawdownExits: 0,
    errors: [],
    durationMs: 0,
  };

  console.log('📊 LIVE SELL MONITOR: Starting monitoring cycle...');

  const config = await getConfig(supabase);

  if (!config.buy_wallet_id) {
    console.log('⚠️ No buy_wallet_id configured, skipping live sell monitor');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Get all live positions that need monitoring
  // These are tokens in watchlist with status='holding' (bought) or 'moonbag'
  const { data: positions, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['holding', 'moonbag'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching positions:', error);
    stats.errors.push(error.message);
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!positions?.length) {
    console.log('📋 No live positions to monitor');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`📋 Monitoring ${positions.length} live positions`);

  const solPrice = await getSolPrice();
  const mints = [...new Set(positions.map((p: any) => p.token_mint))];
  const priceMap = await batchFetchPrices(mints);

  const now = new Date().toISOString();

  for (const position of positions) {
    stats.positionsChecked++;

    try {
      const currentPriceUsd = priceMap.get(position.token_mint);
      
      if (!currentPriceUsd) {
        console.log(`⚠️ No price for ${position.token_symbol}, skipping`);
        continue;
      }

      const entryPriceUsd = position.metadata?.entry_price_usd || position.price_usd;
      if (!entryPriceUsd) {
        console.log(`⚠️ No entry price for ${position.token_symbol}, skipping`);
        continue;
      }

      const multiplier = currentPriceUsd / entryPriceUsd;
      const isNewPeak = currentPriceUsd > (position.price_ath_usd || 0);

      if (position.status === 'holding') {
        // Check if target hit
        if (multiplier >= config.target_multiplier) {
          console.log(`🎯 TARGET HIT: ${position.token_symbol} @ ${multiplier.toFixed(2)}x (target: ${config.target_multiplier}x)`);

          // Get token balance from metadata
          const tokenAmount = position.metadata?.token_amount || 0;
          
          if (tokenAmount > 0) {
            // Execute 90% sell
            const sellResult = await executeSell(
              supabase,
              config.buy_wallet_id!,
              position.token_mint,
              tokenAmount,
              config.sell_percentage
            );

            if (sellResult.success) {
              const moonbagAmount = tokenAmount * (config.moonbag_percentage / 100);
              
              // Update position to moonbag status
              await supabase
                .from('pumpfun_watchlist')
                .update({
                  status: 'moonbag',
                  price_usd: currentPriceUsd,
                  price_ath_usd: isNewPeak ? currentPriceUsd : position.price_ath_usd,
                  metadata: {
                    ...position.metadata,
                    main_sold_at: now,
                    main_sold_price_usd: currentPriceUsd,
                    main_sold_signature: sellResult.signature,
                    main_sold_amount_sol: sellResult.amountSol,
                    moonbag_token_amount: moonbagAmount,
                    moonbag_entry_price_usd: currentPriceUsd,
                    moonbag_peak_price_usd: currentPriceUsd,
                  },
                  last_checked_at: now,
                })
                .eq('id', position.id);

              stats.targetsSold++;
              stats.moonbagsCreated++;
              
              console.log(`💰 SOLD 90%: ${position.token_symbol} | ${sellResult.amountSol?.toFixed(4)} SOL | Sig: ${sellResult.signature?.slice(0, 20)}...`);

              // Update dev reputation on successful trade
              if (position.creator_wallet) {
                console.log(`📊 Updating dev reputation for: ${position.creator_wallet}`);
                try {
                  await supabase.functions.invoke('pumpfun-dev-tracker', {
                    body: {
                      action: 'update_on_success',
                      devWallet: position.creator_wallet,
                      tokenMint: position.token_mint,
                    }
                  });
                  
                  // Also link social accounts if available
                  const twitterUrl = position.twitter_url || position.metadata?.twitter_url;
                  const telegramUrl = position.telegram_url || position.metadata?.telegram_url;
                  
                  if (twitterUrl || telegramUrl) {
                    // Extract handle from URL
                    const twitterHandle = twitterUrl ? twitterUrl.split('/').pop()?.replace('@', '') : null;
                    const telegramGroup = telegramUrl ? telegramUrl.split('/').pop() : null;
                    
                    await supabase.functions.invoke('pumpfun-dev-tracker', {
                      body: {
                        action: 'link_social_accounts',
                        devWallet: position.creator_wallet,
                        twitterHandle,
                        telegramGroup,
                      }
                    });
                  }
                } catch (devErr) {
                  console.error('Dev tracker update error:', devErr);
                }
              }
            } else {
              stats.errors.push(`Sell failed for ${position.token_symbol}: ${sellResult.error}`);
              console.error(`❌ Sell failed: ${sellResult.error}`);
            }
          }

        } else {
          // Just update price tracking
          await supabase
            .from('pumpfun_watchlist')
            .update({
              price_usd: currentPriceUsd,
              price_ath_usd: isNewPeak ? currentPriceUsd : position.price_ath_usd,
              last_checked_at: now,
            })
            .eq('id', position.id);

          stats.pricesUpdated++;
        }

      } else if (position.status === 'moonbag') {
        // Monitor moonbag for exit conditions
        const moonbagPeakPrice = position.metadata?.moonbag_peak_price_usd || currentPriceUsd;
        const isNewMoonbagPeak = currentPriceUsd > moonbagPeakPrice;
        const effectivePeak = isNewMoonbagPeak ? currentPriceUsd : moonbagPeakPrice;
        const drawdownPct = ((effectivePeak - currentPriceUsd) / effectivePeak) * 100;

        // Check LP status
        const { liquidityUsd, lpRemoved } = await checkLiquidity(position.token_mint);

        let shouldExit = false;
        let exitReason = '';

        if (lpRemoved) {
          shouldExit = true;
          exitReason = 'lp_removed';
          stats.lpRemovalDetected++;
          console.log(`🚨 LP REMOVED: ${position.token_symbol}`);
        } else if (drawdownPct >= config.moonbag_drawdown_limit) {
          shouldExit = true;
          exitReason = 'drawdown';
          stats.drawdownExits++;
          console.log(`📉 DRAWDOWN EXIT: ${position.token_symbol} @ ${drawdownPct.toFixed(1)}% drawdown`);
        }

        if (shouldExit) {
          const moonbagAmount = position.metadata?.moonbag_token_amount || 0;
          
          if (moonbagAmount > 0) {
            // Sell remaining moonbag
            const sellResult = await executeSell(
              supabase,
              config.buy_wallet_id!,
              position.token_mint,
              moonbagAmount,
              100 // Sell 100% of moonbag
            );

            // Update to closed status
            await supabase
              .from('pumpfun_watchlist')
              .update({
                status: 'sold',
                price_usd: currentPriceUsd,
                metadata: {
                  ...position.metadata,
                  moonbag_sold_at: now,
                  moonbag_sold_price_usd: currentPriceUsd,
                  moonbag_sold_signature: sellResult.signature,
                  moonbag_sold_amount_sol: sellResult.amountSol,
                  exit_reason: exitReason,
                  lp_liquidity_usd: liquidityUsd,
                },
                removal_reason: `Moonbag exit: ${exitReason}`,
                removed_at: now,
                last_checked_at: now,
              })
              .eq('id', position.id);

            stats.moonbagsClosed++;
            console.log(`🏁 MOONBAG SOLD: ${position.token_symbol} | Reason: ${exitReason} | ${sellResult.amountSol?.toFixed(4)} SOL`);
          }

        } else {
          // Update moonbag tracking
          await supabase
            .from('pumpfun_watchlist')
            .update({
              price_usd: currentPriceUsd,
              metadata: {
                ...position.metadata,
                moonbag_peak_price_usd: isNewMoonbagPeak ? currentPriceUsd : moonbagPeakPrice,
                moonbag_drawdown_pct: drawdownPct,
                lp_liquidity_usd: liquidityUsd,
                lp_checked_at: now,
              },
              last_checked_at: now,
            })
            .eq('id', position.id);

          stats.pricesUpdated++;
        }

        await new Promise(r => setTimeout(r, 100));
      }

    } catch (error) {
      console.error(`Error processing ${position.token_symbol}:`, error);
      stats.errors.push(`${position.token_symbol}: ${String(error)}`);
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 LIVE SELL MONITOR COMPLETE: ${stats.positionsChecked} checked, ${stats.targetsSold} targets hit, ${stats.moonbagsClosed} moonbags closed (${stats.durationMs}ms)`);

  return stats;
}

// Get summary stats for live positions
async function getLiveStats(supabase: any) {
  const { data: positions } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['holding', 'moonbag', 'sold']);

  if (!positions?.length) {
    return {
      totalPositions: 0,
      holdingPositions: 0,
      moonbagPositions: 0,
      soldPositions: 0,
      totalRealizedSol: 0,
    };
  }

  const holdingPositions = positions.filter((p: any) => p.status === 'holding');
  const moonbagPositions = positions.filter((p: any) => p.status === 'moonbag');
  const soldPositions = positions.filter((p: any) => p.status === 'sold');

  const totalRealizedSol = soldPositions.reduce((sum: number, p: any) => {
    const mainSold = p.metadata?.main_sold_amount_sol || 0;
    const moonbagSold = p.metadata?.moonbag_sold_amount_sol || 0;
    return sum + mainSold + moonbagSold;
  }, 0);

  return {
    totalPositions: positions.length,
    holdingPositions: holdingPositions.length,
    moonbagPositions: moonbagPositions.length,
    soldPositions: soldPositions.length,
    totalRealizedSol,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'monitor';

    console.log(`🎯 pumpfun-sell-monitor action: ${action}`);

    switch (action) {
      case 'monitor': {
        const stats = await monitorPositions(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'stats': {
        const stats = await getLiveStats(supabase);
        return jsonResponse({ success: true, ...stats });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-sell-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
