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

// KILL SWITCH - Set to true to disable all processing
const WEBHOOK_DISABLED = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Early exit if disabled
  if (WEBHOOK_DISABLED) {
    return new Response(JSON.stringify({ status: 'disabled', message: 'Webhook processing is currently disabled' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
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

    // Get avatar URLs from wallet_metadata
    const walletAddresses = whaleWallets?.map(w => w.wallet_address) || []
    const { data: walletMetadata } = await supabase
      .from('wallet_metadata')
      .select('wallet_address, avatar_url, twitter_handle')
      .in('wallet_address', walletAddresses)
    
    const avatarMap = new Map(walletMetadata?.map(m => [m.wallet_address, m.avatar_url]) || [])

    const whaleAddresses = new Set(walletAddresses)
    const whaleMap = new Map(whaleWallets?.map(w => [w.wallet_address, { ...w, avatar_url: avatarMap.get(w.wallet_address) }]) || [])

    // Process each transaction to find whale buys
    const whaleBuys: Array<{
      wallet_address: string;
      nickname: string | null;
      twitter_handle: string | null;
      avatar_url: string | null;
      token_mint: string;
      token_amount: number;
      sol_amount: number;
      price_per_token: number;
      timestamp: number;
      signature: string;
      user_id: string;
    }> = []

    for (const tx of transactions) {
      // Check if fee payer is a whale (they initiated the tx)
      if (!whaleAddresses.has(tx.feePayer)) continue

      const whale = whaleMap.get(tx.feePayer)
      if (!whale) continue

      // Calculate SOL spent from native transfers (whale sending SOL = buy)
      let solSpent = 0
      if (tx.nativeTransfers) {
        for (const transfer of tx.nativeTransfers) {
          if (transfer.fromUserAccount === tx.feePayer) {
            solSpent += transfer.amount / 1e9 // Convert lamports to SOL
          }
        }
      }

      // Look for token purchases (token transfers TO the whale)
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        for (const transfer of tx.tokenTransfers) {
          // Whale received tokens (likely a buy)
          if (transfer.toUserAccount === tx.feePayer && transfer.tokenAmount > 0) {
            // Skip SOL and common stables
            const skipMints = [
              'So11111111111111111111111111111111111111112', // SOL
              'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
              'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
              'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'  // USD1
            ]
            if (skipMints.includes(transfer.mint)) continue

            // Calculate price per token
            const pricePerToken = solSpent > 0 && transfer.tokenAmount > 0 
              ? solSpent / transfer.tokenAmount 
              : 0

            console.log(`🐋 Whale ${whale.nickname || tx.feePayer.slice(0, 8)} bought ${transfer.tokenAmount} tokens for ${solSpent.toFixed(4)} SOL`)
            
            whaleBuys.push({
              wallet_address: tx.feePayer,
              nickname: whale.nickname,
              twitter_handle: whale.twitter_handle,
              avatar_url: whale.avatar_url || null,
              token_mint: transfer.mint,
              token_amount: transfer.tokenAmount,
              sol_amount: solSpent,
              price_per_token: pricePerToken,
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

    console.log(`Detected ${whaleBuys.length} whale buys, recording events...`)

    // Get unique user IDs
    const userIds = [...new Set(whaleBuys.map(b => b.user_id))]

    // Get frenzy configs for users
    const { data: configs } = await supabase
      .from('whale_frenzy_config')
      .select('*')
      .in('user_id', userIds)
      .eq('is_active', true)

    const configMap = new Map(configs?.map(c => [c.user_id, c]) || [])

    // Fetch token metadata for symbols and images
    const uniqueTokens = [...new Set(whaleBuys.map(b => b.token_mint))]
    const tokenMetadata = new Map<string, { symbol?: string; image?: string }>()
    
    for (const mint of uniqueTokens) {
      try {
        // Try to get from our cache first
        const { data: cached } = await supabase
          .from('token_metadata')
          .select('symbol, image_uri')
          .eq('mint_address', mint)
          .single()
        
        if (cached) {
          tokenMetadata.set(mint, { symbol: cached.symbol, image: cached.image_uri })
        } else {
          // Fetch from Helius DAS API
          const heliusKey = Deno.env.get('HELIUS_API_KEY')
          if (heliusKey) {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'token-metadata',
                method: 'getAsset',
                params: { id: mint }
              })
            })
            const result = await response.json()
            if (result.result?.content?.metadata) {
              const meta = result.result.content
              tokenMetadata.set(mint, { 
                symbol: meta.metadata?.symbol, 
                image: meta.links?.image || meta.files?.[0]?.uri 
              })
            }
          }
        }
      } catch (e) {
        console.log(`Could not fetch metadata for ${mint.slice(0, 8)}:`, e)
      }
    }

    // Store EACH whale buy as an event (whale_count = 1)
    for (const buy of whaleBuys) {
      const config = configMap.get(buy.user_id)
      if (!config) continue

      const meta = tokenMetadata.get(buy.token_mint) || {}

      // Create whale buy event
      const { error: eventError } = await supabase
        .from('whale_frenzy_events')
        .insert({
          user_id: buy.user_id,
          token_mint: buy.token_mint,
          token_symbol: meta.symbol || null,
          token_image: meta.image || null,
          whale_count: 1,
          participating_wallets: [{
            address: buy.wallet_address,
            nickname: buy.nickname,
            twitter: buy.twitter_handle,
            avatar_url: buy.avatar_url,
            sol_amount: buy.sol_amount,
            token_amount: buy.token_amount,
            price_per_token: buy.price_per_token
          }],
          buy_timeline: [{
            wallet: buy.wallet_address,
            nickname: buy.nickname,
            twitter: buy.twitter_handle,
            avatar_url: buy.avatar_url,
            sol_amount: buy.sol_amount,
            token_amount: buy.token_amount,
            price_per_token: buy.price_per_token,
            timestamp: new Date(buy.timestamp * 1000).toISOString(),
            signature: buy.signature
          }],
          auto_buy_executed: false
        })

      if (eventError) {
        console.error('Error creating whale buy event:', eventError)
      } else {
        console.log(`📝 Recorded whale buy: ${buy.nickname || buy.wallet_address.slice(0, 8)} -> ${meta.symbol || buy.token_mint.slice(0, 8)}`)
      }
    }

    // Group buys by token to detect frenzies
    const buysByToken = new Map<string, typeof whaleBuys>()
    for (const buy of whaleBuys) {
      const existing = buysByToken.get(buy.token_mint) || []
      existing.push(buy)
      buysByToken.set(buy.token_mint, existing)
    }

    // Check each token for frenzy conditions
    for (const [tokenMint, buys] of buysByToken) {
      // Check each user's config
      for (const userId of userIds) {
        const config = configMap.get(userId)
        if (!config) continue

        const minWhales = config.min_whales_for_frenzy || 3
        const timeWindow = (config.time_window_seconds || 120) * 1000

        // Get recent buys from database for this token within time window
        const windowStart = new Date(Date.now() - timeWindow).toISOString()
        
        const { data: recentEvents } = await supabase
          .from('whale_frenzy_events')
          .select('participating_wallets')
          .eq('user_id', userId)
          .eq('token_mint', tokenMint)
          .eq('whale_count', 1) // Only individual buys
          .gte('detected_at', windowStart)

        // Get unique whales from recent events
        const recentWhales = new Set<string>()
        for (const event of recentEvents || []) {
          const wallets = event.participating_wallets as any[]
          for (const w of wallets || []) {
            if (w.address) recentWhales.add(w.address)
          }
        }

        if (recentWhales.size >= minWhales) {
          console.log(`🚨 FRENZY DETECTED! ${recentWhales.size} whales bought ${tokenMint.slice(0, 8)}`)

          // Check cooldown for frenzy events specifically (whale_count > 1)
          const { data: recentFrenzy } = await supabase
            .from('whale_frenzy_events')
            .select('id')
            .eq('user_id', userId)
            .eq('token_mint', tokenMint)
            .gt('whale_count', 1) // Only actual frenzies
            .gte('detected_at', new Date(Date.now() - (config.cooldown_seconds || 300) * 1000).toISOString())
            .limit(1)

          if (recentFrenzy && recentFrenzy.length > 0) {
            console.log('Frenzy already detected recently, skipping...')
            continue
          }

          // Get token price
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

          // Build whale list with details
          const whaleDetails = [...recentWhales].map(addr => ({
            address: addr,
            nickname: whaleMap.get(addr)?.nickname || null,
            twitter: whaleMap.get(addr)?.twitter_handle || null,
            avatar_url: whaleMap.get(addr)?.avatar_url || null
          }))

          // Create FRENZY event (whale_count > 1)
          const { data: frenzyEvent, error: frenzyError } = await supabase
            .from('whale_frenzy_events')
            .insert({
              user_id: userId,
              token_mint: tokenMint,
              whale_count: recentWhales.size,
              participating_wallets: whaleDetails,
              buy_timeline: [], // Could populate from recent events if needed
              entry_token_price: entryPrice,
              auto_buy_executed: false
            })
            .select()
            .single()

          if (frenzyError) {
            console.error('Error creating frenzy event:', frenzyError)
            continue
          }

          console.log(`✅ Created frenzy event: ${frenzyEvent.id}`)

          // Handle auto-buy or fantasy mode
          if (config.fantasy_mode) {
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
              console.log('💰 Fantasy trade created')
            }
          } else if (config.auto_buy_enabled) {
            console.log('Auto-buy enabled, executing trade...')
            // TODO: Implement real auto-buy via raydium-swap
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
