import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN FANTASY EXECUTOR
 * 
 * Purpose: Create virtual/simulated buy positions for tokens with status 'buy_now'
 * Schedule: Every minute via cron (when fantasy_mode_enabled = true)
 * 
 * FRESHNESS CHECKS:
 * - Only buy tokens that were promoted to buy_now within the last 30 minutes
 * - Verify token has active volume before buying
 * - Skip tokens with zero/stale metrics
 * 
 * Logic:
 * 1. Check if fantasy_mode_enabled in config
 * 2. Get FRESH tokens with status 'buy_now' (promoted within 30 mins)
 * 3. Verify token is still alive (has volume/price)
 * 4. Create fantasy position record with entry details
 * 5. Update watchlist with fantasy_position_id and move to 'holding'
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

interface FantasyConfig {
  is_enabled: boolean;
  fantasy_mode_enabled: boolean;
  fantasy_buy_amount_sol: number;
  fantasy_buy_amount_usd: number;
  fantasy_target_multiplier: number;
  fantasy_sell_percentage: number;
  fantasy_moonbag_percentage: number;
  fantasy_moonbag_drawdown_limit: number;
  fantasy_moonbag_volume_check: boolean;
  daily_buy_cap: number;
  daily_buys_today: number;
}

interface ExecutorStats {
  positionsCreated: number;
  tokensProcessed: number;
  totalVirtualSolDeployed: number;
  positions: Array<{ symbol: string; mint: string; entryPrice: number }>;
  errors: string[];
  durationMs: number;
}

// Get fantasy config
async function getConfig(supabase: any): Promise<FantasyConfig> {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    is_enabled: data?.is_enabled ?? true,
    fantasy_mode_enabled: data?.fantasy_mode_enabled ?? true,
    fantasy_buy_amount_sol: data?.fantasy_buy_amount_sol ?? 0.1,
    fantasy_buy_amount_usd: data?.fantasy_buy_amount_usd ?? 10,
    fantasy_target_multiplier: data?.fantasy_target_multiplier ?? 1.5,
    fantasy_sell_percentage: data?.fantasy_sell_percentage ?? 90,
    fantasy_moonbag_percentage: data?.fantasy_moonbag_percentage ?? 10,
    fantasy_moonbag_drawdown_limit: data?.fantasy_moonbag_drawdown_limit ?? 70,
    fantasy_moonbag_volume_check: data?.fantasy_moonbag_volume_check ?? true,
    daily_buy_cap: data?.daily_buy_cap ?? 50,
    daily_buys_today: data?.daily_buys_today ?? 0,
  };
}

// Get SOL price in USD
async function getSolPrice(): Promise<number> {
  // Try Jupiter first
  try {
    const response = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const data = await response.json();
    const price = data?.data?.['So11111111111111111111111111111111111111112']?.price;
    if (price && price > 0) return price;
  } catch (e) {
    console.error('Jupiter SOL price failed:', e);
  }
  
  // Try CoinGecko as backup
  try {
    const apiKey = Deno.env.get('COINGECKO_API_KEY');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data?.solana?.usd) return data.solana.usd;
    }
  } catch (e) {
    console.error('CoinGecko SOL price failed:', e);
  }
  
  // NO FALLBACK - throw error
  throw new Error('CRITICAL: Cannot fetch SOL price from any source');
}

