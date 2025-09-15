import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackfillRequest {
  wallet_address: string;
  hours?: number; // Default 24 hours
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { wallet_address, hours = 24 }: BackfillRequest = await req.json()

    console.log(`Starting backfill for wallet ${wallet_address} for last ${hours} hours`)

    // Calculate the time range
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000))

    // Get transactions from Helius
    const transactions = await getWalletTransactions(heliusApiKey, wallet_address, startTime, endTime)
    
    console.log(`Found ${transactions.length} transactions to analyze`)

    const processedTransactions = []
    const walletPositions = new Map<string, any>()

    // Process transactions in chronological order
    transactions.sort((a, b) => a.timestamp - b.timestamp)

    for (const tx of transactions) {
      try {
        const processedTx = await processTransaction(supabase, tx, wallet_address, walletPositions)
        if (processedTx) {
          processedTransactions.push(processedTx)
          
          // Trigger copy trades for this transaction
          await triggerCopyTrades(supabase, processedTx)
        }
      } catch (error) {
        console.error(`Error processing transaction ${tx.signature}:`, error)
      }
    }

    console.log(`Successfully processed ${processedTransactions.length} transactions`)

    return new Response(JSON.stringify({
      success: true,
      wallet_address,
      hours_backfilled: hours,
      transactions_found: transactions.length,
      transactions_processed: processedTransactions.length,
      copy_trades_triggered: processedTransactions.length,
      transactions: processedTransactions
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in backfill-wallet-transactions:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getWalletTransactions(apiKey: string, walletAddress: string, startTime: Date, endTime: Date) {
  const transactions = []
  let before = undefined
  
  while (true) {
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions`
    const params = new URLSearchParams({
      'api-key': apiKey,
      limit: '100',
      type: 'SWAP'
    })
    
    if (before) {
      params.append('before', before)
    }

    const response = await fetch(`${url}?${params}`)
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data || data.length === 0) {
      break
    }

    // Filter transactions by time range
    const filteredTxs = data.filter((tx: any) => {
      const txTime = new Date(tx.timestamp * 1000)
      return txTime >= startTime && txTime <= endTime
    })

    transactions.push(...filteredTxs)

    // If we've gone beyond our time range, stop
    const lastTxTime = new Date(data[data.length - 1].timestamp * 1000)
    if (lastTxTime < startTime) {
      break
    }

    // Set up for next page
    before = data[data.length - 1].signature
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return transactions
}

async function processTransaction(supabase: any, txData: any, walletAddress: string, walletPositions: Map<string, any>) {
  // Similar to the wallet-monitor processTransaction but for historical data
  const signature = txData.signature
  const timestamp = new Date(txData.timestamp * 1000)

  // Look for swap events in the transaction
  const swapEvents = []
  
  if (txData.events?.swap) {
    swapEvents.push(...txData.events.swap)
  }

  if (swapEvents.length === 0) {
    return null
  }

  for (const swap of swapEvents) {
    // Determine if this is a buy or sell
    const isBuy = swap.tokenInputs?.[0]?.mint === 'So11111111111111111111111111111111111111112' // SOL
    const isSell = swap.tokenOutputs?.[0]?.mint === 'So11111111111111111111111111111111111111112' // SOL

    if (!isBuy && !isSell) continue

    const tokenMint = isBuy ? 
      swap.tokenOutputs?.[0]?.mint : 
      swap.tokenInputs?.[0]?.mint

    if (!tokenMint) continue

    const amountSol = isBuy ? 
      swap.tokenInputs?.[0]?.rawTokenAmount?.tokenAmount || 0 :
      swap.tokenOutputs?.[0]?.rawTokenAmount?.tokenAmount || 0

    const tokenAmount = isBuy ?
      swap.tokenOutputs?.[0]?.rawTokenAmount?.tokenAmount || 0 :
      swap.tokenInputs?.[0]?.rawTokenAmount?.tokenAmount || 0

    // Get token metadata
    const { data: tokenMetadata } = await supabase
      .from('token_metadata')
      .select('name, symbol')
      .eq('mint_address', tokenMint)
      .single()

    // Determine if this is a first purchase
    const position = walletPositions.get(tokenMint) || { balance: 0 }
    const isFirstPurchase = isBuy && position.balance === 0

    // Update position tracking
    if (isBuy) {
      position.balance += parseFloat(tokenAmount)
      position.last_buy_time = timestamp
      if (!position.first_buy_time) {
        position.first_buy_time = timestamp
      }
    } else {
      const sellPercentage = position.balance > 0 ? (parseFloat(tokenAmount) / position.balance) * 100 : 100
      position.balance = Math.max(0, position.balance - parseFloat(tokenAmount))
      position.sell_percentage = sellPercentage
    }
    
    walletPositions.set(tokenMint, position)

    // Detect platform
    const platform = await detectPlatform(txData.signature)

    // Get current price for USD calculations
    const { data: solPriceResponse } = await supabase.functions.invoke('sol-price')
    const solPrice = solPriceResponse?.price || 233
    const amountUsd = (parseFloat(amountSol) / 1e9) * solPrice

    // Determine trade type
    let tradeType = 'buy'
    if (isSell) {
      tradeType = 'sell'
    } else if (isBuy && !isFirstPurchase) {
      // Check if this is within a reasonable time frame of the first buy to be considered a rebuy
      const timeSinceFirstBuy = timestamp.getTime() - (position.first_buy_time?.getTime() || 0)
      const isRecentRebuy = timeSinceFirstBuy < (24 * 60 * 60 * 1000) // Within 24 hours
      if (isRecentRebuy) {
        tradeType = 'rebuy'
      }
    }

    // Create the transaction record
    const transactionData = {
      monitored_wallet_id: null, // Will be set if this wallet is being monitored
      signature,
      transaction_type: isBuy ? 'buy' : 'sell',
      token_mint: tokenMint,
      token_symbol: tokenMetadata?.symbol,
      token_name: tokenMetadata?.name,
      amount_sol: parseFloat(amountSol) / 1e9,
      amount_usd: amountUsd,
      is_first_purchase: isFirstPurchase,
      meets_criteria: amountUsd >= 100, // Basic criteria
      platform,
      timestamp: timestamp.toISOString(),
      created_at: new Date().toISOString()
    }

    // Check if this wallet is being monitored
    const { data: monitoredWallet } = await supabase
      .from('monitored_wallets')
      .select('id')
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .single()

    if (monitoredWallet) {
      transactionData.monitored_wallet_id = monitoredWallet.id

      // Store in wallet_transactions table
      const { error: insertError } = await supabase
        .from('wallet_transactions')
        .insert(transactionData)

      if (insertError && !insertError.message.includes('duplicate key')) {
        console.error('Error inserting transaction:', insertError)
      }
    }

    // Update wallet positions table
    await updateWalletPosition(supabase, walletAddress, tokenMint, position, tokenMetadata)

    return {
      ...transactionData,
      trade_type: tradeType,
      sell_percentage: position.sell_percentage
    }
  }

  return null
}

async function updateWalletPosition(supabase: any, walletAddress: string, tokenMint: string, position: any, tokenMetadata: any) {
  const { error } = await supabase
    .from('wallet_positions')
    .upsert({
      wallet_address: walletAddress,
      token_mint: tokenMint,
      balance: position.balance,
      first_purchase_at: position.first_buy_time?.toISOString(),
      last_transaction_at: new Date().toISOString()
    }, {
      onConflict: 'wallet_address,token_mint'
    })

  if (error) {
    console.error('Error updating wallet position:', error)
  }
}

async function detectPlatform(signature: string): Promise<string> {
  // Simplified platform detection - in reality would examine program IDs
  return 'Unknown'
}

async function triggerCopyTrades(supabase: any, transactionData: any) {
  // Trigger copy trades for this historical transaction
  if (!transactionData.monitored_wallet_id) return

  const copyTradeRequest = {
    original_transaction_id: transactionData.signature,
    original_wallet_address: transactionData.wallet_address,
    token_mint: transactionData.token_mint,
    token_symbol: transactionData.token_symbol,
    token_name: transactionData.token_name,
    trade_type: transactionData.trade_type,
    amount_sol: transactionData.amount_sol,
    amount_usd: transactionData.amount_usd,
    sell_percentage: transactionData.sell_percentage,
    price_per_token: transactionData.amount_usd / (transactionData.amount_sol * 233) // Rough price calculation
  }

  try {
    await supabase.functions.invoke('execute-copy-trade', {
      body: copyTradeRequest
    })
  } catch (error) {
    console.error('Error triggering copy trade:', error)
  }
}