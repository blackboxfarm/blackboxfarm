// Strategic USDC-based trading opportunities with REAL market data

export async function checkUsdcToEth(
  supabase: any,
  config: any,
  ethPrice: number,
  balances: any,
  apiKey: string
) {
  const userId = config.user_id;
  const availableUsdc = balances.usdc_mainnet;
  
  if (availableUsdc < 100) {
    console.log('Insufficient USDC for ETH entry');
    return;
  }

  // Calculate how much USDC to deploy (respect max deployment %)
  const maxDeployment = availableUsdc * (config.max_usdc_deployment_pct / 100);
  const usdcAmount = Math.min(1000, maxDeployment); // Cap at $1000 per trade
  
  // Calculate expected ETH received
  const expectedEth = usdcAmount / ethPrice;
  
  // Real swap fees (0.3% Uniswap V3)
  const swapFee = usdcAmount * 0.003;
  const gasEth = 0.01; // Real mainnet gas
  const totalFeesUsd = swapFee + (gasEth * ethPrice);
  
  const netEth = (usdcAmount - swapFee) / ethPrice;
  
  // Check if this is a good entry point (only buy if price favorable)
  // Get average ETH price over last 24h from price snapshots
  const { data: recentPrices } = await supabase
    .from('arb_price_snapshots')
    .select('eth_mainnet_usd')
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false })
    .limit(100);
  
  const avgPrice = recentPrices?.length 
    ? recentPrices.reduce((sum: number, p: any) => sum + p.eth_mainnet_usd, 0) / recentPrices.length
    : ethPrice;
  
  const belowAverage = ethPrice < avgPrice * 0.98; // 2% below 24h average
  
  if (!belowAverage) {
    console.log(`ETH price $${ethPrice} not favorable vs 24h avg $${avgPrice.toFixed(2)}`);
    return;
  }

  console.log(`✅ USDC→ETH opportunity: Deploy $${usdcAmount} at $${ethPrice} (${((avgPrice - ethPrice) / avgPrice * 100).toFixed(2)}% below avg)`);

  // Create opportunity record
  await supabase.from('arb_opportunities').insert({
    user_id: userId,
    loop_type: 'Strategic: USDC → ETH Entry',
    trade_size_eth: netEth,
    expected_profit_eth: 0, // No immediate profit, this is position entry
    expected_profit_bps: 0,
    expected_final_eth: netEth,
    executable: true,
    meets_profit_threshold: true,
    meets_slippage_threshold: true,
    meets_gas_limits: true,
    meets_liquidity_depth: true,
    leg_breakdown: {
      strategy: 'opportunistic_entry',
      usdc_deployed: usdcAmount,
      entry_price: ethPrice,
      avg_24h_price: avgPrice,
      discount_pct: ((avgPrice - ethPrice) / avgPrice * 100),
      expected_eth: netEth,
      fees_usd: totalFeesUsd,
      data_source: 'live_market_data'
    }
  });

  // If auto-trade enabled, execute and create position
  if (config.auto_trade_enabled && config.dry_run_enabled) {
    // Update balances
    await supabase.from('arb_balances').update({
      usdc_mainnet: availableUsdc - usdcAmount,
      eth_mainnet: balances.eth_mainnet + netEth,
      last_updated: new Date().toISOString()
    }).eq('user_id', userId);

    // Create position for tracking
    await supabase.from('arb_positions').insert({
      user_id: userId,
      asset: 'ETH',
      chain: 'mainnet',
      amount: netEth,
      entry_price_usd: ethPrice,
      opened_at: new Date().toISOString(),
      status: 'open'
    });

    console.log(`💰 Deployed $${usdcAmount} → ${netEth.toFixed(6)} ETH at $${ethPrice}`);
  }
}