// Get token price from Jupiter
async function getTokenPrice(mint: string, solPrice: number): Promise<{ priceUsd: number; priceSol: number } | null> {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    const data = await response.json();
    const priceUsd = data?.data?.[mint]?.price;
    
    if (priceUsd) {
      return {
        priceUsd,
        priceSol: priceUsd / solPrice,
      };
    }

    // Fallback to DexScreener
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const dexData = await dexResponse.json();
    const pair = dexData?.pairs?.[0];
    
    if (pair?.priceUsd) {
      return {
        priceUsd: parseFloat(pair.priceUsd),
        priceSol: parseFloat(pair.priceUsd) / solPrice,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching price for ${mint}:`, error);
    return null;
  }
}

// Calculate token age in minutes from blockchain timestamp
function calculateTokenAgeMins(createdAt: string | null): number | null {
  if (!createdAt) return null;
  try {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
  } catch {
    return null;
  }
}

// Count socials from watchlist data
function countSocials(token: any): number {
  let count = 0;
  if (token.twitter) count++;
  if (token.telegram) count++;
  if (token.website) count++;
  if (token.discord) count++;
  return count;
}

// Create fantasy positions
async function executeFantasyBuys(supabase: any): Promise<ExecutorStats> {
  const startTime = Date.now();
  const stats: ExecutorStats = {
    positionsCreated: 0,
    tokensProcessed: 0,
    totalVirtualSolDeployed: 0,
    positions: [],
    errors: [],
    durationMs: 0,
  };

  console.log('🎮 FANTASY EXECUTOR: Starting fantasy buy cycle...');

  const config = await getConfig(supabase);

  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!config.fantasy_mode_enabled) {
    console.log('⏸️ Fantasy mode disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Check daily cap
  if (config.daily_buys_today >= config.daily_buy_cap) {
    console.log(`⚠️ Daily cap reached (${config.daily_buys_today}/${config.daily_buy_cap})`);
    stats.errors.push('Daily buy cap reached');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const remainingBuys = config.daily_buy_cap - config.daily_buys_today;

  // FRESHNESS CHECK: Only get buy_now tokens that were promoted within the last 30 minutes
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Get FRESH buy_now tokens that haven't been fantasy-bought
  const { data: buyNowTokens, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'buy_now')
    .is('fantasy_position_id', null)
    .gte('qualified_at', thirtyMinsAgo) // FRESHNESS: Must be promoted within 30 mins
    .order('qualified_at', { ascending: false }) // Newest first
    .limit(Math.min(10, remainingBuys));

  if (fetchError) {
    console.error('Error fetching buy_now tokens:', fetchError);
    stats.errors.push(fetchError.message);
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Log how many tokens we're skipping due to staleness
  const { count: staleCount } = await supabase
    .from('pumpfun_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'buy_now')
    .is('fantasy_position_id', null)
    .lt('qualified_at', thirtyMinsAgo);

  if (staleCount && staleCount > 0) {
    console.log(`⏰ Skipping ${staleCount} stale buy_now tokens (older than 30 mins)`);
  }

  console.log(`📋 Found ${buyNowTokens?.length || 0} FRESH tokens for fantasy execution`);

  if (!buyNowTokens?.length) {
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Get SOL price once
  const solPrice = await getSolPrice();
  console.log(`💰 SOL price: $${solPrice.toFixed(2)}`);

  const now = new Date().toISOString();

  for (const token of buyNowTokens) {
    stats.tokensProcessed++;

    try {
      // Check if ANY position (open OR closed) exists for this token within last 24 hours
      // This prevents re-buying tokens that we already traded recently
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosition } = await supabase
        .from('pumpfun_fantasy_positions')
        .select('id, status, created_at')
        .eq('token_mint', token.token_mint)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1)
        .maybeSingle();

      if (recentPosition) {
        console.log(`⚠️ Already traded ${token.token_symbol} within 24h (status: ${recentPosition.status}), skipping`);
        continue;
      }

      // FRESHNESS: Calculate token age
      const tokenAge = Date.now() - new Date(token.qualified_at).getTime();
      const tokenAgeMinutes = Math.floor(tokenAge / (1000 * 60));
      
      // Skip if token is somehow too old (shouldn't happen with query filter but double-check)
      if (tokenAgeMinutes > 30) {
        console.log(`⏰ Skipping ${token.token_symbol} - too old (${tokenAgeMinutes} mins)`);
        stats.errors.push(`${token.token_symbol}: Too old (${tokenAgeMinutes} mins)`);
        continue;
      }

      // Get current token price
      const price = await getTokenPrice(token.token_mint, solPrice);
      
      if (!price) {
        console.log(`⚠️ Could not get price for ${token.token_symbol}, using watchlist price`);
        // Use price from watchlist if available
        if (!token.price_usd) {
          stats.errors.push(`${token.token_symbol}: No price available`);
          continue;
        }
      }

      const entryPriceUsd = price?.priceUsd || token.price_usd || 0;
      const entryPriceSol = price?.priceSol || (token.price_usd / solPrice) || 0;

      if (entryPriceUsd <= 0) {
        stats.errors.push(`${token.token_symbol}: Invalid price`);
        continue;
      }

      // LIVENESS CHECK: Verify token still has activity (volume or recent tx)
      const hasVolume = (token.volume_sol || 0) > 0.05 || (token.tx_count || 0) > 5;
      if (!hasVolume && tokenAgeMinutes > 10) {
        console.log(`💀 Skipping ${token.token_symbol} - no volume/activity detected`);
        stats.errors.push(`${token.token_symbol}: Dead token (no activity)`);
        continue;
      }

      // Calculate token amount based on USD amount
      const buyAmountUsd = config.fantasy_buy_amount_usd || 10;
      const buyAmountSol = buyAmountUsd / solPrice;
      const tokenAmount = buyAmountSol / entryPriceSol;

      // Calculate entry snapshot data for AI learning
      const entryMarketCapUsd = token.market_cap || token.market_cap_usd || null;
      const entryHolderCount = token.holder_count || null;
      const entryVolume24hSol = token.volume_24h_sol || token.volume_sol || null;
      const entryTokenAgeMins = calculateTokenAgeMins(token.created_at_blockchain);
      const entryBondingCurvePct = token.bonding_curve_progress || null;
      const entryRugcheckScore = token.rugcheck_score || null;
      const entrySignalStrengthRaw = token.signal_strength || null;
      const entrySocialsCount = countSocials(token);

      console.log(`📸 Entry snapshot for ${token.token_symbol}: MC=$${entryMarketCapUsd?.toFixed(0) || '?'}, Holders=${entryHolderCount || '?'}, Age=${entryTokenAgeMins || '?'}m, Rugcheck=${entryRugcheckScore || '?'}`);

      // Create fantasy position with entry snapshot
      const { data: position, error: insertError } = await supabase
        .from('pumpfun_fantasy_positions')
        .insert({
          watchlist_id: token.id,
          token_mint: token.token_mint,
          token_symbol: token.token_symbol,
          token_name: token.token_name,
          entry_price_usd: entryPriceUsd,
          entry_price_sol: entryPriceSol,
          entry_amount_sol: buyAmountSol,
          token_amount: tokenAmount,
          entry_at: now,
          current_price_usd: entryPriceUsd,
          current_price_sol: entryPriceSol,
          status: 'open',
          target_multiplier: config.fantasy_target_multiplier,
          sell_percentage: config.fantasy_sell_percentage,
          moonbag_percentage: config.fantasy_moonbag_percentage,
          signal_strength: typeof token.score === 'number' ? token.score : null,
          peak_price_usd: entryPriceUsd,
          peak_multiplier: 1.0,
          peak_at: now,
          // Entry snapshot for AI learning
          entry_market_cap_usd: entryMarketCapUsd,
          entry_holder_count: entryHolderCount,
          entry_volume_24h_sol: entryVolume24hSol,
          entry_token_age_mins: entryTokenAgeMins,
          entry_bonding_curve_pct: entryBondingCurvePct,
          entry_rugcheck_score: entryRugcheckScore,
          entry_signal_strength_raw: entrySignalStrengthRaw,
          entry_socials_count: entrySocialsCount,
        })
        .select()
        .single();

      if (insertError) {
        console.error(`Error creating fantasy position for ${token.token_symbol}:`, insertError);
        stats.errors.push(`${token.token_symbol}: ${insertError.message}`);
        continue;
      }

      // Update watchlist with fantasy position reference
      await supabase
        .from('pumpfun_watchlist')
        .update({
          fantasy_position_id: position.id,
          status: 'holding',
        })
        .eq('id', token.id);

      stats.positionsCreated++;
      stats.totalVirtualSolDeployed += buyAmountSol;
      stats.positions.push({
        symbol: token.token_symbol,
        mint: token.token_mint,
        entryPrice: entryPriceUsd,
      });

      console.log(`🎮 FANTASY BUY: ${token.token_symbol} @ $${entryPriceUsd.toFixed(8)} ($${buyAmountUsd} = ${buyAmountSol.toFixed(4)} SOL = ${tokenAmount.toFixed(2)} tokens)`);

    } catch (error) {
      console.error(`Error processing ${token.token_symbol}:`, error);
      stats.errors.push(`${token.token_symbol}: ${String(error)}`);
    }

    // Small delay between positions
    await new Promise(r => setTimeout(r, 100));
  }

  // Update daily counter
  if (stats.positionsCreated > 0) {
    await supabase
      .from('pumpfun_monitor_config')
      .update({ 
        daily_buys_today: config.daily_buys_today + stats.positionsCreated 
      })
      .not('id', 'is', null); // Update all rows
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 FANTASY EXECUTOR COMPLETE: ${stats.positionsCreated} positions created, ${stats.totalVirtualSolDeployed.toFixed(3)} virtual SOL deployed (${stats.durationMs}ms)`);

  return stats;
}

// Get fantasy stats
async function getStats(supabase: any) {
  const config = await getConfig(supabase);

  const { data: positions } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('status, total_realized_pnl_sol, entry_amount_sol');

  const openCount = positions?.filter((p: any) => p.status === 'open').length || 0;
  const moonbagCount = positions?.filter((p: any) => p.status === 'moonbag').length || 0;
  const closedCount = positions?.filter((p: any) => p.status === 'closed').length || 0;
  
  const totalInvested = positions?.reduce((sum: number, p: any) => sum + (p.entry_amount_sol || 0), 0) || 0;
  const totalPnl = positions?.reduce((sum: number, p: any) => sum + (p.total_realized_pnl_sol || 0), 0) || 0;

  return {
    fantasyModeEnabled: config.fantasy_mode_enabled,
    buyAmountSol: config.fantasy_buy_amount_sol,
    targetMultiplier: config.fantasy_target_multiplier,
    dailyBuysRemaining: config.daily_buy_cap - config.daily_buys_today,
    positions: {
      open: openCount,
      moonbag: moonbagCount,
      closed: closedCount,
      total: positions?.length || 0,
    },
    totalVirtualInvested: totalInvested,
    totalRealizedPnl: totalPnl,
  };
}

// Manual add to fantasy - add any token by mint address
async function manualFantasyBuy(supabase: any, tokenMint: string): Promise<{ success: boolean; position?: any; error?: string }> {
  console.log(`🎮 MANUAL FANTASY BUY: Processing ${tokenMint}`);

  const config = await getConfig(supabase);
  
  if (!config.fantasy_mode_enabled) {
    return { success: false, error: 'Fantasy mode is disabled' };
  }

  // Check if position already exists
  const { data: existing } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('id, token_symbol')
    .eq('token_mint', tokenMint)
    .eq('status', 'open')
    .limit(1)
    .single();

  if (existing) {
    return { success: false, error: `Position already exists for ${existing.token_symbol || tokenMint}` };
  }

  // Get SOL price
  const solPrice = await getSolPrice();
  
  // Get token price and metadata
  const price = await getTokenPrice(tokenMint, solPrice);
  
  // Variables for entry snapshot
  let tokenSymbol = tokenMint.slice(0, 6);
  let tokenName = tokenMint.slice(0, 6);
  let entryMarketCapUsd: number | null = null;
  let entryHolderCount: number | null = null;
  let entryVolume24hSol: number | null = null;
  let entryTokenAgeMins: number | null = null;
  let entryBondingCurvePct: number | null = null;
  let entryRugcheckScore: number | null = null;
  let entrySocialsCount = 0;
  
  // Try to get token info from pump.fun
  try {
    const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (pumpResponse.ok) {
      const pumpData = await pumpResponse.json();
      tokenSymbol = pumpData.symbol || tokenSymbol;
      tokenName = pumpData.name || tokenName;
      entryMarketCapUsd = pumpData.usd_market_cap || pumpData.market_cap || null;
      entryBondingCurvePct = pumpData.bonding_curve_progress || null;
      
      // Calculate token age from pump.fun data
      if (pumpData.created_timestamp) {
        const created = new Date(pumpData.created_timestamp);
        const now = new Date();
        entryTokenAgeMins = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
      }
      
      // Count socials
      if (pumpData.twitter) entrySocialsCount++;
      if (pumpData.telegram) entrySocialsCount++;
      if (pumpData.website) entrySocialsCount++;
    }
  } catch (e) {
    console.log('Could not fetch pump.fun metadata');
  }

  // Try DexScreener for additional data
  try {
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const dexData = await dexResponse.json();
    const pair = dexData?.pairs?.[0];
    if (pair) {
      if (!tokenSymbol || tokenSymbol === tokenMint.slice(0, 6)) {
        tokenSymbol = pair.baseToken?.symbol || tokenSymbol;
        tokenName = pair.baseToken?.name || tokenName;
      }
      if (!entryMarketCapUsd && pair.marketCap) {
        entryMarketCapUsd = pair.marketCap;
      }
      if (pair.volume?.h24) {
        entryVolume24hSol = pair.volume.h24 / solPrice;
      }
    }
  } catch (e2) {
    console.log('Could not fetch DexScreener metadata');
  }

  // Try RugCheck
  try {
    const rugcheckResponse = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report/summary`);
    if (rugcheckResponse.ok) {
      const rugData = await rugcheckResponse.json();
      entryRugcheckScore = rugData.score || null;
    }
  } catch (e) {
    console.log('Could not fetch RugCheck score');
  }

  if (!price || price.priceUsd <= 0) {
    return { success: false, error: 'Could not fetch token price' };
  }

  // Calculate buy amount in SOL from USD
  const buyAmountUsd = config.fantasy_buy_amount_usd || 10;
  const buyAmountSol = buyAmountUsd / solPrice;
  
  const now = new Date().toISOString();
  const tokenAmount = buyAmountSol / price.priceSol;

  console.log(`📸 Manual entry snapshot for ${tokenSymbol}: MC=$${entryMarketCapUsd?.toFixed(0) || '?'}, Age=${entryTokenAgeMins || '?'}m, Rugcheck=${entryRugcheckScore || '?'}`);

  // Create fantasy position with entry snapshot
  const { data: position, error: insertError } = await supabase
    .from('pumpfun_fantasy_positions')
    .insert({
      watchlist_id: null, // Manual add - no watchlist entry
      token_mint: tokenMint,
      token_symbol: tokenSymbol,
      token_name: tokenName,
      entry_price_usd: price.priceUsd,
      entry_price_sol: price.priceSol,
      entry_amount_sol: buyAmountSol,
      token_amount: tokenAmount,
      entry_at: now,
      current_price_usd: price.priceUsd,
      current_price_sol: price.priceSol,
      status: 'open',
      target_multiplier: config.fantasy_target_multiplier,
      sell_percentage: config.fantasy_sell_percentage,
      moonbag_percentage: config.fantasy_moonbag_percentage,
      signal_strength: null, // Manual adds don't have a signal score
      peak_price_usd: price.priceUsd,
      peak_multiplier: 1.0,
      peak_at: now,
      // Entry snapshot for AI learning
      entry_market_cap_usd: entryMarketCapUsd,
      entry_holder_count: entryHolderCount,
      entry_volume_24h_sol: entryVolume24hSol,
      entry_token_age_mins: entryTokenAgeMins,
      entry_bonding_curve_pct: entryBondingCurvePct,
      entry_rugcheck_score: entryRugcheckScore,
      entry_signal_strength_raw: 'manual',
      entry_socials_count: entrySocialsCount,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating manual fantasy position:', insertError);
    return { success: false, error: insertError.message };
  }

  console.log(`🎮 MANUAL FANTASY BUY SUCCESS: ${tokenSymbol} @ $${price.priceUsd.toFixed(8)} ($${buyAmountUsd} = ${buyAmountSol.toFixed(4)} SOL = ${tokenAmount.toFixed(2)} tokens)`);

  return { 
    success: true, 
    position: {
      id: position.id,
      symbol: tokenSymbol,
      name: tokenName,
      entryPrice: price.priceUsd,
      tokenAmount,
      amountSol: buyAmountSol,
      amountUsd: buyAmountUsd,
    }
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
    const action = url.searchParams.get('action') || 'execute';

    console.log(`🎯 pumpfun-fantasy-executor action: ${action}`);

    switch (action) {
      case 'execute': {
        const stats = await executeFantasyBuys(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        const stats = await getStats(supabase);
        return jsonResponse({ success: true, ...stats });
      }

      case 'manual_buy': {
        const body = await req.json();
        const tokenMint = body.tokenMint || body.token_mint;
        
        if (!tokenMint) {
          return errorResponse('tokenMint is required');
        }
        
        const result = await manualFantasyBuy(supabase, tokenMint);
        return jsonResponse(result, result.success ? 200 : 400);
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-fantasy-executor:', error);
    return errorResponse(String(error), 500);
  }
});
