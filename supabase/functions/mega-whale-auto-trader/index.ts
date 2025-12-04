import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Known tokens to NEVER buy (stablecoins, wSOL, etc.)
const KNOWN_TOKENS = new Set([
  'So11111111111111111111111111111111111111112',  // wSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // JUP
]);

interface BuyabilityResult {
  is_buyable: boolean;
  score: number;
  reasons: string[];
  rejection_reason?: string;
  market_cap: number;
  bonding_progress: number;
  unique_holders: number;
  dev_has_bought: boolean;
  age_minutes: number;
  price_momentum: 'dumping' | 'stable' | 'rising';
}

interface SmartBuyConfig {
  auto_buy_min_market_cap: number;
  auto_buy_max_market_cap: number;
  auto_buy_min_holders: number;
  auto_buy_min_age_minutes: number;
  auto_buy_require_dev_buy: boolean;
  auto_buy_max_dump_ratio: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, token_mint, trade_id } = await req.json();

    console.log(`[AUTO-TRADER] Action: ${action}`);

    switch (action) {
      case 'check_pending_trades': {
        // Check all pending/monitoring trades and update buy counts
        const { data: pendingTrades } = await supabase
          .from('mega_whale_auto_trades')
          .select('*')
          .in('status', ['pending', 'monitoring'])
          .lt('monitoring_expires_at', new Date(Date.now() + 30 * 60 * 1000).toISOString());

        const results = [];
        
        for (const trade of pendingTrades || []) {
          // Skip known tokens
          if (KNOWN_TOKENS.has(trade.token_mint)) {
            await supabase
              .from('mega_whale_auto_trades')
              .update({ status: 'rejected', rejection_reason: 'Known token (wSOL/USDC/etc) - not a new mint' })
              .eq('id', trade.id);
            results.push({ id: trade.id, status: 'rejected', reason: 'known_token' });
            continue;
          }

          // Check if expired
          if (trade.monitoring_expires_at && new Date(trade.monitoring_expires_at) < new Date()) {
            await supabase
              .from('mega_whale_auto_trades')
              .update({ status: 'cancelled', error_message: 'Monitoring window expired' })
              .eq('id', trade.id);
            results.push({ id: trade.id, status: 'cancelled', reason: 'expired' });
            continue;
          }

          // Get user's smart buy config
          const { data: alertConfig } = await supabase
            .from('mega_whale_alert_config')
            .select('*')
            .eq('user_id', trade.user_id)
            .single();

          const config: SmartBuyConfig = {
            auto_buy_min_market_cap: alertConfig?.auto_buy_min_market_cap || 9500,
            auto_buy_max_market_cap: alertConfig?.auto_buy_max_market_cap || 50000,
            auto_buy_min_holders: alertConfig?.auto_buy_min_holders || 5,
            auto_buy_min_age_minutes: alertConfig?.auto_buy_min_age_minutes || 3,
            auto_buy_require_dev_buy: alertConfig?.auto_buy_require_dev_buy ?? true,
            auto_buy_max_dump_ratio: alertConfig?.auto_buy_max_dump_ratio || 0.5
          };

          // NEW: Check buyability before executing
          const buyability = await checkBuyability(trade.token_mint, config, trade.metadata?.creator_wallet);
          
          // Update trade with assessment data
          await supabase
            .from('mega_whale_auto_trades')
            .update({ 
              buyability_score: buyability.score,
              market_cap_at_check: buyability.market_cap,
              unique_holders: buyability.unique_holders,
              token_age_minutes: buyability.age_minutes,
              dev_has_bought: buyability.dev_has_bought,
              status: 'monitoring'
            })
            .eq('id', trade.id);

          // Check if buyable
          if (!buyability.is_buyable) {
            await supabase
              .from('mega_whale_auto_trades')
              .update({ 
                status: 'rejected', 
                rejection_reason: buyability.rejection_reason 
              })
              .eq('id', trade.id);
            
            console.log(`[AUTO-TRADER] Rejected ${trade.token_mint}: ${buyability.rejection_reason}`);
            results.push({ id: trade.id, status: 'rejected', reason: buyability.rejection_reason });
            continue;
          }

          // Fetch recent transactions for this token
          const buyCount = await countRecentBuys(heliusApiKey, trade.token_mint, trade.monitoring_started_at);
          
          // Update buy count
          await supabase
            .from('mega_whale_auto_trades')
            .update({ buys_detected: buyCount })
            .eq('id', trade.id);

          // Check if we should execute (need both buyability AND enough buys)
          if (buyCount >= trade.buys_required && buyability.score >= 70) {
            // Execute the trade!
            const execution = await executeBuy(supabase, heliusApiKey, trade);
            results.push({ id: trade.id, status: execution.status, ...execution });
          } else {
            results.push({ 
              id: trade.id, 
              status: 'monitoring', 
              buys_detected: buyCount, 
              buys_required: trade.buys_required,
              buyability_score: buyability.score,
              market_cap: buyability.market_cap
            });
          }
        }

        return new Response(
          JSON.stringify({ success: true, trades_checked: results.length, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'increment_buy_count': {
        // Called by webhook when a buy is detected on a monitored token
        if (!token_mint) {
          return new Response(
            JSON.stringify({ error: 'token_mint required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Skip known tokens
        if (KNOWN_TOKENS.has(token_mint)) {
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: 'known_token' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get pending trades for this token
        const { data: trades } = await supabase
          .from('mega_whale_auto_trades')
          .select('*')
          .eq('token_mint', token_mint)
          .in('status', ['pending', 'monitoring']);

        const results = [];
        for (const trade of trades || []) {
          const newCount = (trade.buys_detected || 0) + 1;
          
          // Get config and check buyability
          const { data: alertConfig } = await supabase
            .from('mega_whale_alert_config')
            .select('*')
            .eq('user_id', trade.user_id)
            .single();

          const config: SmartBuyConfig = {
            auto_buy_min_market_cap: alertConfig?.auto_buy_min_market_cap || 9500,
            auto_buy_max_market_cap: alertConfig?.auto_buy_max_market_cap || 50000,
            auto_buy_min_holders: alertConfig?.auto_buy_min_holders || 5,
            auto_buy_min_age_minutes: alertConfig?.auto_buy_min_age_minutes || 3,
            auto_buy_require_dev_buy: alertConfig?.auto_buy_require_dev_buy ?? true,
            auto_buy_max_dump_ratio: alertConfig?.auto_buy_max_dump_ratio || 0.5
          };

          const buyability = await checkBuyability(token_mint, config, trade.metadata?.creator_wallet);

          // Update assessment
          await supabase
            .from('mega_whale_auto_trades')
            .update({ 
              buys_detected: newCount,
              buyability_score: buyability.score,
              market_cap_at_check: buyability.market_cap,
              unique_holders: buyability.unique_holders,
              token_age_minutes: buyability.age_minutes,
              dev_has_bought: buyability.dev_has_bought
            })
            .eq('id', trade.id);
          
          if (!buyability.is_buyable) {
            await supabase
              .from('mega_whale_auto_trades')
              .update({ status: 'rejected', rejection_reason: buyability.rejection_reason })
              .eq('id', trade.id);
            results.push({ id: trade.id, status: 'rejected', reason: buyability.rejection_reason });
            continue;
          }

          if (newCount >= trade.buys_required && buyability.score >= 70) {
            // Execute!
            const execution = await executeBuy(supabase, heliusApiKey, trade);
            results.push({ id: trade.id, ...execution });
          } else {
            results.push({ 
              id: trade.id, 
              buys_detected: newCount, 
              status: 'monitoring',
              buyability_score: buyability.score 
            });
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'execute_now': {
        // Force execute a trade
        if (!trade_id) {
          return new Response(
            JSON.stringify({ error: 'trade_id required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: trade } = await supabase
          .from('mega_whale_auto_trades')
          .select('*')
          .eq('id', trade_id)
          .single();

        if (!trade) {
          return new Response(
            JSON.stringify({ error: 'Trade not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const execution = await executeBuy(supabase, heliusApiKey, trade);

        return new Response(
          JSON.stringify({ success: true, ...execution }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[AUTO-TRADER] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Smart buyability assessment
async function checkBuyability(tokenMint: string, config: SmartBuyConfig, creatorWallet?: string): Promise<BuyabilityResult> {
  try {
    // 1. Fetch current token data from pump.fun
    const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
    
    if (!pumpResponse.ok) {
      return {
        is_buyable: false,
        score: 0,
        reasons: [],
        rejection_reason: 'Token not found on pump.fun - may not be a pump.fun token',
        market_cap: 0,
        bonding_progress: 0,
        unique_holders: 0,
        dev_has_bought: false,
        age_minutes: 0,
        price_momentum: 'stable'
      };
    }
    
    const tokenData = await pumpResponse.json();
    
    // 2. Calculate age since mint
    const createdAt = tokenData.created_timestamp 
      ? new Date(typeof tokenData.created_timestamp === 'number' ? tokenData.created_timestamp : tokenData.created_timestamp)
      : new Date();
    const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;
    
    // 3. Get market cap
    const marketCap = tokenData.usd_market_cap || 0;
    
    // 4. Get bonding curve progress
    const bondingProgress = tokenData.bonding_curve_progress || 0;
    
    // 5. Get holder count and check for quick dumps
    let uniqueBuyers = 0;
    let quickSellers = 0;
    let devBought = false;
    const devWallet = creatorWallet || tokenData.creator;
    
    try {
      const tradesResponse = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}/trades?limit=50&offset=0`);
      if (tradesResponse.ok) {
        const trades = await tradesResponse.json();
        const buyers = new Set<string>();
        const sellers = new Set<string>();
        
        for (const trade of trades || []) {
          if (trade.is_buy) {
            buyers.add(trade.user);
            if (trade.user === devWallet) devBought = true;
          } else {
            sellers.add(trade.user);
          }
        }
        
        uniqueBuyers = buyers.size;
        // Count sellers who also bought (quick flip)
        for (const seller of sellers) {
          if (buyers.has(seller)) quickSellers++;
        }
      }
    } catch (e) {
      console.log('[AUTO-TRADER] Failed to fetch trades:', e);
    }
    
    // REJECTION CHECKS
    const reasons: string[] = [];
    let isRejected = false;
    let rejectionReason = '';
    
    // ❌ Too early - market cap under min
    if (marketCap < config.auto_buy_min_market_cap) {
      isRejected = true;
      rejectionReason = `Market cap $${marketCap.toLocaleString()} below minimum $${config.auto_buy_min_market_cap.toLocaleString()} - waiting for price to rise`;
    }
    
    // ❌ Too late - market cap over max
    if (!isRejected && marketCap > config.auto_buy_max_market_cap) {
      isRejected = true;
      rejectionReason = `Market cap $${marketCap.toLocaleString()} exceeds maximum $${config.auto_buy_max_market_cap.toLocaleString()} - too late to enter`;
    }
    
    // ❌ Too new - wait at least min_age_minutes
    if (!isRejected && ageMinutes < config.auto_buy_min_age_minutes) {
      isRejected = true;
      rejectionReason = `Token only ${ageMinutes.toFixed(1)} minutes old, waiting for ${config.auto_buy_min_age_minutes} minutes to assess stability`;
    }
    
    // ❌ Not enough holders
    if (!isRejected && uniqueBuyers < config.auto_buy_min_holders) {
      isRejected = true;
      rejectionReason = `Only ${uniqueBuyers} unique buyers, need at least ${config.auto_buy_min_holders} - possible test launch`;
    }
    
    // ❌ Dev hasn't bought (test/distraction)
    if (!isRejected && config.auto_buy_require_dev_buy && !devBought) {
      isRejected = true;
      rejectionReason = 'Dev wallet has not bought in yet - possible test launch or distraction';
    }
    
    // ❌ Quick dump pattern detected
    const dumpRatio = uniqueBuyers > 0 ? quickSellers / uniqueBuyers : 0;
    if (!isRejected && dumpRatio > config.auto_buy_max_dump_ratio) {
      isRejected = true;
      rejectionReason = `High dump ratio (${(dumpRatio * 100).toFixed(0)}% sold quickly) - likely failed launch`;
    }
    
    // Calculate buyability score (0-100)
    let score = 50;
    
    // Sweet spot market cap (9.5K - 20K ideal)
    if (marketCap >= 9500 && marketCap <= 20000) score += 20;
    else if (marketCap > 20000 && marketCap <= 35000) score += 10;
    
    // Good holder count
    if (uniqueBuyers >= 10) score += 15;
    else if (uniqueBuyers >= 5) score += 8;
    
    // Dev bought (shows commitment)
    if (devBought) score += 15;
    
    // Age check (not too new, not too old)
    if (ageMinutes >= 5 && ageMinutes <= 30) score += 10;
    else if (ageMinutes >= 3) score += 5;
    
    // Bonding progress (5-30% is good - showing traction but not bonded)
    if (bondingProgress >= 5 && bondingProgress <= 30) score += 10;
    else if (bondingProgress > 30 && bondingProgress < 70) score += 5;
    
    // Low dump ratio is good
    if (dumpRatio < 0.1) score += 10;
    else if (dumpRatio < 0.3) score += 5;
    
    // Determine price momentum
    const priceMomentum: 'dumping' | 'stable' | 'rising' = 
      dumpRatio > 0.4 ? 'dumping' : 
      dumpRatio < 0.15 ? 'rising' : 'stable';
    
    console.log(`[AUTO-TRADER] Buyability check for ${tokenMint}: score=${score}, mc=$${marketCap}, age=${ageMinutes.toFixed(1)}min, holders=${uniqueBuyers}, devBought=${devBought}, dumpRatio=${(dumpRatio*100).toFixed(0)}%`);
    
    return {
      is_buyable: !isRejected && score >= 70,
      score: Math.min(100, Math.max(0, score)),
      reasons,
      rejection_reason: rejectionReason || undefined,
      market_cap: marketCap,
      bonding_progress: bondingProgress,
      unique_holders: uniqueBuyers,
      dev_has_bought: devBought,
      age_minutes: ageMinutes,
      price_momentum: priceMomentum
    };
    
  } catch (e) {
    console.error('[AUTO-TRADER] Buyability check error:', e);
    return {
      is_buyable: false,
      score: 0,
      reasons: [],
      rejection_reason: `Error checking buyability: ${e.message}`,
      market_cap: 0,
      bonding_progress: 0,
      unique_holders: 0,
      dev_has_bought: false,
      age_minutes: 0,
      price_momentum: 'stable'
    };
  }
}

async function countRecentBuys(heliusApiKey: string, tokenMint: string, since: string): Promise<number> {
  try {
    // Use Helius to get recent transactions for this token
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}&limit=100&type=SWAP`
    );
    
    const transactions = await response.json();
    if (!Array.isArray(transactions)) return 0;

    const sinceTime = new Date(since).getTime();
    let buyCount = 0;

    for (const tx of transactions) {
      const txTime = tx.timestamp ? tx.timestamp * 1000 : 0;
      if (txTime < sinceTime) continue;

      // Count as buy if token was received
      for (const transfer of tx.tokenTransfers || []) {
        if (transfer.mint === tokenMint && transfer.tokenAmount > 0) {
          buyCount++;
        }
      }
    }

    return buyCount;
  } catch (e) {
    console.error('[AUTO-TRADER] Error counting buys:', e);
    return 0;
  }
}

async function executeBuy(supabase: any, heliusApiKey: string, trade: any): Promise<any> {
  console.log(`[AUTO-TRADER] Executing buy for ${trade.token_mint}, amount: ${trade.amount_sol} SOL`);

  try {
    // Update status to executing
    await supabase
      .from('mega_whale_auto_trades')
      .update({ status: 'executing' })
      .eq('id', trade.id);

    // Get user's trading wallet
    const { data: userSecrets } = await supabase
      .from('user_secrets')
      .select('trading_private_key')
      .eq('user_id', trade.user_id)
      .single();

    if (!userSecrets?.trading_private_key) {
      await supabase
        .from('mega_whale_auto_trades')
        .update({ 
          status: 'failed', 
          error_message: 'No trading wallet configured' 
        })
        .eq('id', trade.id);

      return { status: 'failed', error: 'No trading wallet configured' };
    }

    // Execute via Raydium swap
    const { data: swapResult, error: swapError } = await supabase.functions.invoke('raydium-swap', {
      body: {
        inputMint: 'So11111111111111111111111111111111111111112', // SOL
        outputMint: trade.token_mint,
        amount: trade.amount_sol * 1e9, // Convert to lamports
        slippageBps: 500, // 5% slippage
        privateKey: userSecrets.trading_private_key
      }
    });

    if (swapError || !swapResult?.signature) {
      await supabase
        .from('mega_whale_auto_trades')
        .update({ 
          status: 'failed', 
          error_message: swapError?.message || 'Swap failed' 
        })
        .eq('id', trade.id);

      return { status: 'failed', error: swapError?.message || 'Swap failed' };
    }

    // Success!
    await supabase
      .from('mega_whale_auto_trades')
      .update({ 
        status: 'completed',
        executed_at: new Date().toISOString(),
        transaction_signature: swapResult.signature,
        tokens_received: swapResult.outputAmount
      })
      .eq('id', trade.id);

    // Send notification
    await supabase.functions.invoke('mega-whale-notifier', {
      body: {
        alert: {
          user_id: trade.user_id,
          alert_type: 'auto_trade_executed',
          severity: 'high',
          title: `Auto-Buy Executed: ${trade.token_symbol || trade.token_mint.slice(0, 8)}`,
          description: `Successfully bought ${trade.amount_sol} SOL worth of ${trade.token_symbol || 'token'} after detecting ${trade.buys_detected} buys. Buyability score: ${trade.buyability_score || 'N/A'}`,
          metadata: {
            token_mint: trade.token_mint,
            amount_sol: trade.amount_sol,
            signature: swapResult.signature,
            buyability_score: trade.buyability_score,
            market_cap: trade.market_cap_at_check
          }
        }
      }
    });

    return { 
      status: 'completed', 
      signature: swapResult.signature,
      tokens_received: swapResult.outputAmount
    };

  } catch (e) {
    console.error('[AUTO-TRADER] Execution error:', e);
    
    await supabase
      .from('mega_whale_auto_trades')
      .update({ 
        status: 'failed', 
        error_message: e.message 
      })
      .eq('id', trade.id);

    return { status: 'failed', error: e.message };
  }
}