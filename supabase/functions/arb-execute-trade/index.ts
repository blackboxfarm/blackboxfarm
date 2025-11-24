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
      // Dry run mode - simulate the trade
      const simulatedProfit = opportunity.expected_profit_eth * 0.95; // Assume 95% of expected profit
      const simulatedGas = 0.002; // Simulated gas cost
      const simulatedFees = opportunity.trade_size_eth * 0.003; // 0.3% fees

      await supabase
        .from('arb_loop_executions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          final_amount_eth: opportunity.expected_final_eth,
          realized_profit_eth: simulatedProfit,
          realized_profit_bps: Math.round((simulatedProfit / opportunity.trade_size_eth) * 10000),
          total_gas_spent_eth: simulatedGas,
          total_swap_fees_eth: simulatedFees,
          total_bridge_fees_eth: 0,
        })
        .eq('id', execution.id);

      console.log(`Dry run completed - simulated profit: ${simulatedProfit} ETH`);

      // Update virtual balances for dry run
      const { data: currentBalances } = await supabase
        .from('arb_balances')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (currentBalances && opportunity.loop_type.includes('Mainnet → Base')) {
        // Loop A: Move ETH from Mainnet to Base
        const newEthMainnet = currentBalances.eth_mainnet - opportunity.trade_size_eth;
        const newEthBase = currentBalances.eth_base + opportunity.trade_size_eth + simulatedProfit - simulatedGas;
        
        await supabase
          .from('arb_balances')
          .update({
            eth_mainnet: newEthMainnet,
            eth_base: newEthBase,
            last_updated: new Date().toISOString()
          })
          .eq('user_id', userId);

        console.log(`Dry run balance update: Mainnet ${currentBalances.eth_mainnet} → ${newEthMainnet}, Base ${currentBalances.eth_base} → ${newEthBase}`);
      }

      // Update bot status back to idle
      await supabase
        .from('arb_bot_status')
        .update({ status: 'idle' })
        .eq('user_id', userId);

      return new Response(
        JSON.stringify({
          success: true,
          execution_id: execution.id,
          dry_run: true,
          simulated_profit_eth: simulatedProfit,
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
