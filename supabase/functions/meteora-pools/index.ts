import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const METEORA_V2_API = 'https://damm-v2.datapi.meteora.ag'

interface MeteoraPool {
  address: string
  name: string
  token_x: { address: string; name: string; symbol: string; decimals: number; price: number; market_cap: number; holders: number }
  token_y: { address: string; name: string; symbol: string; decimals: number; price: number; market_cap: number; holders: number }
  token_x_amount: number
  token_y_amount: number
  tvl: number
  current_price: number
  created_at: number
  pool_config: {
    base_fee_pct: number
    protocol_fee_pct: number
    dynamic_fee_initialized: boolean
    pool_type: number
    concentrated_liquidity: boolean
  }
  volume: Record<string, number>
  fees: Record<string, number>
  fee_tvl_ratio: Record<string, number>
  cumulative_metrics: { volume: number; fees: number }
  permanent_lock_liquidity: number
  has_farm: boolean
  farm_apr: number
  launchpad: string
}

async function fetchPoolData(poolAddress: string): Promise<MeteoraPool | null> {
  const url = `${METEORA_V2_API}/pools?filter_by=pool_address%3D${poolAddress}&page=1&page_size=1`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`Meteora API error: ${res.status}`)
    return null
  }
  const data = await res.json()
  return data?.data?.[0] || null
}

async function fetchWalletPoolTransactions(walletAddress: string, poolAddress: string): Promise<any[]> {
  const heliusKey = Deno.env.get('HELIUS_API_KEY')
  if (!heliusKey) {
    console.warn('No HELIUS_API_KEY - skipping transaction fetch')
    return []
  }

  try {
    // Get recent transactions for this wallet
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusKey}&limit=50`
    const res = await fetch(url)
    if (!res.ok) return []
    const txs = await res.json()

    // Filter for transactions involving the pool address
    const poolTxs = txs.filter((tx: any) => {
      const accounts = tx.accountData?.map((a: any) => a.account) || []
      const instructions = JSON.stringify(tx.instructions || [])
      return accounts.includes(poolAddress) || instructions.includes(poolAddress)
    })

    return poolTxs.map((tx: any) => ({
      signature: tx.signature,
      timestamp: tx.timestamp,
      type: tx.type || 'UNKNOWN',
      description: tx.description || '',
      fee: tx.fee,
      feePayer: tx.feePayer,
      nativeTransfers: tx.nativeTransfers || [],
      tokenTransfers: tx.tokenTransfers || [],
    }))
  } catch (err) {
    console.error('Helius fetch error:', err)
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Authenticate
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Check super admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
    const isSuperAdmin = roles?.some((r: any) => r.role === 'super_admin')
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list'

    if (action === 'pool-details') {
      const poolAddress = url.searchParams.get('pool_address')
      if (!poolAddress) {
        return new Response(JSON.stringify({ error: 'pool_address required' }), { status: 400, headers: corsHeaders })
      }

      const pool = await fetchPoolData(poolAddress)
      if (!pool) {
        return new Response(JSON.stringify({ error: 'pool not found' }), { status: 404, headers: corsHeaders })
      }

      // Try to get wallet transactions for this pool
      const walletAddress = url.searchParams.get('wallet_address')
      let transactions: any[] = []
      if (walletAddress) {
        transactions = await fetchWalletPoolTransactions(walletAddress, poolAddress)
      }

      return new Response(JSON.stringify({ pool, transactions }), { status: 200, headers: corsHeaders })
    }

    if (action === 'wallet-pools') {
      // Get the FlipIt wallet address from super_admin_wallets
      const { data: wallets } = await supabase
        .from('super_admin_wallets')
        .select('pubkey, label, wallet_type')
        .eq('wallet_type', 'flipit')
        .eq('is_active', true)

      const flipitPubkey = wallets?.[0]?.pubkey
      if (!flipitPubkey) {
        return new Response(JSON.stringify({ error: 'no flipit wallet found', pools: [] }), { status: 200, headers: corsHeaders })
      }

      // Get any pools associated with this wallet from Helius
      const heliusKey = Deno.env.get('HELIUS_API_KEY')
      let detectedPools: string[] = []

      // For now, also check if we have stored pool addresses
      // Hardcode the known pool for now + allow dynamic discovery
      const knownPools = url.searchParams.get('pool_addresses')?.split(',').filter(Boolean) || []
      const poolAddresses = [...new Set([...knownPools])]

      // Fetch data for all known pools
      const poolResults = await Promise.all(
        poolAddresses.map(async (addr) => {
          const pool = await fetchPoolData(addr)
          const txs = await fetchWalletPoolTransactions(flipitPubkey, addr)
          return pool ? { pool, transactions: txs, wallet: flipitPubkey } : null
        })
      )

      return new Response(JSON.stringify({
        pools: poolResults.filter(Boolean),
        wallet: flipitPubkey,
      }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'invalid action' }), { status: 400, headers: corsHeaders })
  } catch (e) {
    console.error('meteora-pools error:', e)
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders })
  }
})
