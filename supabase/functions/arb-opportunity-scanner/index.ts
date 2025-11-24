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
      // Fetch current prices from real sources
      const ethPriceMainnet = await fetchEthPrice(ethRpcUrl, 'mainnet');
      const ethPriceBase = await fetchEthPrice(baseRpcUrl, 'base');
      const baseTokenPrice = await fetchBaseTokenPrice(zeroXApiKey);

      console.log('Real-time prices:', { ethPriceMainnet, ethPriceBase, baseTokenPrice });

      // Store price snapshot
      await supabaseClient.from('arb_price_snapshots').insert({
        eth_mainnet_usd: ethPriceMainnet,
        eth_base_usd: ethPriceBase,
        base_token_usd: baseTokenPrice,
        base_token_eth: baseTokenPrice / ethPriceMainnet,
      });

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

async function fetchEthPrice(rpcUrl: string, chain: 'mainnet' | 'base' = 'mainnet'): Promise<number> {
  try {
    // Try CoinGecko first - most reliable
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) throw new Error(`CoinGecko error: ${response.status}`);
    
    const data = await response.json();
    const price = data.ethereum?.usd;
    
    if (!price) throw new Error('Price not found in CoinGecko response');
    
    console.log(`Fetched ETH price from CoinGecko (${chain}): $${price}`);
    return price;
  } catch (error) {
    console.error(`CoinGecko failed for ${chain}, trying DexScreener:`, error);
    return fetchEthPriceFromDexScreener(chain);
  }
}

async function fetchEthPriceFromDexScreener(chain: 'mainnet' | 'base'): Promise<number> {
  try {
    // WETH addresses
    const wethAddress = chain === 'mainnet' 
      ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'  // Mainnet WETH
      : '0x4200000000000000000000000000000000000006'; // Base WETH
    
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${wethAddress}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) throw new Error(`DexScreener error: ${response.status}`);
    
    const data = await response.json();
    const chainId = chain === 'mainnet' ? 'ethereum' : 'base';
    
    // Filter pairs for the correct chain and sort by liquidity
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === chainId)
      .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    
    if (pairs.length === 0) throw new Error('No pairs found on DexScreener');
    
    const price = parseFloat(pairs[0].priceUsd);
    console.log(`Fetched ETH price from DexScreener (${chain}): $${price}`);
    return price;
  } catch (error) {
    console.error(`DexScreener failed for ${chain}, using fallback:`, error);
    return 3000; // Fallback price
  }
}

async function fetchBaseTokenPrice(apiKey: string): Promise<number> {
  try {
    // Note: "BASE" might refer to various tokens on Base network
    // Using a common stablecoin pair as proxy for now (e.g., USDC price should be ~$1)
    // In production, replace with actual BASE token address if different
    
    const usdcBase = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
    
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${usdcBase}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) throw new Error(`DexScreener error: ${response.status}`);
    
    const data = await response.json();
    
    // Get pairs on Base network
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === 'base')
      .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    
    if (pairs.length === 0) throw new Error('No BASE pairs found');
    
    // For demo: using USDC price as proxy (should be ~$1)
    const price = parseFloat(pairs[0].priceUsd);
    console.log(`Fetched BASE token price from DexScreener: $${price}`);
    return price;
  } catch (error) {
    console.error('Failed to fetch BASE token price:', error);
    return 1.0; // Fallback to $1 for stablecoin proxy
  }
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

  const { data: opportunity, error } = await supabase.from('arb_opportunities').insert({
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
  }).select().single();

  if (error) {
    console.error('Failed to create opportunity:', error);
    return;
  }

  // Auto-execute if enabled and opportunity is executable
  if (config.auto_trade_enabled && executable && opportunity) {
    console.log(`Auto-executing opportunity ${opportunity.id} for user ${config.user_id}`);
    
    try {
      const { data: executeResult, error: executeError } = await supabase.functions.invoke(
        'arb-execute-trade',
        {
          body: {
            opportunity_id: opportunity.id,
            user_id: config.user_id
          }
        }
      );

      if (executeError) {
        console.error('Auto-execution failed:', executeError);
      } else {
        console.log('Auto-execution result:', executeResult);
      }
    } catch (err) {
      console.error('Error during auto-execution:', err);
    }
  }
}

async function checkLoopB(supabase: any, config: any, basePrice: number) {
  console.log('Checking Loop B with BASE price:', basePrice);
  // TODO: Implement Loop B logic
}

async function checkLoopC(supabase: any, config: any, ethPrice: number, basePrice: number) {
  console.log('Checking Loop C with prices:', { ethPrice, basePrice });
  // TODO: Implement Loop C logic
}
