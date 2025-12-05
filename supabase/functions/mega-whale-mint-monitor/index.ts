import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// pump.fun program ID
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

// Default max mint age: 5 minutes
const DEFAULT_MAX_MINT_AGE_SECONDS = 300

interface TokenMint {
  tokenMint: string
  tokenSymbol?: string
  tokenName?: string
  signature: string
  timestamp: number
  ageSeconds: number
}

async function checkWalletForMints(
  walletAddress: string,
  heliusApiKey: string,
  maxMintAgeSeconds: number = DEFAULT_MAX_MINT_AGE_SECONDS
): Promise<TokenMint | null> {
  try {
    const now = Math.floor(Date.now() / 1000)
    
    // Get recent transactions for this wallet
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=10`,
      { method: 'GET' }
    )

    if (!response.ok) {
      console.error(`Helius API error for ${walletAddress}: ${response.status}`)
      return null
    }

    const transactions = await response.json()

    // Look for pump.fun token creation transactions
    for (const tx of transactions) {
      const txTimestamp = tx.timestamp
      const ageSeconds = now - txTimestamp
      
      // CRITICAL: Skip if transaction is older than max mint age
      if (ageSeconds > maxMintAgeSeconds) {
        console.log(`Skipping tx ${tx.signature?.slice(0,8)}... - age ${ageSeconds}s > max ${maxMintAgeSeconds}s`)
        continue
      }

      // Check if this transaction involves the pump.fun program
      const instructions = tx.instructions || []
      const isPumpFunTx = instructions.some((ix: any) => 
        ix.programId === PUMP_PROGRAM_ID
      )

      if (!isPumpFunTx) continue

      // Look for token creation (CREATE instruction on pump.fun)
      // The token mint will be in the accountData or tokenTransfers
      const tokenTransfers = tx.tokenTransfers || []
      
      // If the wallet is the fee payer and received tokens, it likely created the token
      if (tx.feePayer === walletAddress) {
        // Check for new token mints in the transaction
        for (const transfer of tokenTransfers) {
          // Creator typically receives initial tokens
          if (transfer.toUserAccount === walletAddress && transfer.mint) {
            // Verify this is a create instruction (has 'create' in data or many accounts)
            const createInstruction = instructions.find((ix: any) => 
              ix.programId === PUMP_PROGRAM_ID && 
              (ix.data?.includes('create') || ix.accounts?.length > 5)
            )

            if (createInstruction) {
              console.log(`✅ Found FRESH mint: ${transfer.mint} by ${walletAddress} (age: ${ageSeconds}s)`)
              return {
                tokenMint: transfer.mint,
                tokenSymbol: transfer.tokenStandard || undefined,
                signature: tx.signature,
                timestamp: tx.timestamp,
                ageSeconds,
              }
            }
          }
        }

        // Alternative detection: look for token account creation
        const accountData = tx.accountData || []
        for (const account of accountData) {
          if (account.tokenBalanceChanges && account.tokenBalanceChanges.length > 0) {
            for (const change of account.tokenBalanceChanges) {
              if (change.userAccount === walletAddress && change.rawTokenAmount?.tokenAmount) {
                // This wallet received tokens in a pump.fun tx - likely a mint
                console.log(`✅ Found FRESH mint (alt): ${change.mint} by ${walletAddress} (age: ${ageSeconds}s)`)
                return {
                  tokenMint: change.mint,
                  signature: tx.signature,
                  timestamp: tx.timestamp,
                  ageSeconds,
                }
              }
            }
          }
        }
      }
    }

    return null
  } catch (error) {
    console.error(`Error checking wallet ${walletAddress}:`, error)
    return null
  }
}

async function fetchTokenMetadata(
  tokenMint: string,
  heliusApiKey: string
): Promise<{ symbol?: string; name?: string; image?: string }> {
  try {
    const response = await fetch(`https://api.helius.xyz/v0/tokens/metadata?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [tokenMint] }),
    })

    if (!response.ok) return {}

    const data = await response.json()
    const token = data?.[0]
    
    return {
      symbol: token?.symbol,
      name: token?.name,
      image: token?.image,
    }
  } catch {
    return {}
  }
}

async function logDecision(
  supabase: any,
  params: {
    user_id?: string
    mega_whale_id?: string
    offspring_wallet?: string
    token_mint?: string
    token_symbol?: string
    decision: string
    reason?: string
    details?: any
    sol_amount?: number
    launcher_score?: number
  }
) {
  try {
    await supabase.from('mega_whale_decision_log').insert({
      user_id: params.user_id,
      mega_whale_id: params.mega_whale_id,
      offspring_wallet: params.offspring_wallet,
      token_mint: params.token_mint,
      token_symbol: params.token_symbol,
      decision: params.decision,
      reason: params.reason,
      details: params.details || {},
      sol_amount: params.sol_amount,
      launcher_score: params.launcher_score,
    })
  } catch (e) {
    console.log('Decision log insert failed (table may not exist yet):', e)
  }
}

