import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// pump.fun program ID
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

interface TokenMint {
  tokenMint: string
  tokenSymbol?: string
  tokenName?: string
  signature: string
  timestamp: number
}

async function checkWalletForMints(
  walletAddress: string,
  heliusApiKey: string,
  lastCheckedTime?: string
): Promise<TokenMint | null> {
  try {
    // Get recent transactions for this wallet
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=20`,
      { method: 'GET' }
    )

    if (!response.ok) {
      console.error(`Helius API error for ${walletAddress}: ${response.status}`)
      return null
    }

    const transactions = await response.json()

    // Look for pump.fun token creation transactions
    for (const tx of transactions) {
      // Skip if we've already checked this transaction
      if (lastCheckedTime && new Date(tx.timestamp * 1000) <= new Date(lastCheckedTime)) {
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
      
      // If the wallet received 0 tokens and is the fee payer, it likely created the token
      if (tx.feePayer === walletAddress) {
        // Check for new token mints in the transaction
        for (const transfer of tokenTransfers) {
          // Creator typically receives initial tokens
          if (transfer.toUserAccount === walletAddress && transfer.mint) {
            // Verify this is a new token by checking if it's a create instruction
            const createInstruction = instructions.find((ix: any) => 
              ix.programId === PUMP_PROGRAM_ID && 
              (ix.data?.includes('create') || ix.accounts?.length > 5)
            )

            if (createInstruction) {
              console.log(`Found mint: ${transfer.mint} by ${walletAddress}`)
              return {
                tokenMint: transfer.mint,
                tokenSymbol: transfer.tokenStandard || undefined,
                signature: tx.signature,
                timestamp: tx.timestamp,
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
                return {
                  tokenMint: change.mint,
                  signature: tx.signature,
                  timestamp: tx.timestamp,
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

    console.log(`Mint monitor action: ${action}`)

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

      console.log(`Checking ${monitoredWallets?.length || 0} monitored wallets for mints`)

      const mintsDetected: any[] = []

      for (const wallet of monitoredWallets || []) {
        // Check for mints
        const mint = await checkWalletForMints(
          wallet.wallet_address,
          heliusApiKey,
          wallet.last_scored_at
        )

        if (mint) {
          console.log(`🎉 MINT DETECTED: ${mint.tokenMint} by ${wallet.wallet_address}`)

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

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: scan_monitored, get_alerts' }),
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
