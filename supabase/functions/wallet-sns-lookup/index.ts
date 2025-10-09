import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Connection, PublicKey } from 'https://esm.sh/@solana/web3.js@1.95.8'
import { getTwitterRegistry, NameRegistryState } from 'https://esm.sh/@bonfida/spl-name-service@0.1.51'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface WalletLookupRequest {
  address: string
  usdValue: number
}

interface WalletLookupResult {
  address: string
  twitter?: string
  snsName?: string
  source: 'cache' | 'sns_lookup' | 'skipped_threshold' | 'sns_no_result'
  cachedUntil?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { wallets } = await req.json() as { wallets: WalletLookupRequest[] }

    if (!wallets || !Array.isArray(wallets)) {
      return new Response(JSON.stringify({ error: 'Invalid request: wallets array required' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Get configuration
    const { data: configData } = await supabase
      .from('platform_config')
      .select('config_value')
      .eq('config_key', 'wallet_sns_lookup_threshold')
      .eq('is_active', true)
      .maybeSingle()

    const minUsdThreshold = configData?.config_value?.min_usd_value || 100

    const results: WalletLookupResult[] = []
    const stats = {
      total: wallets.length,
      cached: 0,
      lookedUp: 0,
      skipped: 0
    }

    // Filter wallets by threshold
    const walletsToProcess = wallets.filter(w => w.usdValue >= minUsdThreshold)
    const skippedWallets = wallets.filter(w => w.usdValue < minUsdThreshold)

    // Add skipped wallets to results
    skippedWallets.forEach(w => {
      results.push({
        address: w.address,
        source: 'skipped_threshold'
      })
      stats.skipped++
    })

    if (walletsToProcess.length === 0) {
      return new Response(JSON.stringify({ results, stats }), {
        status: 200,
        headers: corsHeaders
      })
    }

    // Check cache for wallets
    const addresses = walletsToProcess.map(w => w.address)
    const { data: cachedMetadata } = await supabase
      .from('wallet_metadata')
      .select('*')
      .in('wallet_address', addresses)

    const cachedMap = new Map(cachedMetadata?.map(m => [m.wallet_address, m]) || [])
    const walletsToLookup: WalletLookupRequest[] = []

    // Process cached results
    walletsToProcess.forEach(wallet => {
      const cached = cachedMap.get(wallet.address)
      if (cached && new Date(cached.next_lookup_at) > new Date()) {
        // Use cached result
        results.push({
          address: wallet.address,
          twitter: cached.twitter_handle || undefined,
          snsName: cached.sns_name || undefined,
          source: 'cache',
          cachedUntil: cached.next_lookup_at
        })
        stats.cached++
      } else {
        // Need to lookup
        walletsToLookup.push(wallet)
      }
    })

    // Perform SNS lookups for non-cached wallets
    if (walletsToLookup.length > 0) {
      const heliusRpc = Deno.env.get('HELIUS_RPC_URL') || 'https://api.mainnet-beta.solana.com'
      const connection = new Connection(heliusRpc)

      const lookupPromises = walletsToLookup.map(async (wallet) => {
        try {
          // Set timeout for lookup
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('SNS lookup timeout')), 5000)
          )

          const lookupPromise = performSNSLookup(connection, wallet.address)
          const result = await Promise.race([lookupPromise, timeoutPromise]) as { twitter?: string; snsName?: string }

          const lookupSource = result.twitter ? 'sns_success' : 'sns_no_result'

          // Store result in database
          await supabase.from('wallet_metadata').upsert({
            wallet_address: wallet.address,
            twitter_handle: result.twitter || null,
            sns_name: result.snsName || null,
            lookup_source: lookupSource,
            last_lookup_at: new Date().toISOString(),
            next_lookup_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            lookup_count: 1
          }, {
            onConflict: 'wallet_address',
            ignoreDuplicates: false
          })

          // If Twitter handle found, add to KOL wallets table
          if (result.twitter) {
            await supabase.from('kol_wallets').upsert({
              wallet_address: wallet.address,
              twitter_handle: result.twitter,
              sns_name: result.snsName || null,
              last_verified_at: new Date().toISOString(),
              is_active: true
            }, {
              onConflict: 'wallet_address',
              ignoreDuplicates: false
            })
          }

          stats.lookedUp++

          return {
            address: wallet.address,
            twitter: result.twitter,
            snsName: result.snsName,
            source: 'sns_lookup' as const,
            cachedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          }
        } catch (error) {
          console.error(`SNS lookup failed for ${wallet.address}:`, error)
          
          // Store "no result" in cache to avoid repeated lookups
          await supabase.from('wallet_metadata').upsert({
            wallet_address: wallet.address,
            twitter_handle: null,
            sns_name: null,
            lookup_source: 'sns_no_result',
            last_lookup_at: new Date().toISOString(),
            next_lookup_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            lookup_count: 1
          }, {
            onConflict: 'wallet_address',
            ignoreDuplicates: false
          })

          // Check if this wallet was previously a KOL and mark inactive
          const { data: existingKol } = await supabase
            .from('kol_wallets')
            .select('id')
            .eq('wallet_address', wallet.address)
            .maybeSingle()

          if (existingKol) {
            await supabase
              .from('kol_wallets')
              .update({ is_active: false, last_verified_at: new Date().toISOString() })
              .eq('wallet_address', wallet.address)
          }

          stats.lookedUp++

          return {
            address: wallet.address,
            source: 'sns_no_result' as const,
            cachedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      })

      const lookupResults = await Promise.allSettled(lookupPromises)
      lookupResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        }
      })
    }

    return new Response(JSON.stringify({ results, stats }), {
      status: 200,
      headers: corsHeaders
    })
  } catch (error) {
    console.error('wallet-sns-lookup error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    })
  }
})

async function performSNSLookup(
  connection: Connection,
  walletAddress: string
): Promise<{ twitter?: string; snsName?: string }> {
  try {
    const owner = new PublicKey(walletAddress)

    // Try to get Twitter handle from SNS
    let twitterHandle: string | undefined
    try {
      const twitterRegistry = await getTwitterRegistry(connection, owner)
      if (twitterRegistry) {
        const twitterRegistryData = await NameRegistryState.retrieve(connection, twitterRegistry)
        if (twitterRegistryData?.data) {
          // Decode the Twitter handle
          const decoder = new TextDecoder()
          twitterHandle = decoder.decode(twitterRegistryData.data).replace(/\0/g, '').trim()
          
          // Remove @ prefix if present
          if (twitterHandle.startsWith('@')) {
            twitterHandle = twitterHandle.substring(1)
          }
          
          // Validate it's not empty after cleanup
          if (!twitterHandle) {
            twitterHandle = undefined
          }
        }
      }
    } catch (twitterError) {
      console.log(`No Twitter record found for ${walletAddress}`)
    }

    return {
      twitter: twitterHandle,
      snsName: undefined // Could add SNS domain lookup here if needed
    }
  } catch (error) {
    console.error(`SNS lookup error for ${walletAddress}:`, error)
    throw error
  }
}
