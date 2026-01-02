import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN BUY EXECUTOR
 * 
 * Purpose: Automatically execute buys for tokens with status 'buy_now'
 * Schedule: Every 30 seconds via cron (or on-demand)
 * 
 * Logic:
 * 1. Get tokens with status 'buy_now' that haven't been bought yet
 * 2. Check if auto_buy_enabled in config
 * 3. For each token, call raydium-swap to execute the buy
 * 4. Update token with buy execution details
 * 5. If buy succeeds, move to 'holding' status
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

interface ExecutorStats {
  tokensProcessed: number;
  buysAttempted: number;
  buysSucceeded: number;
  buysFailed: number;
  durationMs: number;
  executedTokens: string[];
  failedTokens: string[];
  errors: string[];
}

interface BuyConfig {
  is_enabled: boolean;
  auto_buy_enabled: boolean;
  buy_amount_sol: number;
  max_buy_price_usd: number;
  buy_slippage_bps: number;
  buy_priority_fee_sol: number;
  buy_wallet_id: string | null;
  daily_buy_cap: number;
  daily_buys_today: number;
}

// Get config
async function getConfig(supabase: any): Promise<BuyConfig> {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    is_enabled: data?.is_enabled ?? true,
    auto_buy_enabled: data?.auto_buy_enabled ?? false,
    buy_amount_sol: data?.buy_amount_sol ?? 0.05,
    max_buy_price_usd: data?.max_buy_price_usd ?? 0.001,
    buy_slippage_bps: data?.buy_slippage_bps ?? 500,
    buy_priority_fee_sol: data?.buy_priority_fee_sol ?? 0.001,
    buy_wallet_id: data?.buy_wallet_id ?? null,
    daily_buy_cap: data?.daily_buy_cap ?? 20,
    daily_buys_today: data?.daily_buys_today ?? 0,
  };
}

// Check if token is still on bonding curve (pump.fun)
async function checkBondingCurve(mint: string): Promise<{ onBondingCurve: boolean; bondingCurvePct: number | null }> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!response.ok) {
      return { onBondingCurve: false, bondingCurvePct: null };
    }
    
    const data = await response.json();
    const bondingCurvePct = data.bonding_curve_percentage ?? data.bondingCurvePercentage ?? null;
    
    // If bondingCurvePct is null or 100, it's graduated
    const onBondingCurve = bondingCurvePct !== null && bondingCurvePct < 100;
    
    return { onBondingCurve, bondingCurvePct };
  } catch (error) {
    console.error(`Error checking bonding curve for ${mint}:`, error);
    return { onBondingCurve: true, bondingCurvePct: null }; // Assume on curve if error
  }
}

// Check if token has graduated to Raydium
async function checkRaydiumPool(mint: string): Promise<{ graduated: boolean; poolAddress: string | null }> {
  try {
    // Check DexScreener for Raydium pool
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) {
      return { graduated: false, poolAddress: null };
    }
    
    const data = await response.json();
    const pairs = data.pairs || [];
    
    // Look for Raydium pool
    const raydiumPool = pairs.find((p: any) => 
      p.dexId === 'raydium' || 
      p.dexId === 'raydium-clmm' ||
      p.labels?.includes('v4')
    );
    
    if (raydiumPool) {
      return { 
        graduated: true, 
        poolAddress: raydiumPool.pairAddress || null 
      };
    }
    
    return { graduated: false, poolAddress: null };
  } catch (error) {
    console.error(`Error checking Raydium pool for ${mint}:`, error);
    return { graduated: false, poolAddress: null };
  }
}

