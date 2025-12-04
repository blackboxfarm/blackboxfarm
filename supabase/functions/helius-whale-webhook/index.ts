import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  feePayer: string;
  tokenTransfers?: Array<{
    mint: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    tokenStandard?: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: Array<{
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
      userAccount: string;
    }>;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Parse incoming webhook from Helius
    const transactions: HeliusTransaction[] = await req.json()
    console.log(`Received ${transactions.length} transactions from Helius webhook`)

    // Get all active whale wallets
    const { data: whaleWallets, error: walletsError } = await supabase
      .from('whale_wallets')
      .select('wallet_address, nickname, user_id, twitter_handle')
      .eq('is_active', true)

    if (walletsError) {
      console.error('Error fetching whale wallets:', walletsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch wallets' }), { 
        status: 500, 
        headers: corsHeaders 
      })
    }

    const whaleAddresses = new Set(whaleWallets?.map(w => w.wallet_address) || [])
    const whaleMap = new Map(whaleWallets?.map(w => [w.wallet_address, w]) || [])

    // Process each transaction to find whale buys
    const whaleBuys: Array<{
      wallet_address: string;
      nickname: string | null;
      twitter_handle: string | null;
      token_mint: string;
      amount: number;
      timestamp: number;
      signature: string;
      user_id: string;
    }> = []

    for (const tx of transactions) {
      // Check if fee payer is a whale (they initiated the tx)
      if (!whaleAddresses.has(tx.feePayer)) continue

      const whale = whaleMap.get(tx.feePayer)
      if (!whale) continue

      // Look for token purchases (token transfers TO the whale)
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        for (const transfer of tx.tokenTransfers) {
          // Whale received tokens (likely a buy)
          if (transfer.toUserAccount === tx.feePayer && transfer.tokenAmount > 0) {
            console.log(`Whale ${whale.nickname || tx.feePayer} bought token ${transfer.mint}`)
            
            whaleBuys.push({
              wallet_address: tx.feePayer,
              nickname: whale.nickname,
              twitter_handle: whale.twitter_handle,
              token_mint: transfer.mint,
              amount: transfer.tokenAmount,
              timestamp: tx.timestamp,
              signature: tx.signature,
              user_id: whale.user_id
            })
          }
        }
      }
    }

    if (whaleBuys.length === 0) {
      console.log('No whale buys detected in this batch')
      return new Response(JSON.stringify({ processed: transactions.length, whaleBuys: 0 }), {
        headers: corsHeaders
      })
    }

    console.log(`Detected ${whaleBuys.length} whale buys, checking for frenzies...`)

    // Group buys by token to detect frenzies
    const buysByToken = new Map<string, typeof whaleBuys>()
    for (const buy of whaleBuys) {
      const existing = buysByToken.get(buy.token_mint) || []
      existing.push(buy)
      buysByToken.set(buy.token_mint, existing)
    }

    // Get frenzy configs for users
    const userIds = [...new Set(whaleBuys.map(b => b.user_id))]
    const { data: configs } = await supabase
      .from('whale_frenzy_config')
      .select('*')
      .in('user_id', userIds)
      .eq('is_active', true)

    const configMap = new Map(configs?.map(c => [c.user_id, c]) || [])

    // Check each token for frenzy conditions
    for (const [tokenMint, buys] of buysByToken) {
      // Get unique whales for this token
      const uniqueWhales = [...new Set(buys.map(b => b.wallet_address))]
      
      // Check each user's config
      for (const userId of userIds) {
        const config = configMap.get(userId)
        if (!config) continue

        const minWhales = config.min_whales_for_frenzy || 3
        const timeWindow = (config.time_window_seconds || 120) * 1000

        // Filter buys within time window
        const now = Date.now()
        const recentBuys = buys.filter(b => (now - b.timestamp * 1000) < timeWindow)
        const recentWhales = [...new Set(recentBuys.map(b => b.wallet_address))]

        if (recentWhales.length >= minWhales) {
          console.log(`🚨 FRENZY DETECTED! ${recentWhales.length} whales bought ${tokenMint}`)

          // Check cooldown
          const { data: recentFrenzy } = await supabase
            .from('whale_frenzy_events')
            .select('id')
            .eq('user_id', userId)
            .eq('token_mint', tokenMint)
            .gte('detected_at', new Date(now - (config.cooldown_seconds || 300) * 1000).toISOString())
            .limit(1)

          if (recentFrenzy && recentFrenzy.length > 0) {
            console.log('Frenzy already detected recently, skipping...')
            continue
          }

          // Get token metadata
          let tokenSymbol = null
          let tokenName = null
          let entryPrice = null
          
          try {
            const jupiterResponse = await fetch(`https://price.jup.ag/v6/price?ids=${tokenMint}`)
            if (jupiterResponse.ok) {
              const priceData = await jupiterResponse.json()
              if (priceData.data?.[tokenMint]) {
                entryPrice = priceData.data[tokenMint].price
              }
            }
          } catch (e) {
            console.error('Error fetching price:', e)
          }

          // Build buy timeline
          const buyTimeline = recentBuys.map(b => ({
            wallet: b.wallet_address,
            nickname: b.nickname,
            twitter: b.twitter_handle,
            amount: b.amount,
            timestamp: new Date(b.timestamp * 1000).toISOString(),
            signature: b.signature
          }))

          // Create frenzy event
          const { data: frenzyEvent, error: frenzyError } = await supabase
            .from('whale_frenzy_events')
            .insert({
              user_id: userId,
              token_mint: tokenMint,
              token_symbol: tokenSymbol,
              token_name: tokenName,
              whale_count: recentWhales.length,
              participating_wallets: recentWhales.map(w => ({
                address: w,
                nickname: whaleMap.get(w)?.nickname,
                twitter: whaleMap.get(w)?.twitter_handle
              })),
              buy_timeline: buyTimeline,
              entry_token_price: entryPrice,
              auto_buy_executed: false
            })
            .select()
            .single()

          if (frenzyError) {
            console.error('Error creating frenzy event:', frenzyError)
            continue
          }

          console.log(`Created frenzy event: ${frenzyEvent.id}`)

          // Handle auto-buy or fantasy mode
          if (config.fantasy_mode) {
            // Create fantasy trade
            const { error: fantasyError } = await supabase
              .from('fantasy_trades')
              .insert({
                user_id: userId,
                frenzy_event_id: frenzyEvent.id,
                token_mint: tokenMint,
                entry_price_sol: entryPrice,
                amount_sol: config.fantasy_buy_amount || 0.1,
                status: 'open'
              })

            if (fantasyError) {
              console.error('Error creating fantasy trade:', fantasyError)
            } else {
              console.log('Fantasy trade created')
            }
          } else if (config.auto_buy_enabled) {
            // Real auto-buy via raydium-swap
            console.log('Auto-buy enabled, executing trade...')
            // TODO: Implement real auto-buy
          }
        }
      }
    }

    return new Response(JSON.stringify({ 
      processed: transactions.length, 
      whaleBuys: whaleBuys.length 
    }), { headers: corsHeaders })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})