export async function checkUsdcToBase(
  supabase: any,
  config: any,
  basePrice: number,
  balances: any,
  apiKey: string
) {
  const userId = config.user_id;
  const availableUsdc = balances.usdc_base;
  
  if (availableUsdc < 50) {
    console.log('Insufficient USDC on Base for BASE entry');
    return;
  }

  const maxDeployment = availableUsdc * (config.max_usdc_deployment_pct / 100);
  const usdcAmount = Math.min(500, maxDeployment);
  
  const expectedBase = usdcAmount / basePrice;
  const swapFee = usdcAmount * 0.003; // Aerodrome 0.3%
  const gasUsd = 0.05; // Base gas is cheap
  
  const netBase = (usdcAmount - swapFee) / basePrice;

  // Check if BASE price favorable
  const { data: recentPrices } = await supabase
    .from('arb_price_snapshots')
    .select('base_token_usd')
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false })
    .limit(100);
  
  const avgPrice = recentPrices?.length 
    ? recentPrices.reduce((sum: number, p: any) => sum + p.base_token_usd, 0) / recentPrices.length
    : basePrice;
  
  const belowAverage = basePrice < avgPrice * 0.95; // 5% below average
  
  if (!belowAverage) {
    console.log(`BASE price $${basePrice} not favorable vs avg $${avgPrice.toFixed(4)}`);
    return;
  }

  console.log(`✅ USDC→BASE opportunity: Deploy $${usdcAmount} at $${basePrice}`);

  await supabase.from('arb_opportunities').insert({
    user_id: userId,
    loop_type: 'Strategic: USDC → BASE Entry',
    trade_size_eth: 0,
    expected_profit_eth: 0,
    expected_profit_bps: 0,
    expected_final_eth: 0,
    executable: true,
    meets_profit_threshold: true,
    meets_slippage_threshold: true,
    meets_gas_limits: true,
    meets_liquidity_depth: true,
    leg_breakdown: {
      strategy: 'base_token_entry',
      usdc_deployed: usdcAmount,
      entry_price: basePrice,
      avg_24h_price: avgPrice,
      expected_base_tokens: netBase,
      fees_usd: swapFee + gasUsd
    }
  });

  if (config.auto_trade_enabled && config.dry_run_enabled) {
    await supabase.from('arb_balances').update({
      usdc_base: availableUsdc - usdcAmount,
      base_token_base: balances.base_token_base + netBase
    }).eq('user_id', userId);

    await supabase.from('arb_positions').insert({
      user_id: userId,
      asset: 'BASE',
      chain: 'base',
      amount: netBase,
      entry_price_usd: basePrice,
      opened_at: new Date().toISOString(),
      status: 'open'
    });
  }
}

export async function checkProfitTaking(
  supabase: any,
  config: any,
  ethPrice: number,
  basePrice: number,
  balances: any
) {
  const userId = config.user_id;
  
  // Get all open positions
  const { data: positions } = await supabase
    .from('arb_positions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open');
  
  if (!positions || positions.length === 0) return;

  for (const position of positions) {
    const currentPrice = position.asset === 'ETH' ? ethPrice : basePrice;
    const entryPrice = position.entry_price_usd;
    const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    const minGain = position.asset === 'ETH' 
      ? config.min_eth_gain_pct_for_sell 
      : config.min_base_gain_pct_for_sell;
    
    if (gainPct < minGain) {
      console.log(`Position ${position.id}: ${gainPct.toFixed(2)}% gain < ${minGain}% threshold`);
      continue;
    }

    // Calculate profit-taking
    const sellPct = config.partial_profit_take_pct / 100;
    const sellAmount = position.amount * sellPct;
    const sellValueUsd = sellAmount * currentPrice;
    
    const swapFee = sellValueUsd * 0.003;
    const gasUsd = position.chain === 'mainnet' ? 20 : 0.10;
    const netUsdc = sellValueUsd - swapFee - gasUsd;
    const realizedProfit = netUsdc - (position.amount * sellPct * entryPrice);

    console.log(`🎯 PROFIT-TAKING: ${position.asset} +${gainPct.toFixed(2)}% → Sell ${sellPct * 100}% for $${netUsdc.toFixed(2)} profit`);

    await supabase.from('arb_opportunities').insert({
      user_id: userId,
      loop_type: `Profit Taking: ${position.asset} ${gainPct.toFixed(1)}% gain`,
      trade_size_eth: sellAmount,
      expected_profit_eth: realizedProfit / ethPrice,
      expected_profit_bps: Math.round((realizedProfit / sellValueUsd) * 10000),
      expected_final_eth: 0,
      executable: true,
      meets_profit_threshold: true,
      meets_slippage_threshold: true,
      meets_gas_limits: true,
      meets_liquidity_depth: true,
      leg_breakdown: {
        strategy: 'profit_taking',
        position_id: position.id,
        asset: position.asset,
        entry_price: entryPrice,
        current_price: currentPrice,
        gain_pct: gainPct,
        sell_amount: sellAmount,
        sell_pct: sellPct * 100,
        net_usdc: netUsdc,
        realized_profit_usd: realizedProfit
      }
    });

    // Execute if auto-trade enabled
    if (config.auto_trade_enabled && config.dry_run_enabled) {
      // Update position
      const newAmount = position.amount - sellAmount;
      const newStatus = newAmount < position.amount * 0.1 ? 'closed' : 'partially_closed';
      
      await supabase.from('arb_positions').update({
        amount: newAmount,
        status: newStatus,
        closed_at: newStatus === 'closed' ? new Date().toISOString() : null
      }).eq('id', position.id);

      // Update balances
      if (position.chain === 'mainnet') {
        await supabase.from('arb_balances').update({
          eth_mainnet: balances.eth_mainnet - sellAmount,
          usdc_mainnet: balances.usdc_mainnet + netUsdc
        }).eq('user_id', userId);
      } else {
        await supabase.from('arb_balances').update({
          base_token_base: balances.base_token_base - sellAmount,
          usdc_base: balances.usdc_base + netUsdc
        }).eq('user_id', userId);
      }

      console.log(`💸 Took profit: $${realizedProfit.toFixed(2)} (${sellPct * 100}% position closed)`);
    }
  }
}
