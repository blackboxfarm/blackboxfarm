import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Connection, PublicKey } from 'https://esm.sh/@solana/web3.js@1.98.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WatchdogEntry {
  token_mint: string
  creator_wallet: string
  transaction_signature: string
  block_time: Date
  metadata?: any
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
    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`)

    console.log('🔍 Token Mint Watchdog: Starting monitoring cycle...')

    // Get the last processed signature to avoid duplicates
    const { data: lastEntry } = await supabase
      .from('token_mint_watchdog')
      .select('transaction_signature, block_time')
      .order('block_time', { ascending: false })
      .limit(1)
      .single()

    const lookbackTime = lastEntry?.block_time 
      ? new Date(lastEntry.block_time).getTime() / 1000
      : (Date.now() / 1000) - (60 * 60) // Default: last 1 hour

    console.log(`Looking for new mints since: ${new Date(lookbackTime * 1000).toISOString()}`)

    // Monitor multiple known launchpad programs
    const launchpadPrograms = [
      'TokenkgQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
    ]

    const newMints: WatchdogEntry[] = []
    const seenSignatures = new Set<string>()

    // Scan recent blocks for InitializeMint instructions
    const slot = await connection.getSlot()
    const block = await connection.getBlock(slot, { 
      maxSupportedTransactionVersion: 0,
      transactionDetails: 'full'
    })

    if (block) {
      console.log(`Scanning block ${slot} with ${block.transactions.length} transactions`)

      for (const tx of block.transactions) {
        const signature = tx.transaction.signatures[0]
        
        if (seenSignatures.has(signature)) continue
        seenSignatures.add(signature)

        // Check if transaction is recent enough
        if (block.blockTime && block.blockTime < lookbackTime) continue

        // Parse transaction for InitializeMint instructions
        const accountKeys = tx.transaction.message.staticAccountKeys || []
        const instructions = tx.transaction.message.compiledInstructions || []

        for (const instruction of instructions) {
          const programId = accountKeys[instruction.programIdIndex]?.toBase58()
          
          if (programId === 'TokenkgQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            // This is a token program instruction
            // The first account is typically the mint account
            const mintAccount = instruction.accountKeyIndexes?.[0]
            if (mintAccount !== undefined && accountKeys[mintAccount]) {
              const tokenMint = accountKeys[mintAccount].toBase58()
              
              // Get the transaction authority (payer/creator)
              const creatorWallet = accountKeys[0]?.toBase58() // First signer is usually the creator

              if (tokenMint && creatorWallet && block.blockTime) {
                console.log(`Found potential new mint: ${tokenMint} by ${creatorWallet}`)
                
                newMints.push({
                  token_mint: tokenMint,
                  creator_wallet: creatorWallet,
                  transaction_signature: signature,
                  block_time: new Date(block.blockTime * 1000),
                })
              }
            }
          }
        }
      }
    }

    console.log(`Found ${newMints.length} new potential token mints`)

    // Process each new mint
    const discoveryJobsTriggered: string[] = []

    for (const mint of newMints) {
      // Check if this mint is already in watchdog
      const { data: existing } = await supabase
        .from('token_mint_watchdog')
        .select('id')
        .eq('token_mint', mint.token_mint)
        .single()

      if (existing) {
        console.log(`Mint ${mint.token_mint} already in watchdog, skipping`)
        continue
      }

      // Fetch token metadata
      let metadata = null
      try {
        const metadataResponse = await fetch(
          `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mintAccounts: [mint.token_mint] }),
          }
        )
        
        if (metadataResponse.ok) {
          const metadataData = await metadataResponse.json()
          metadata = metadataData[0]
        }
      } catch (error) {
        console.error(`Error fetching metadata for ${mint.token_mint}:`, error)
      }

      // Insert into watchdog table
      const { error: insertError } = await supabase
        .from('token_mint_watchdog')
        .insert({
          token_mint: mint.token_mint,
          creator_wallet: mint.creator_wallet,
          transaction_signature: mint.transaction_signature,
          block_time: mint.block_time,
          metadata: metadata,
          discovery_triggered: false,
        })

      if (insertError) {
        console.error(`Error inserting mint ${mint.token_mint}:`, insertError)
        continue
      }

      console.log(`✅ Added ${mint.token_mint} to watchdog`)

      // Trigger developer discovery job
      try {
        const { data: jobData, error: jobError } = await supabase.functions.invoke(
          'developer-discovery-job',
          {
            body: {
              tokenMint: mint.token_mint,
              source: 'watchdog_auto_discovery',
            },
          }
        )

        if (!jobError && jobData) {
          // Mark as discovery triggered
          await supabase
            .from('token_mint_watchdog')
            .update({ discovery_triggered: true })
            .eq('token_mint', mint.token_mint)

          discoveryJobsTriggered.push(mint.token_mint)
          console.log(`🚀 Triggered discovery job for ${mint.token_mint}`)
        } else {
          console.error(`Failed to trigger discovery for ${mint.token_mint}:`, jobError)
        }
      } catch (error) {
        console.error(`Error triggering discovery for ${mint.token_mint}:`, error)
      }
    }

    console.log(`Watchdog cycle complete. New mints: ${newMints.length}, Discovery jobs triggered: ${discoveryJobsTriggered.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        newMintsDetected: newMints.length,
        discoveryJobsTriggered: discoveryJobsTriggered.length,
        tokenMints: newMints.map(m => m.token_mint),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in token-mint-watchdog-monitor:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
