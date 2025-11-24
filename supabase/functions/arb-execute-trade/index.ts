import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecuteTradeRequest {
  opportunity_id: string;
  user_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { opportunity_id, user_id }: ExecuteTradeRequest = await req.json();

    console.log(`Executing trade for opportunity ${opportunity_id}, user ${user_id}`);

    // Get the opportunity
    const { data: opportunity, error: oppError } = await supabase
      .from('arb_opportunities')
      .select('*')
      .eq('id', opportunity_id)
      .eq('user_id', user_id)
      .single();

    if (oppError || !opportunity) {
      throw new Error(`Opportunity not found: ${oppError?.message}`);
    }

    // Get bot config
    const { data: config, error: configError } = await supabase
      .from('arb_bot_config')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (configError || !config) {
      throw new Error(`Bot config not found: ${configError?.message}`);
    }

    // Update bot status to executing
    await supabase
      .from('arb_bot_status')
      .update({ status: 'executing' })
      .eq('user_id', user_id);

    const loop_id = `${opportunity.loop_type}_${Date.now()}`;
    const isDryRun = config.dry_run_enabled;

    // Create execution record
    const { data: execution, error: execError } = await supabase
      .from('arb_loop_executions')
      .insert({
        user_id,
        loop_id,
        loop_type: opportunity.loop_type,
        starting_amount_eth: opportunity.trade_size_eth,
        legs: opportunity.leg_breakdown,
        status: isDryRun ? 'simulated' : 'pending',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (execError) {
      throw new Error(`Failed to create execution: ${execError.message}`);
    }

    console.log(`Created execution ${execution.id} for loop ${loop_id}`);

    if (isDryRun) {
      // Dry run mode - use EXACT real calculated values from opportunity
      const legBreakdown = opportunity.leg_breakdown as any;
      
      // Extract actual calculated fees from opportunity analysis
      const realBridgeFee = legBreakdown.fees?.bridge || 0;
      const realGasMainnet = legBreakdown.fees?.gas_mainnet || 0;
      const realGasBase = legBreakdown.fees?.gas_base || 0;
      const realSwapFees = legBreakdown.fees?.swap || 0;
      const totalGasSpent = realGasMainnet + realGasBase;
      const totalBridgeFees = realBridgeFee;
      const totalSwapFees = realSwapFees;
      
      // Use EXACT profit calculation - no multipliers
      const realizedProfit = opportunity.expected_profit_eth;
      const finalAmount = opportunity.expected_final_eth;
      
      // Create detailed execution log simulating real execution steps
      const executionSteps = [];
      
      if (opportunity.loop_type.includes('Mainnet → Base')) {
        executionSteps.push({
          step: 1,
          action: 'Approve ETH spending on Mainnet',
          chain: 'mainnet',
          gasUsed: realGasMainnet * 0.1,
          status: 'simulated_success',
          timestamp: new Date().toISOString()
        });
        
        executionSteps.push({
          step: 2,
          action: `Bridge ${opportunity.trade_size_eth} ETH from Mainnet to Base`,
          chain: 'mainnet',
          amount: opportunity.trade_size_eth,
          bridgeFee: realBridgeFee,
          gasUsed: realGasMainnet * 0.4,
          status: 'simulated_success',
          timestamp: new Date(Date.now() + 1000).toISOString()
        });
        
        executionSteps.push({
          step: 3,
          action: `Receive ${(opportunity.trade_size_eth - realBridgeFee).toFixed(6)} ETH on Base`,
          chain: 'base',
          received: opportunity.trade_size_eth - realBridgeFee,
          status: 'simulated_success',
          timestamp: new Date(Date.now() + 60000).toISOString()
        });
        
        executionSteps.push({
          step: 4,
          action: 'Swap ETH at higher Base price',
          chain: 'base',
          swapFee: realSwapFees,
          gasUsed: realGasBase * 0.5,
          priceImpact: legBreakdown.price_diff / legBreakdown.price_mainnet,
          status: 'simulated_success',
          timestamp: new Date(Date.now() + 65000).toISOString()
        });
      }

      // Update execution with real calculated values
      await supabase
        .from('arb_loop_executions')
        .update({
          status: 'simulated',
          completed_at: new Date().toISOString(),
          final_amount_eth: finalAmount,
          realized_profit_eth: realizedProfit,
          realized_profit_bps: opportunity.expected_profit_bps,
          total_gas_spent_eth: totalGasSpent,
          total_swap_fees_eth: totalSwapFees,
          total_bridge_fees_eth: totalBridgeFees,
          legs: {
            ...legBreakdown,
            execution_steps: executionSteps,
            simulation_mode: true
          }
        })
        .eq('id', execution.id);

      console.log(`✅ Dry run completed with REAL calculated values - profit: ${realizedProfit} ETH`);
      console.log(`📊 Fees breakdown: Gas=${totalGasSpent}, Bridge=${totalBridgeFees}, Swap=${totalSwapFees}`);

      // Update virtual balances with EXACT calculated amounts
      const { data: currentBalances } = await supabase
        .from('arb_balances')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (currentBalances && opportunity.loop_type.includes('Mainnet → Base')) {
        // Loop A: Move ETH from Mainnet to Base with EXACT calculated amounts
        const tradeSizeUsed = opportunity.trade_size_eth;
        const netReceived = finalAmount - tradeSizeUsed; // This is the actual profit after all fees
        
        const newEthMainnet = currentBalances.eth_mainnet - tradeSizeUsed;
        const newEthBase = currentBalances.eth_base + tradeSizeUsed + netReceived;
        
        await supabase
          .from('arb_balances')
          .update({
            eth_mainnet: newEthMainnet,
            eth_base: newEthBase,
            last_updated: new Date().toISOString()
          })
          .eq('user_id', user_id);

        console.log(`💰 Balance update: Mainnet ${currentBalances.eth_mainnet.toFixed(6)} → ${newEthMainnet.toFixed(6)}, Base ${currentBalances.eth_base.toFixed(6)} → ${newEthBase.toFixed(6)}`);
      }

      // Update bot status back to idle
      await supabase
        .from('arb_bot_status')
        .update({ status: 'idle' })
        .eq('user_id', user_id);

      return new Response(
        JSON.stringify({
          success: true,
          execution_id: execution.id,
          dry_run: true,
          realized_profit_eth: realizedProfit,
          final_amount_eth: finalAmount,
          fees: {
            gas: totalGasSpent,
            bridge: totalBridgeFees,
            swap: totalSwapFees,
            total: totalGasSpent + totalBridgeFees + totalSwapFees
          },
          execution_steps: executionSteps,
          balance_updated: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Real trading mode
    if (!config.auto_trade_enabled) {
      throw new Error('Auto trading is not enabled');
    }

    // TODO: Implement real trade execution
    // 1. Get wallet private key from secrets
    // 2. Execute each leg of the arbitrage loop:
    //    - For Loop A: ETH Mainnet -> Bridge to Base -> Bridge back to Mainnet
    //    - For Loop B: BASE on Base -> Swap to ETH -> Bridge to Mainnet -> Bridge back
    //    - For Loop C: Combined strategy
    // 3. Use Web3 libraries to interact with bridges and DEXs
    // 4. Record actual gas costs, fees, and final amounts
    // 5. Update execution record with results

    console.warn('Real trading not yet implemented - marking as failed');

    await supabase
      .from('arb_loop_executions')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: 'Real trading execution not yet implemented',
      })
      .eq('id', execution.id);

    // Update bot status back to idle
    await supabase
      .from('arb_bot_status')
      .update({ status: 'idle' })
      .eq('user_id', user_id);

    return new Response(
      JSON.stringify({
        success: false,
        execution_id: execution.id,
        error: 'Real trading not yet implemented',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error executing trade:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
