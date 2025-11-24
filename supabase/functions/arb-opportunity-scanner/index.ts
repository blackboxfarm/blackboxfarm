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

async function checkLoopA(
  supabase: any,
  config: any,
  ethMainnet: number,
  ethBase: number
) {
  const userId = config.user_id;
  
  // Fetch user's current balances
  const { data: balances } = await supabase
    .from('arb_balances')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!balances) {
    console.log('No balance record found for user, skipping Loop A');
    return;
  }

  // Check if user has ETH on mainnet to execute this opportunity
  const availableEthMainnet = balances.eth_mainnet;
  if (availableEthMainnet <= 0) {
    console.log('No ETH on mainnet, skipping Loop A');
    return;
  }

  // Calculate trade size based on mode and available balance
  let tradeSize = config.trade_size_mode === 'fixed' 
    ? config.trade_size_fixed_eth 
    : (availableEthMainnet * config.trade_size_pct_balance / 100);
  
  // Cap trade size at available balance
  tradeSize = Math.min(tradeSize, availableEthMainnet);

  // Calculate realistic fees
  const bridgeFeeRate = config.max_bridge_fee_pct / 100; // e.g., 0.005 for 0.5%
  const bridgeFee = tradeSize * bridgeFeeRate;
  
  // Realistic gas estimates in ETH
  const gasMainnet = 0.015; // ~$20-50 at typical ETH prices
  const gasBase = 0.0001; // ~$0.10 on Base (much cheaper)
  const totalGas = gasMainnet + gasBase;
  
  // Swap fee (0.3% per hop, assuming 1 hop on each side)
  const swapFeeRate = 0.003;
  const swapFees = tradeSize * swapFeeRate * 2; // Buy + sell
  
  // Calculate net profit
  const priceDiff = ethBase - ethMainnet;
  const grossProfit = priceDiff * tradeSize;
  const totalFees = bridgeFee + totalGas + swapFees;
  const netProfit = grossProfit - totalFees;
  const profitBps = Math.round((netProfit / tradeSize) * 10000);

  // Check if meets thresholds
  const meetsProfit = profitBps >= config.min_profit_bps;
  const meetsGas = totalGas <= (config.max_gas_per_tx_eth + config.max_gas_per_tx_base);
  const meetsSlippage = Math.abs(priceDiff / ethMainnet * 10000) <= config.max_slippage_bps_per_hop;
  const hasBalance = tradeSize > 0 && tradeSize <= availableEthMainnet;
  const meetsLiquidity = tradeSize <= 10; // Assume max 10 ETH liquidity for now
  
  const executable = meetsProfit && meetsSlippage && meetsGas && meetsLiquidity && hasBalance && config.balance_aware_mode;
  
  let skipReason = null;
  if (!executable) {
    if (!meetsProfit) skipReason = `Profit ${profitBps}bps < threshold ${config.min_profit_bps}bps`;
    else if (!hasBalance) skipReason = `Insufficient balance: ${availableEthMainnet.toFixed(4)} ETH`;
    else if (!meetsGas) skipReason = `Gas too high: ${totalGas.toFixed(6)} ETH`;
    else if (!meetsSlippage) skipReason = `Slippage too high`;
    else if (!meetsLiquidity) skipReason = `Trade size exceeds liquidity`;
  }

  // Log opportunity
  const { data: opportunity } = await supabase
    .from('arb_opportunities')
    .insert({
      user_id: userId,
      loop_type: 'Loop A: ETH Mainnet → Base',
      trade_size_eth: tradeSize,
      expected_profit_eth: netProfit,
      expected_profit_bps: profitBps,
      expected_final_eth: tradeSize + netProfit,
      executable,
      skip_reason: skipReason,
      meets_profit_threshold: meetsProfit,
      meets_slippage_threshold: meetsSlippage,
      meets_gas_limits: meetsGas,
      meets_liquidity_depth: meetsLiquidity,
      leg_breakdown: {
        available_balance: availableEthMainnet,
        trade_size: tradeSize,
        price_mainnet: ethMainnet,
        price_base: ethBase,
        price_diff: priceDiff,
        gross_profit: grossProfit,
        fees: {
          bridge: bridgeFee,
          gas_mainnet: gasMainnet,
          gas_base: gasBase,
          swap: swapFees,
          total: totalFees
        },
        net_profit: netProfit
      }
    })
    .select()
    .single();

  // Auto-execute if enabled and executable
  if (executable && config.auto_trade_enabled && opportunity) {
    console.log(`Auto-executing opportunity ${opportunity.id}`);
    // Trigger execution (will be handled by arb-execute-trade function)
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
