import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CopyTradeRequest {
  original_transaction_id: string;
  original_wallet_address: string;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  trade_type: 'new_buy' | 'rebuy' | 'sell';
  amount_sol?: number;
  amount_usd?: number;
  sell_percentage?: number;
  price_per_token?: number;
}

interface WalletCopyConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  is_fantasy_mode: boolean;
  new_buy_amount_usd: number;
  rebuy_amount_usd: number;
  copy_sell_percentage: boolean;
  max_daily_trades: number;
  max_position_size_usd: number;
}

interface WalletPosition {
  wallet_address: string;
  token_mint: string;
  balance: number;
  average_buy_price?: number;
  total_invested_usd: number;
}

interface FantasyWallet {
  id: string;
  user_id: string;
  balance_usd: number;
}

interface FantasyPosition {
  fantasy_wallet_id: string;
  token_mint: string;
  balance: number;
  average_buy_price?: number;
  total_invested_usd: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: copyTradeData }: { data: CopyTradeRequest } = await req.json()

    console.log('Processing copy trade request:', copyTradeData)

    // Get all copy configs for this monitored wallet
    const { data: copyConfigs, error: configError } = await supabase
      .from('wallet_copy_configs')
      .select(`
        *,
        monitored_wallets!inner(wallet_address)
      `)
      .eq('monitored_wallets.wallet_address', copyTradeData.original_wallet_address)
      .eq('is_enabled', true)

    if (configError) {
      console.error('Error fetching copy configs:', configError)
      throw configError
    }

    if (!copyConfigs || copyConfigs.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No active copy configs found for this wallet',
        processed_trades: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${copyConfigs.length} copy configs to process`)

    const processedTrades = []

    for (const config of copyConfigs) {
      try {
        const result = await processCopyTrade(supabase, copyTradeData, config)
        processedTrades.push(result)
      } catch (error) {
        console.error(`Error processing copy trade for user ${config.user_id}:`, error)
        processedTrades.push({
          user_id: config.user_id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const successfulTrades = processedTrades.filter(t => t.success).length

    return new Response(JSON.stringify({
      message: `Processed ${successfulTrades}/${copyConfigs.length} copy trades successfully`,
      processed_trades: successfulTrades,
      trade_results: processedTrades
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in execute-copy-trade:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function processCopyTrade(
  supabase: any,
  originalTrade: CopyTradeRequest,
  config: WalletCopyConfig
) {
  console.log(`Processing copy trade for user ${config.user_id}, fantasy mode: ${config.is_fantasy_mode}`)

  // Check daily trade limits
  const today = new Date().toISOString().split('T')[0]
  const { data: todayTrades } = await supabase
    .from('copy_trades')
    .select('id')
    .eq('user_id', config.user_id)
    .eq('copy_config_id', config.id)
    .gte('created_at', `${today}T00:00:00.000Z`)

  if (todayTrades && todayTrades.length >= config.max_daily_trades) {
    throw new Error(`Daily trade limit (${config.max_daily_trades}) reached`)
  }

  // Calculate copy trade amounts
  let copyAmountUsd: number
  let sellPercentage: number | null = null

  if (originalTrade.trade_type === 'new_buy') {
    copyAmountUsd = config.new_buy_amount_usd
  } else if (originalTrade.trade_type === 'rebuy') {
    copyAmountUsd = config.rebuy_amount_usd
  } else if (originalTrade.trade_type === 'sell' && config.copy_sell_percentage) {
    sellPercentage = originalTrade.sell_percentage || 100
    copyAmountUsd = 0 // Will calculate based on position
  } else {
    throw new Error(`Trade type ${originalTrade.trade_type} not configured for copying`)
  }

  // Check position size limits for buys
  if (originalTrade.trade_type !== 'sell') {
    const { data: existingPosition } = await supabase
      .from(config.is_fantasy_mode ? 'fantasy_positions' : 'wallet_positions')
      .select('total_invested_usd')
      .eq(config.is_fantasy_mode ? 'fantasy_wallet_id' : 'wallet_address', 
          config.is_fantasy_mode ? config.user_id : config.user_id)
      .eq('token_mint', originalTrade.token_mint)
      .single()

    const currentInvestment = existingPosition?.total_invested_usd || 0
    if (currentInvestment + copyAmountUsd > config.max_position_size_usd) {
      throw new Error(`Position size limit (${config.max_position_size_usd} USD) would be exceeded`)
    }
  }

  // Get current SOL price for calculations
  const { data: solPriceResponse } = await supabase.functions.invoke('sol-price')
  const solPrice = solPriceResponse?.price || 233

  const copyAmountSol = copyAmountUsd / solPrice

  if (config.is_fantasy_mode) {
    return await processFantasyTrade(supabase, originalTrade, config, copyAmountUsd, copyAmountSol, sellPercentage)
  } else {
    return await processRealTrade(supabase, originalTrade, config, copyAmountUsd, copyAmountSol, sellPercentage)
  }
}

async function processFantasyTrade(
  supabase: any,
  originalTrade: CopyTradeRequest,
  config: WalletCopyConfig,
  copyAmountUsd: number,
  copyAmountSol: number,
  sellPercentage: number | null
) {
  // Get or create fantasy wallet
  let { data: fantasyWallet, error: walletError } = await supabase
    .from('fantasy_wallets')
    .select('*')
    .eq('user_id', config.user_id)
    .single()

  if (walletError && walletError.code === 'PGRST116') {
    // Create new fantasy wallet
    const { data: newWallet, error: createError } = await supabase
      .from('fantasy_wallets')
      .insert({
        user_id: config.user_id,
        balance_usd: 10000 // Starting balance
      })
      .select()
      .single()

    if (createError) throw createError
    fantasyWallet = newWallet
  } else if (walletError) {
    throw walletError
  }

  // Process the fantasy trade
  if (originalTrade.trade_type === 'sell' && sellPercentage !== null) {
    return await processFantasySell(supabase, originalTrade, config, fantasyWallet, sellPercentage)
  } else {
    return await processFantasyBuy(supabase, originalTrade, config, fantasyWallet, copyAmountUsd, copyAmountSol)
  }
}

async function processFantasyBuy(
  supabase: any,
  originalTrade: CopyTradeRequest,
  config: WalletCopyConfig,
  fantasyWallet: any,
  copyAmountUsd: number,
  copyAmountSol: number
) {
  // Check fantasy wallet balance
  if (fantasyWallet.balance_usd < copyAmountUsd) {
    throw new Error('Insufficient fantasy wallet balance')
  }

  const tokenAmount = copyAmountUsd / (originalTrade.price_per_token || 1)

  // Get or create fantasy position
  let { data: position, error: positionError } = await supabase
    .from('fantasy_positions')
    .select('*')
    .eq('fantasy_wallet_id', fantasyWallet.id)
    .eq('token_mint', originalTrade.token_mint)
    .single()

  if (positionError && positionError.code === 'PGRST116') {
    // Create new position
    const { error: createError } = await supabase
      .from('fantasy_positions')
      .insert({
        fantasy_wallet_id: fantasyWallet.id,
        token_mint: originalTrade.token_mint,
        token_symbol: originalTrade.token_symbol,
        token_name: originalTrade.token_name,
        balance: tokenAmount,
        average_buy_price: originalTrade.price_per_token,
        total_invested_usd: copyAmountUsd,
        first_purchase_at: new Date().toISOString()
      })

    if (createError) throw createError
  } else if (positionError) {
    throw positionError
  } else {
    // Update existing position
    const newBalance = position.balance + tokenAmount
    const newTotalInvested = position.total_invested_usd + copyAmountUsd
    const newAveragePrice = newTotalInvested / newBalance

    const { error: updateError } = await supabase
      .from('fantasy_positions')
      .update({
        balance: newBalance,
        average_buy_price: newAveragePrice,
        total_invested_usd: newTotalInvested,
        last_transaction_at: new Date().toISOString()
      })
      .eq('id', position.id)

    if (updateError) throw updateError
  }

  // Update fantasy wallet balance
  const { error: walletUpdateError } = await supabase
    .from('fantasy_wallets')
    .update({
      balance_usd: fantasyWallet.balance_usd - copyAmountUsd,
      total_invested: fantasyWallet.total_invested + copyAmountUsd,
      total_trades: fantasyWallet.total_trades + 1
    })
    .eq('id', fantasyWallet.id)

  if (walletUpdateError) throw walletUpdateError

  // Log the copy trade
  const { error: logError } = await supabase
    .from('copy_trades')
    .insert({
      user_id: config.user_id,
      copy_config_id: config.id,
      original_transaction_id: originalTrade.original_transaction_id,
      original_wallet_address: originalTrade.original_wallet_address,
      token_mint: originalTrade.token_mint,
      token_symbol: originalTrade.token_symbol,
      trade_type: originalTrade.trade_type,
      amount_usd: copyAmountUsd,
      amount_sol: copyAmountSol,
      token_amount: tokenAmount,
      price_per_token: originalTrade.price_per_token,
      is_fantasy: true,
      status: 'executed',
      executed_at: new Date().toISOString()
    })

  if (logError) throw logError

  return {
    user_id: config.user_id,
    success: true,
    trade_type: originalTrade.trade_type,
    amount_usd: copyAmountUsd,
    is_fantasy: true
  }
}

async function processFantasySell(
  supabase: any,
  originalTrade: CopyTradeRequest,
  config: WalletCopyConfig,
  fantasyWallet: any,
  sellPercentage: number
) {
  // Get fantasy position
  const { data: position, error: positionError } = await supabase
    .from('fantasy_positions')
    .select('*')
    .eq('fantasy_wallet_id', fantasyWallet.id)
    .eq('token_mint', originalTrade.token_mint)
    .single()

  if (positionError || !position) {
    throw new Error('No fantasy position found to sell')
  }

  const sellAmount = position.balance * (sellPercentage / 100)
  const sellValueUsd = sellAmount * (originalTrade.price_per_token || position.average_buy_price || 1)
  const costBasis = position.total_invested_usd * (sellPercentage / 100)
  const profitLoss = sellValueUsd - costBasis

  // Update position
  const newBalance = position.balance - sellAmount
  const newTotalInvested = position.total_invested_usd - costBasis

  if (newBalance <= 0.000001) {
    // Close position
    const { error: deleteError } = await supabase
      .from('fantasy_positions')
      .delete()
      .eq('id', position.id)

    if (deleteError) throw deleteError
  } else {
    // Update position
    const { error: updateError } = await supabase
      .from('fantasy_positions')
      .update({
        balance: newBalance,
        total_invested_usd: newTotalInvested,
        profit_loss_usd: (position.profit_loss_usd || 0) + profitLoss,
        last_transaction_at: new Date().toISOString()
      })
      .eq('id', position.id)

    if (updateError) throw updateError
  }

  // Update fantasy wallet
  const { error: walletUpdateError } = await supabase
    .from('fantasy_wallets')
    .update({
      balance_usd: fantasyWallet.balance_usd + sellValueUsd,
      total_profit_loss: fantasyWallet.total_profit_loss + profitLoss,
      total_trades: fantasyWallet.total_trades + 1
    })
    .eq('id', fantasyWallet.id)

  if (walletUpdateError) throw walletUpdateError

  // Log the copy trade
  const { error: logError } = await supabase
    .from('copy_trades')
    .insert({
      user_id: config.user_id,
      copy_config_id: config.id,
      original_transaction_id: originalTrade.original_transaction_id,
      original_wallet_address: originalTrade.original_wallet_address,
      token_mint: originalTrade.token_mint,
      token_symbol: originalTrade.token_symbol,
      trade_type: 'sell',
      amount_usd: sellValueUsd,
      token_amount: sellAmount,
      price_per_token: originalTrade.price_per_token,
      sell_percentage: sellPercentage,
      is_fantasy: true,
      status: 'executed',
      executed_at: new Date().toISOString(),
      profit_loss_usd: profitLoss
    })

  if (logError) throw logError

  return {
    user_id: config.user_id,
    success: true,
    trade_type: 'sell',
    amount_usd: sellValueUsd,
    profit_loss_usd: profitLoss,
    is_fantasy: true
  }
}

async function processRealTrade(
  supabase: any,
  originalTrade: CopyTradeRequest,
  config: WalletCopyConfig,
  copyAmountUsd: number,
  copyAmountSol: number,
  sellPercentage: number | null
) {
  // For real trades, we need to call the raydium-swap function
  // First, get user's trading secrets
  const { data: userSecrets, error: secretsError } = await supabase
    .from('user_secrets')
    .select('trading_private_key, rpc_url')
    .eq('user_id', config.user_id)
    .single()

  if (secretsError || !userSecrets) {
    throw new Error('User trading secrets not found')
  }

  let swapParams: any

  if (originalTrade.trade_type === 'sell' && sellPercentage !== null) {
    // For sells, we need to get current position and calculate sell amount
    const { data: position } = await supabase
      .from('wallet_positions')
      .select('*')
      .eq('wallet_address', config.user_id) // Using user_id as wallet identifier
      .eq('token_mint', originalTrade.token_mint)
      .single()

    if (!position) {
      throw new Error('No position found to sell')
    }

    const sellAmount = position.balance * (sellPercentage / 100)

    swapParams = {
      private_key: userSecrets.trading_private_key,
      rpc_url: userSecrets.rpc_url,
      input_mint: originalTrade.token_mint,
      output_mint: 'So11111111111111111111111111111111111111112', // SOL
      amount: sellAmount,
      slippage: 300 // 3%
    }
  } else {
    // For buys
    swapParams = {
      private_key: userSecrets.trading_private_key,
      rpc_url: userSecrets.rpc_url,
      input_mint: 'So11111111111111111111111111111111111111112', // SOL
      output_mint: originalTrade.token_mint,
      amount: copyAmountSol,
      slippage: 300 // 3%
    }
  }

  // Execute the swap
  const { data: swapResult, error: swapError } = await supabase.functions.invoke('raydium-swap', {
    body: swapParams
  })

  if (swapError || !swapResult.success) {
    throw new Error(`Swap failed: ${swapError?.message || swapResult?.error}`)
  }

  // Update wallet positions and log the trade
  await updateWalletPosition(supabase, config.user_id, originalTrade, copyAmountUsd, sellPercentage)

  // Log the copy trade
  const { error: logError } = await supabase
    .from('copy_trades')
    .insert({
      user_id: config.user_id,
      copy_config_id: config.id,
      original_transaction_id: originalTrade.original_transaction_id,
      original_wallet_address: originalTrade.original_wallet_address,
      token_mint: originalTrade.token_mint,
      token_symbol: originalTrade.token_symbol,
      trade_type: originalTrade.trade_type,
      amount_usd: copyAmountUsd,
      amount_sol: copyAmountSol,
      token_amount: swapResult.output_amount,
      price_per_token: originalTrade.price_per_token,
      sell_percentage: sellPercentage,
      is_fantasy: false,
      status: 'executed',
      executed_at: new Date().toISOString(),
      transaction_signature: swapResult.signature
    })

  if (logError) throw logError

  return {
    user_id: config.user_id,
    success: true,
    trade_type: originalTrade.trade_type,
    amount_usd: copyAmountUsd,
    signature: swapResult.signature,
    is_fantasy: false
  }
}

async function updateWalletPosition(
  supabase: any,
  userId: string,
  originalTrade: CopyTradeRequest,
  copyAmountUsd: number,
  sellPercentage: number | null
) {
  // Implementation for updating real wallet positions
  // This would track the user's actual token positions
  // Similar to fantasy position logic but for real trades
  console.log('Updating wallet position for real trade - implementation needed')
}