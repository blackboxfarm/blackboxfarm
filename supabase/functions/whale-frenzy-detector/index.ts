import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FrenzyConfig {
  user_id: string;
  min_whales_for_frenzy: number;
  time_window_seconds: number;
  auto_buy_enabled: boolean;
  buy_amount_sol: number;
  max_slippage_bps: number;
  cooldown_seconds: number;
}

interface WhaleWallet {
  wallet_address: string;
  nickname?: string;
}

interface WhaleBuy {
  wallet_address: string;
  token_mint: string;
  amount_sol: number;
  timestamp: string;
  signature: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')

  if (!heliusApiKey) {
    return new Response(
      JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json()
    const { action, user_id, wallet_address, token_mint, amount_sol, signature, timestamp } = body

    // Action: Process incoming whale buy (called by wallet-monitor or webhook)
    if (action === 'process_buy') {
      console.log(`Processing whale buy: ${wallet_address} bought ${token_mint}`)
      
      // Get all frenzy configs to check against
      const { data: configs, error: configError } = await supabase
        .from('whale_frenzy_config')
        .select('*')
        .eq('is_active', true)

      if (configError) {
        console.error('Error fetching configs:', configError)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch configs' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const results = []

      for (const config of configs || []) {
        // Check if this wallet is in user's whale list
        const { data: whaleWallet } = await supabase
          .from('whale_wallets')
          .select('*')
          .eq('user_id', config.user_id)
          .eq('wallet_address', wallet_address)
          .eq('is_active', true)
          .single()

        if (!whaleWallet) continue

        // Get recent buys for this token from user's whale list within time window
        const windowStart = new Date(Date.now() - config.time_window_seconds * 1000).toISOString()
        
        const { data: userWhales } = await supabase
          .from('whale_wallets')
          .select('wallet_address')
          .eq('user_id', config.user_id)
          .eq('is_active', true)

        const whaleAddresses = userWhales?.map(w => w.wallet_address) || []

        // Query wallet_transactions for recent buys on this token by these whales
        const { data: recentBuys } = await supabase
          .from('wallet_transactions')
          .select('*')
          .in('monitored_wallet_id', whaleAddresses)
          .eq('token_mint', token_mint)
          .eq('transaction_type', 'buy')
          .gte('timestamp', windowStart)

        const uniqueWhales = new Set(recentBuys?.map(b => b.monitored_wallet_id) || [])
        uniqueWhales.add(wallet_address) // Add current buyer

        console.log(`Token ${token_mint}: ${uniqueWhales.size} whales buying within ${config.time_window_seconds}s`)

        // Check if frenzy threshold met
        if (uniqueWhales.size >= config.min_whales_for_frenzy) {
          // Check cooldown - don't fire for same token too quickly
          const { data: recentFrenzy } = await supabase
            .from('whale_frenzy_events')
            .select('*')
            .eq('user_id', config.user_id)
            .eq('token_mint', token_mint)
            .gte('detected_at', new Date(Date.now() - config.cooldown_seconds * 1000).toISOString())
            .limit(1)

          if (recentFrenzy && recentFrenzy.length > 0) {
            console.log(`Frenzy on cooldown for ${token_mint}`)
            continue
          }

          // FRENZY DETECTED!
          console.log(`🔥 FRENZY DETECTED for user ${config.user_id}: ${uniqueWhales.size} whales on ${token_mint}`)

          const participatingWallets = Array.from(uniqueWhales)
          const timestamps = recentBuys?.map(b => new Date(b.timestamp)) || []
          timestamps.push(new Date(timestamp))
          
          const frenzyEvent: any = {
            user_id: config.user_id,
            token_mint,
            whale_count: uniqueWhales.size,
            participating_wallets: participatingWallets,
            first_buy_at: timestamps.length ? new Date(Math.min(...timestamps.map(t => t.getTime()))).toISOString() : null,
            last_buy_at: new Date().toISOString(),
            auto_buy_executed: false,
          }

          // Execute auto-buy if enabled
          if (config.auto_buy_enabled && config.buy_amount_sol > 0) {
            try {
              // Get user's trading wallet
              const { data: userSecrets } = await supabase
                .from('user_secrets')
                .select('trading_private_key, rpc_url')
                .eq('user_id', config.user_id)
                .single()

              if (userSecrets?.trading_private_key) {
                console.log(`Executing auto-buy: ${config.buy_amount_sol} SOL on ${token_mint}`)
                
                // Call raydium-swap
                const swapResponse = await supabase.functions.invoke('raydium-swap', {
                  body: {
                    action: 'buy',
                    tokenMint: token_mint,
                    amountSol: config.buy_amount_sol,
                    slippageBps: config.max_slippage_bps,
                    privateKey: userSecrets.trading_private_key,
                    rpcUrl: userSecrets.rpc_url
                  }
                })

                if (swapResponse.error) {
                  frenzyEvent.auto_buy_error = swapResponse.error.message
                  console.error('Auto-buy failed:', swapResponse.error)
                } else {
                  frenzyEvent.auto_buy_executed = true
                  frenzyEvent.auto_buy_signature = swapResponse.data?.signature
                  frenzyEvent.auto_buy_amount_sol = config.buy_amount_sol
                  console.log(`Auto-buy successful: ${swapResponse.data?.signature}`)
                }
              } else {
                frenzyEvent.auto_buy_error = 'No trading wallet configured'
              }
            } catch (buyError: any) {
              frenzyEvent.auto_buy_error = buyError.message
              console.error('Auto-buy error:', buyError)
            }
          }

          // Store frenzy event
          const { error: insertError } = await supabase
            .from('whale_frenzy_events')
            .insert(frenzyEvent)

          if (insertError) {
            console.error('Error storing frenzy event:', insertError)
          }

          results.push({
            user_id: config.user_id,
            frenzy_detected: true,
            whale_count: uniqueWhales.size,
            auto_buy_executed: frenzyEvent.auto_buy_executed
          })
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Action: Check for frenzy manually (polling mode)
    if (action === 'check_frenzy') {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: 'user_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get user's config
      const { data: config } = await supabase
        .from('whale_frenzy_config')
        .select('*')
        .eq('user_id', user_id)
        .single()

      if (!config) {
        return new Response(
          JSON.stringify({ error: 'No config found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get user's whale wallets
      const { data: whales } = await supabase
        .from('whale_wallets')
        .select('wallet_address')
        .eq('user_id', user_id)
        .eq('is_active', true)

      const whaleAddresses = whales?.map(w => w.wallet_address) || []

      if (whaleAddresses.length === 0) {
        return new Response(
          JSON.stringify({ frenzies: [], message: 'No whale wallets configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get recent buys within time window
      const windowStart = new Date(Date.now() - config.time_window_seconds * 1000).toISOString()
      
      const { data: recentBuys } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('transaction_type', 'buy')
        .gte('timestamp', windowStart)

      // Filter to only our whale wallets (by checking monitored_wallets)
      const { data: monitoredWallets } = await supabase
        .from('monitored_wallets')
        .select('id, wallet_address')
        .in('wallet_address', whaleAddresses)

      const walletIdToAddress = new Map(monitoredWallets?.map(w => [w.id, w.wallet_address]) || [])
      const relevantBuys = recentBuys?.filter(b => walletIdToAddress.has(b.monitored_wallet_id)) || []

      // Group by token
      const tokenBuys = new Map<string, Set<string>>()
      for (const buy of relevantBuys) {
        const whaleAddr = walletIdToAddress.get(buy.monitored_wallet_id)
        if (!tokenBuys.has(buy.token_mint)) {
          tokenBuys.set(buy.token_mint, new Set())
        }
        tokenBuys.get(buy.token_mint)!.add(whaleAddr!)
      }

      // Find frenzies
      const frenzies = []
      for (const [token, whales] of tokenBuys) {
        if (whales.size >= config.min_whales_for_frenzy) {
          frenzies.push({
            token_mint: token,
            whale_count: whales.size,
            participating_wallets: Array.from(whales)
          })
        }
      }

      return new Response(
        JSON.stringify({ frenzies, config }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Frenzy detector error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})