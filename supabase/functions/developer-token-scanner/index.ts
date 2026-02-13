import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('developer-token-scanner');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id })
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { developerId, lookbackDays = 365 } = await req.json()

    if (!developerId) {
      return new Response(JSON.stringify({ error: 'developerId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Scanning tokens for developer ${developerId}, lookback: ${lookbackDays} days`)

    // Get all wallets for this developer
    const { data: wallets, error: walletsError } = await supabase
      .from('developer_wallets')
      .select('wallet_address')
      .eq('developer_id', developerId)

    if (walletsError) {
      throw walletsError
    }

    if (!wallets || wallets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, tokensFound: 0, message: 'No wallets found for this developer' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${wallets.length} wallets to scan`)

    const tokensFound: any[] = []
    const lookbackTimestamp = Date.now() / 1000 - (lookbackDays * 24 * 60 * 60)

    // Scan each wallet for token creation transactions
    for (const { wallet_address } of wallets) {
      try {
        // Fetch transactions from Helius
        const response = await fetch(
          `https://api.helius.xyz/v0/addresses/${wallet_address}/transactions?api-key=${heliusApiKey}`,
          { method: 'GET' }
        )

        if (!response.ok) {
          console.error(`Helius API error for ${wallet_address}: ${response.status}`)
          continue
        }

        const transactions = await response.json()

        // Filter for token creation transactions (InitializeMint instruction)
        const mintTransactions = transactions.filter((tx: any) => {
          if (tx.timestamp < lookbackTimestamp) return false
          
          const instructions = tx.instructions || []
          return instructions.some((inst: any) => 
            inst.programId === 'TokenkgQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' &&
            inst.parsed?.type === 'initializeMint'
          )
        })

        console.log(`Found ${mintTransactions.length} mint transactions for ${wallet_address}`)

        // Process each mint transaction
        for (const tx of mintTransactions) {
          const instructions = tx.instructions || []
          const initMintInst = instructions.find((inst: any) => 
            inst.parsed?.type === 'initializeMint'
          )

          if (initMintInst?.parsed?.info?.mint) {
            const tokenMint = initMintInst.parsed.info.mint
            const launchDate = new Date(tx.timestamp * 1000)

            // Check if token already exists
            const { data: existingToken } = await supabase
              .from('developer_tokens')
              .select('id')
              .eq('developer_id', developerId)
              .eq('token_mint', tokenMint)
              .single()

            if (existingToken) {
              console.log(`Token ${tokenMint} already tracked, skipping`)
              continue
            }

            // Fetch token metadata
            let tokenName = null
            let tokenSymbol = null
            try {
              const metadataResponse = await fetch(
                `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mintAccounts: [tokenMint] }),
                }
              )
              
              if (metadataResponse.ok) {
                const metadata = await metadataResponse.json()
                if (metadata[0]) {
                  tokenName = metadata[0].onChainMetadata?.metadata?.data?.name
                  tokenSymbol = metadata[0].onChainMetadata?.metadata?.data?.symbol
                }
              }
            } catch (error) {
              console.error(`Error fetching metadata for ${tokenMint}:`, error)
            }

            // Get funding wallet (who funded this creator wallet)
            const { data: fundingTrace } = await supabase
              .from('wallet_funding_traces')
              .select('from_wallet')
              .eq('to_wallet', wallet_address)
              .order('timestamp', { ascending: false })
              .limit(1)
              .single()

            // Insert token record
            const { error: insertError } = await supabase
              .from('developer_tokens')
              .insert({
                developer_id: developerId,
                token_mint: tokenMint,
                creator_wallet: wallet_address,
                funding_wallet: fundingTrace?.from_wallet,
                launch_date: launchDate,
                is_active: true,
                outcome: 'active',
              })

            if (!insertError) {
              tokensFound.push({
                tokenMint,
                creatorWallet: wallet_address,
                launchDate,
              })
            } else {
              console.error(`Error inserting token ${tokenMint}:`, insertError)
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning wallet ${wallet_address}:`, error)
      }
    }

    // Update developer profile statistics
    const { data: tokenCount } = await supabase
      .from('developer_tokens')
      .select('id', { count: 'exact' })
      .eq('developer_id', developerId)

    await supabase
      .from('developer_profiles')
      .update({
        total_tokens_created: tokenCount?.length || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', developerId)

    console.log(`Token scan complete. Found ${tokensFound.length} new tokens`)

    return new Response(
      JSON.stringify({
        success: true,
        tokensFound: tokensFound.length,
        tokens: tokensFound,
        totalWalletsScanned: wallets.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in developer-token-scanner:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
