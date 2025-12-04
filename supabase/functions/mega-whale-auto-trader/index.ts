import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
          .lt('monitoring_expires_at', new Date(Date.now() + 30 * 60 * 1000).toISOString()); // Not yet expired

        const results = [];
        
        for (const trade of pendingTrades || []) {
          // Check if expired
          if (trade.monitoring_expires_at && new Date(trade.monitoring_expires_at) < new Date()) {
            await supabase
              .from('mega_whale_auto_trades')
              .update({ status: 'cancelled', error_message: 'Monitoring window expired' })
              .eq('id', trade.id);
            results.push({ id: trade.id, status: 'cancelled', reason: 'expired' });
            continue;
          }

          // Fetch recent transactions for this token
          const buyCount = await countRecentBuys(heliusApiKey, trade.token_mint, trade.monitoring_started_at);
          
          // Update buy count
          await supabase
            .from('mega_whale_auto_trades')
            .update({ buys_detected: buyCount, status: 'monitoring' })
            .eq('id', trade.id);

          // Check if we should execute
          if (buyCount >= trade.buys_required) {
            // Execute the trade!
            const execution = await executeBuy(supabase, heliusApiKey, trade);
            results.push({ id: trade.id, status: execution.status, ...execution });
          } else {
            results.push({ id: trade.id, status: 'monitoring', buys_detected: buyCount, buys_required: trade.buys_required });
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

        // Get pending trades for this token
        const { data: trades } = await supabase
          .from('mega_whale_auto_trades')
          .select('*')
          .eq('token_mint', token_mint)
          .in('status', ['pending', 'monitoring']);

        const results = [];
        for (const trade of trades || []) {
          const newCount = (trade.buys_detected || 0) + 1;
          
          if (newCount >= trade.buys_required) {
            // Execute!
            const execution = await executeBuy(supabase, heliusApiKey, trade);
            results.push({ id: trade.id, ...execution });
          } else {
            // Just increment
            await supabase
              .from('mega_whale_auto_trades')
              .update({ buys_detected: newCount, status: 'monitoring' })
              .eq('id', trade.id);
            results.push({ id: trade.id, buys_detected: newCount, status: 'monitoring' });
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
          description: `Successfully bought ${trade.amount_sol} SOL worth of ${trade.token_symbol || 'token'} after detecting ${trade.buys_detected} buys.`,
          metadata: {
            token_mint: trade.token_mint,
            amount_sol: trade.amount_sol,
            signature: swapResult.signature
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