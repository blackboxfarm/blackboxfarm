import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting opportunity scanner...');

    const ethRpcUrl = Deno.env.get('ETH_RPC_URL');
    const baseRpcUrl = Deno.env.get('BASE_RPC_URL');
    const zeroXApiKey = Deno.env.get('ZERO_X_API_KEY');

    if (!ethRpcUrl || !baseRpcUrl || !zeroXApiKey) {
      throw new Error('Missing required environment variables');
    }

    // Get all active configs
    const { data: configs, error: configError } = await supabaseClient
      .from('arb_bot_config')
      .select('*')
      .eq('circuit_breaker_active', false);

    if (configError) throw configError;

    for (const config of configs || []) {
      // Fetch current prices
      const ethPriceMainnet = await fetchEthPrice(ethRpcUrl);
      const ethPriceBase = await fetchEthPrice(baseRpcUrl);
      const baseTokenPrice = await fetchBaseTokenPrice(zeroXApiKey);

      console.log('Prices:', { ethPriceMainnet, ethPriceBase, baseTokenPrice });

      // Calculate opportunities for each enabled loop
      if (config.enable_loop_a) {
        await checkLoopA(supabaseClient, config, ethPriceMainnet, ethPriceBase);
      }
      if (config.enable_loop_b) {
        await checkLoopB(supabaseClient, config, baseTokenPrice);
      }
      if (config.enable_loop_c) {
        await checkLoopC(supabaseClient, config, ethPriceMainnet, baseTokenPrice);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Opportunity scan complete' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error scanning opportunities:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchEthPrice(rpcUrl: string): Promise<number> {
  // Simplified - in production would fetch from proper oracle
  return 3000;
}

async function fetchBaseTokenPrice(apiKey: string): Promise<number> {
  // Simplified - would use 0x API to get real BASE token price
  return 1.5;
}

async function checkLoopA(supabase: any, config: any, ethMainnet: number, ethBase: number) {
  const tradeSize = config.trade_size_mode === 'fixed' 
    ? config.trade_size_fixed_eth 
    : 0.1; // Would calculate from balance

  // Simplified arbitrage calculation
  const priceDiffBps = Math.abs(ethMainnet - ethBase) / ethMainnet * 10000;
  const estimatedProfitBps = priceDiffBps - 100; // Subtract estimated fees
  const estimatedProfitEth = (estimatedProfitBps / 10000) * tradeSize;

  const executable = 
    estimatedProfitBps >= config.min_profit_bps &&
    estimatedProfitBps <= config.max_price_impact_bps;

  await supabase.from('arb_opportunities').insert({
    user_id: config.user_id,
    loop_type: 'LOOP_A',
    trade_size_eth: tradeSize,
    expected_profit_eth: estimatedProfitEth,
    expected_profit_bps: estimatedProfitBps,
    expected_final_eth: tradeSize + estimatedProfitEth,
    executable,
    skip_reason: executable ? null : 'Below profit threshold',
    meets_profit_threshold: estimatedProfitBps >= config.min_profit_bps,
    meets_slippage_threshold: true,
    meets_gas_limits: true,
    meets_liquidity_depth: true,
    leg_breakdown: {
      eth_to_base: ethMainnet,
      base_to_eth: ethBase
    },
    detected_at: new Date().toISOString()
  });
}

async function checkLoopB(supabase: any, config: any, basePrice: number) {
  console.log('Checking Loop B with BASE price:', basePrice);
  // TODO: Implement Loop B logic
}

async function checkLoopC(supabase: any, config: any, ethPrice: number, basePrice: number) {
  console.log('Checking Loop C with prices:', { ethPrice, basePrice });
  // TODO: Implement Loop C logic
}