async function sendTelegramNotification(
  supabase: any,
  userId: string,
  message: string
) {
  try {
    const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!telegramBotToken) return

    // Get user's telegram config
    const { data: config } = await supabase
      .from('mega_whale_alert_config')
      .select('telegram_chat_id, additional_telegram_ids, notify_telegram')
      .eq('user_id', userId)
      .single()

    if (!config?.notify_telegram) return

    const chatIds: string[] = []
    if (config.telegram_chat_id) chatIds.push(config.telegram_chat_id)
    if (config.additional_telegram_ids?.length) {
      chatIds.push(...config.additional_telegram_ids)
    }

    for (const chatId of chatIds) {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown'
        })
      })
    }
  } catch (e) {
    console.error('Telegram notification error:', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')

    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { action, mega_whale_id, batch_size = 20 } = await req.json()

    console.log(`[MINT-MONITOR] Action: ${action}`)

    if (action === 'scan_monitored') {
      // Get all monitored wallets that haven't minted yet
      let query = supabase
        .from('mega_whale_offspring')
        .select('*, mega_whales(id, wallet_address, label, user_id)')
        .eq('is_monitored', true)
        .eq('has_minted', false)
        .order('launcher_score', { ascending: false })
        .limit(batch_size)

      if (mega_whale_id) {
        query = query.eq('mega_whale_id', mega_whale_id)
      }

      const { data: monitoredWallets, error } = await query

      if (error) throw error

      console.log(`[MINT-MONITOR] Checking ${monitoredWallets?.length || 0} monitored wallets`)

      const mintsDetected: any[] = []
      const mintsRejected: any[] = []

      for (const wallet of monitoredWallets || []) {
        // Get user's max mint age config
        let maxMintAgeSeconds = DEFAULT_MAX_MINT_AGE_SECONDS
        if (wallet.mega_whales?.user_id) {
          const { data: config } = await supabase
            .from('mega_whale_auto_buy_config')
            .select('max_mint_age_seconds')
            .eq('user_id', wallet.mega_whales.user_id)
            .single()
          if (config?.max_mint_age_seconds) {
            maxMintAgeSeconds = config.max_mint_age_seconds
          }
        }

        // Check for FRESH mints only
        const mint = await checkWalletForMints(
          wallet.wallet_address,
          heliusApiKey,
          maxMintAgeSeconds
        )

        if (mint) {
          console.log(`🎉 FRESH MINT DETECTED: ${mint.tokenMint} by ${wallet.wallet_address} (age: ${mint.ageSeconds}s)`)

          // Fetch token metadata
          const metadata = await fetchTokenMetadata(mint.tokenMint, heliusApiKey)

          // Build funding chain
          const fundingChain = wallet.funding_chain || [wallet.mega_whales?.wallet_address]

          // Create mint alert
          const { data: alert, error: alertError } = await supabase
            .from('mega_whale_mint_alerts')
            .insert({
              offspring_id: wallet.id,
              mega_whale_id: wallet.mega_whale_id,
              minter_wallet: wallet.wallet_address,
              token_mint: mint.tokenMint,
              token_symbol: metadata.symbol || mint.tokenSymbol,
              token_name: metadata.name,
              launcher_score: wallet.launcher_score,
              funding_chain: fundingChain,
              detected_at: new Date(mint.timestamp * 1000).toISOString(),
            })
            .select()
            .single()

          if (alertError) {
            console.error('Error creating mint alert:', alertError)
          } else {
            mintsDetected.push(alert)
          }

          // Log the detection
          await logDecision(supabase, {
            user_id: wallet.mega_whales?.user_id,
            mega_whale_id: wallet.mega_whale_id,
            offspring_wallet: wallet.wallet_address,
            token_mint: mint.tokenMint,
            token_symbol: metadata.symbol,
            decision: 'mint_detected',
            reason: `Fresh mint detected (age: ${mint.ageSeconds}s)`,
            details: { 
              signature: mint.signature, 
              age_seconds: mint.ageSeconds,
              metadata 
            },
            launcher_score: wallet.launcher_score,
          })

          // Send Telegram notification
          if (wallet.mega_whales?.user_id) {
            await sendTelegramNotification(
              supabase,
              wallet.mega_whales.user_id,
              `🆕 *NEW MINT DETECTED*\n\n` +
              `Token: \`${metadata.symbol || 'Unknown'}\`\n` +
              `Mint: \`${mint.tokenMint}\`\n` +
              `Minter: \`${wallet.wallet_address.slice(0,8)}...\`\n` +
              `Whale: ${wallet.mega_whales.label || 'Unknown'}\n` +
              `Score: ${wallet.launcher_score || 0}\n` +
              `Age: ${mint.ageSeconds}s`
            )
          }

          // Mark offspring as minted
          await supabase
            .from('mega_whale_offspring')
            .update({
              has_minted: true,
              minted_token: mint.tokenMint,
              is_monitored: false,
            })
            .eq('id', wallet.id)

          // Trigger auto-buy if configured
          if (wallet.mega_whales?.user_id) {
            await supabase.functions.invoke('mega-whale-auto-buyer', {
              body: {
                action: 'execute_buy',
                user_id: wallet.mega_whales.user_id,
                alert_id: alert?.id,
                token_mint: mint.tokenMint,
                token_symbol: metadata.symbol,
                launcher_score: wallet.launcher_score,
              },
            })
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return new Response(
        JSON.stringify({
          success: true,
          walletsChecked: monitoredWallets?.length || 0,
          mintsDetected: mintsDetected.length,
          mintsRejected: mintsRejected.length,
          mints: mintsDetected,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_alerts') {
      // Get recent mint alerts
      let query = supabase
        .from('mega_whale_mint_alerts')
        .select('*, mega_whales(wallet_address, label)')
        .order('detected_at', { ascending: false })
        .limit(50)

      if (mega_whale_id) {
        query = query.eq('mega_whale_id', mega_whale_id)
      }

      const { data, error } = await query

      if (error) throw error

      return new Response(
        JSON.stringify({
          success: true,
          count: data?.length || 0,
          alerts: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_decision_log') {
      // Get decision history
      const { user_id, limit = 100 } = await req.json()
      
      const { data, error } = await supabase
        .from('mega_whale_decision_log')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      return new Response(
        JSON.stringify({
          success: true,
          count: data?.length || 0,
          decisions: data,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: scan_monitored, get_alerts, get_decision_log' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Mint monitor error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})