// Execute buy via raydium-swap function
async function executeBuy(
  supabase: any,
  token: any,
  config: BuyConfig
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  try {
    if (!config.buy_wallet_id) {
      return { success: false, error: 'No buy wallet configured' };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';
    
    // Determine which API to use based on graduation status
    const { onBondingCurve } = await checkBondingCurve(token.token_mint);
    
    // Use pump.fun API if still on bonding curve, otherwise use Raydium
    const requestBody: any = {
      walletId: config.buy_wallet_id,
      tokenMint: token.token_mint,
      side: 'buy',
      amount: config.buy_amount_sol,
      slippageBps: config.buy_slippage_bps,
    };

    // If on bonding curve, add pump.fun specific params
    if (onBondingCurve) {
      requestBody.usePumpPortal = true;
      requestBody.pool = 'pump';
    }

    console.log(`🛒 Executing buy for ${token.token_symbol}: ${config.buy_amount_sol} SOL (${onBondingCurve ? 'pump.fun' : 'Raydium'})`);

    const response = await fetch(`${supabaseUrl}/functions/v1/raydium-swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    if (result.error) {
      console.error(`❌ Buy failed for ${token.token_symbol}:`, result.error);
      return { success: false, error: result.error };
    }

    if (result.signature || result.txSignature) {
      console.log(`✅ Buy succeeded for ${token.token_symbol}: ${result.signature || result.txSignature}`);
      return { success: true, txSignature: result.signature || result.txSignature };
    }

    return { success: false, error: 'No transaction signature returned' };
  } catch (error) {
    console.error(`Error executing buy for ${token.token_symbol}:`, error);
    return { success: false, error: String(error) };
  }
}

// Main executor logic
async function executeBuys(supabase: any): Promise<ExecutorStats> {
  const startTime = Date.now();
  const stats: ExecutorStats = {
    tokensProcessed: 0,
    buysAttempted: 0,
    buysSucceeded: 0,
    buysFailed: 0,
    durationMs: 0,
    executedTokens: [],
    failedTokens: [],
    errors: [],
  };

  console.log('🚀 BUY EXECUTOR: Starting buy execution cycle...');

  const config = await getConfig(supabase);
  
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!config.auto_buy_enabled) {
    console.log('⏸️ Auto-buy disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!config.buy_wallet_id) {
    console.log('⚠️ No buy wallet configured, skipping');
    stats.errors.push('No buy wallet configured');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Check daily cap
  if (config.daily_buys_today >= config.daily_buy_cap) {
    console.log(`⚠️ Daily buy cap reached (${config.daily_buys_today}/${config.daily_buy_cap})`);
    stats.errors.push('Daily buy cap reached');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  const remainingBuys = config.daily_buy_cap - config.daily_buys_today;

  // Get buy_now tokens that haven't been bought yet
  const { data: buyNowTokens, error: fetchError } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'buy_now')
    .is('buy_executed_at', null)
    .order('qualified_at', { ascending: true }) // FIFO
    .limit(Math.min(5, remainingBuys)); // Process max 5 at a time

  if (fetchError) {
    console.error('Error fetching buy_now tokens:', fetchError);
    stats.errors.push(fetchError.message);
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`📋 Found ${buyNowTokens?.length || 0} tokens ready for buy execution`);

  const now = new Date().toISOString();

  for (const token of (buyNowTokens || [])) {
    stats.tokensProcessed++;

    // Check price gate
    if (config.max_buy_price_usd > 0 && token.price_usd && token.price_usd > config.max_buy_price_usd) {
      console.log(`⏭️ Skipping ${token.token_symbol}: price $${token.price_usd} > max $${config.max_buy_price_usd}`);
      continue;
    }

    // Check graduation status
    const { graduated, poolAddress } = await checkRaydiumPool(token.token_mint);
    
    // Update graduation status if needed
    if (graduated && !token.is_graduated) {
      await supabase
        .from('pumpfun_watchlist')
        .update({
          is_graduated: true,
          graduated_at: now,
          raydium_pool_address: poolAddress,
        })
        .eq('id', token.id);
      
      console.log(`🎓 Token ${token.token_symbol} graduated to Raydium: ${poolAddress}`);
    }

    // Mark buy attempt
    await supabase
      .from('pumpfun_watchlist')
      .update({ buy_attempted_at: now })
      .eq('id', token.id);

    stats.buysAttempted++;

    // Execute the buy
    const result = await executeBuy(supabase, token, config);

    if (result.success) {
      stats.buysSucceeded++;
      stats.executedTokens.push(`${token.token_symbol} (${result.txSignature?.slice(0, 8)}...)`);

      // Update token with success
      await supabase
        .from('pumpfun_watchlist')
        .update({
          status: 'holding',
          buy_executed_at: now,
          buy_tx_signature: result.txSignature,
          buy_amount_sol: config.buy_amount_sol,
          buy_error: null,
        })
        .eq('id', token.id);

      // Increment daily buy counter
      await supabase
        .from('pumpfun_monitor_config')
        .update({ daily_buys_today: config.daily_buys_today + stats.buysSucceeded })
        .eq('id', config.is_enabled ? undefined : ''); // Update all rows

      console.log(`✅ Buy executed: ${token.token_symbol} @ ${config.buy_amount_sol} SOL`);
    } else {
      stats.buysFailed++;
      stats.failedTokens.push(`${token.token_symbol} (${result.error?.slice(0, 50)})`);
      stats.errors.push(`${token.token_symbol}: ${result.error}`);

      // Update token with error
      await supabase
        .from('pumpfun_watchlist')
        .update({
          buy_error: result.error,
        })
        .eq('id', token.id);

      console.log(`❌ Buy failed: ${token.token_symbol} - ${result.error}`);
    }

    // Rate limiting between buys
    await new Promise(r => setTimeout(r, 500));
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 BUY EXECUTOR COMPLETE: ${stats.buysSucceeded}/${stats.buysAttempted} succeeded (${stats.durationMs}ms)`);

  return stats;
}

// Check graduation status for watching tokens
async function checkGraduations(supabase: any): Promise<{ checked: number; graduated: number }> {
  console.log('🎓 Checking graduation status for watching tokens...');

  const { data: watchingTokens, error } = await supabase
    .from('pumpfun_watchlist')
    .select('id, token_mint, token_symbol, is_graduated')
    .in('status', ['watching', 'qualified', 'buy_now'])
    .eq('is_graduated', false)
    .limit(20);

  if (error) {
    console.error('Error fetching tokens for graduation check:', error);
    return { checked: 0, graduated: 0 };
  }

  let graduated = 0;
  const now = new Date().toISOString();

  for (const token of (watchingTokens || [])) {
    const { graduated: isGraduated, poolAddress } = await checkRaydiumPool(token.token_mint);
    
    if (isGraduated) {
      await supabase
        .from('pumpfun_watchlist')
        .update({
          is_graduated: true,
          graduated_at: now,
          raydium_pool_address: poolAddress,
        })
        .eq('id', token.id);

      console.log(`🎓 Graduated: ${token.token_symbol} -> ${poolAddress}`);
      graduated++;
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return { checked: watchingTokens?.length || 0, graduated };
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

    console.log(`🎯 pumpfun-buy-executor action: ${action}`);

    switch (action) {
      case 'execute': {
        const stats = await executeBuys(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'check_graduations': {
        const result = await checkGraduations(supabase);
        return jsonResponse({ success: true, ...result });
      }

      case 'status': {
        const config = await getConfig(supabase);
        
        const { count: buyNowCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'buy_now')
          .is('buy_executed_at', null);

        const { count: holdingCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'holding');

        const { count: graduatedCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('is_graduated', true);

        return jsonResponse({
          success: true,
          autoByEnabled: config.auto_buy_enabled,
          buyWalletConfigured: !!config.buy_wallet_id,
          dailyBuysRemaining: config.daily_buy_cap - config.daily_buys_today,
          pendingBuys: buyNowCount || 0,
          holdingCount: holdingCount || 0,
          graduatedTokens: graduatedCount || 0,
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-buy-executor:', error);
    return errorResponse(String(error), 500);
  }
});
