import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackfillRequest {
  wallet_address: string
  hours: number
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { wallet_address, hours }: BackfillRequest = await req.json()

    console.log(`Starting backfill for wallet ${wallet_address} for last ${hours} hours`)

    const transactions = await getWalletTransactions(wallet_address, hours, heliusApiKey)
    console.log(`Found ${transactions.length} transactions to analyze`)

    // Process each transaction and trigger copy trades if applicable
    const processedTransactions = []
    const totalTransactions = transactions.length
    for (const txData of transactions) {
      try {
        const result = await processTransaction(txData, wallet_address, supabase)
        if (result) {
          processedTransactions.push(result)
          
          // Trigger copy trades if this wallet is monitored
          if (result.isMonitored) {
            await triggerCopyTrades([result], supabase)
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${txData.signature}:`, error)
      }
    }

    console.log(`Successfully processed ${processedTransactions.length} transactions`)

    const monitoredTransactions = processedTransactions.filter(tx => tx.isMonitored)
    const errorCount = totalTransactions - processedTransactions.length
    
    return new Response(JSON.stringify({
      success: true,
      wallet_address,
      hours_backfilled: hours,
      transactions_found: transactions.length,
      transactions_processed: processedTransactions.length,
      error_count: errorCount,
      copy_trades_triggered: monitoredTransactions.length,
      monitored_wallet: monitoredTransactions.length > 0,
      message: transactions.length > 0 
        ? `Found ${transactions.length} transactions, processed ${processedTransactions.length} swaps${errorCount > 0 ? ` (${errorCount} parsing errors)` : ''}${monitoredTransactions.length > 0 ? `, triggered ${monitoredTransactions.length} copy trades` : ''}.`
        : 'No transactions found in the specified time period.',
      transactions: processedTransactions
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Backfill error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getWalletTransactions(address: string, hours: number, heliusApiKey: string) {
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000))
  
  let transactions = []
  let before = null

  for (let page = 0; page < 10; page++) { // Limit to 10 pages max
    const requestBody = {
      address,
      before,
      limit: 50,
      type: 'SWAP'
    }

    const response = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      console.error('Helius API error:', response.status, await response.text())
      break
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

async function processTransaction(txData: any, walletAddress: string, supabase: any) {
  const signature = txData.signature
  const timestamp = new Date(txData.timestamp * 1000).toISOString()

  // Process swap events - handle both array and single object formats
  const swapData = txData.events?.swap
  if (!swapData) {
    return null // Skip non-swap transactions
  }
  
  // Normalize to array format
  const events = Array.isArray(swapData) ? swapData : [swapData]
  if (events.length === 0) {
    return null
  }

  for (const swapEvent of events) {
    // Safely handle token inputs/outputs - they might be arrays or single objects
    const tokenInputsRaw = swapEvent.tokenInputs || []
    const tokenOutputsRaw = swapEvent.tokenOutputs || []
    
    const tokenInputs = Array.isArray(tokenInputsRaw) ? tokenInputsRaw : (tokenInputsRaw ? [tokenInputsRaw] : [])
    const tokenOutputs = Array.isArray(tokenOutputsRaw) ? tokenOutputsRaw : (tokenOutputsRaw ? [tokenOutputsRaw] : [])
    
    if (tokenInputs.length === 0 && tokenOutputs.length === 0) {
      continue // Skip if no token data
    }

    const swap = swapEvent
    const isSol = (mint: string) => mint === 'So11111111111111111111111111111111111111112'
    
    // Determine if this is a buy or sell
    const isBuy = swap.tokenInputs?.some((input: any) => isSol(input.mint))
    const isSell = swap.tokenOutputs?.some((output: any) => isSol(output.mint))
    
    if (!isBuy && !isSell) continue // Skip if neither buy nor sell
    
    // Get the token mint (the non-SOL token)
    const tokenMint = isBuy ? 
      swap.tokenOutputs?.find((output: any) => !isSol(output.mint))?.mint :
      swap.tokenInputs?.find((input: any) => !isSol(input.mint))?.mint

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

    // Check if wallet is being monitored
    const { data: monitoredWallet } = await supabase
      .from('monitored_wallets')
      .select('id')
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .single()

    // Update wallet position
    await updateWalletPosition(tokenMint, walletAddress, tokenAmount, isBuy, supabase)

    // Get position data for trade classification
    const { data: position } = await supabase
      .from('wallet_positions')
      .select('balance, first_purchase_at')
      .eq('wallet_address', walletAddress)
      .eq('token_mint', tokenMint)
      .single()

    const isFirstPurchase = isBuy && (!position || position.balance === 0)

    // Get SOL price at time of transaction
    const solPriceResponse = await fetch(`https://api.helius.xyz/v0/tokens/metadata?api-key=${Deno.env.get('HELIUS_API_KEY')!}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: ['So11111111111111111111111111111111111111112'] })
    }).then(r => r.json()).then(data => data[0]).catch(() => null)

    const solPrice = solPriceResponse?.price || 233
    const amountUsd = (parseFloat(amountSol) / 1e9) * solPrice

    // Determine trade type for copy trading system
    let tradeType = 'new_buy'  // Map to copy trading system format
    if (isSell) {
      tradeType = 'sell'
    } else if (isBuy && !isFirstPurchase) {
      tradeType = 'add_buy'
    }

    const platform = detectPlatform(signature)

    // If this wallet is monitored, insert the transaction
    const transactionData = {
      monitored_wallet_id: null, // Will be set if this wallet is being monitored
      signature,
      transaction_type: isBuy ? 'buy' : 'sell', // Keep database format as 'buy'/'sell'
      token_mint: tokenMint,
      token_symbol: tokenMetadata?.symbol,
      token_name: tokenMetadata?.name,
      amount_sol: parseFloat(amountSol) / 1e9,
      amount_usd: amountUsd,
      is_first_purchase: isFirstPurchase,
      meets_criteria: true,
      timestamp: timestamp,
      platform: platform
    }

    if (monitoredWallet) {
      transactionData.monitored_wallet_id = monitoredWallet.id
      
      const { error } = await supabase
        .from('wallet_transactions')
        .insert(transactionData)

      if (error) {
        console.error('Error inserting transaction:', error)
      }
    }

    // Return transaction data for copy trading analysis
    return {
      ...transactionData,
      trade_type: tradeType,
      sell_percentage: position?.sell_percentage,
      wallet_address: walletAddress,
      isMonitored: !!monitoredWallet
    }
  }

  return null
}

async function updateWalletPosition(tokenMint: string, walletAddress: string, tokenAmount: string, isBuy: boolean, supabase: any) {
  const amount = parseFloat(tokenAmount) / 1e9 // Convert from raw amount

  await supabase.rpc('upsert_wallet_position', {
    p_wallet_address: walletAddress,
    p_token_mint: tokenMint,
    p_balance_change: isBuy ? amount : -amount,
    p_is_first_purchase: isBuy
  })
}

function detectPlatform(signature: string): string {
  // Placeholder - could analyze transaction to detect DEX
  return 'unknown'
}

async function triggerCopyTrades(transactions: any[], supabase: any) {
  try {
    for (const tx of transactions) {
      const { error } = await supabase.functions.invoke('execute-copy-trade', {
        body: tx
      })
      
      if (error) {
        console.error('Error triggering copy trade:', error)
      } else {
        console.log('Copy trade triggered successfully for transaction:', tx.signature)
      }
    }
  } catch (error) {
    console.error('Error in triggerCopyTrades:', error)
  }
}