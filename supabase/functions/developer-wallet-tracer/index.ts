import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WalletTraceNode {
  wallet: string
  depth: number
  amountSol: number
  timestamp: Date
  sourceType: string
  cexName?: string
  children: WalletTraceNode[]
}

// Known CEX hot wallets (partial list - expand as needed)
const KNOWN_CEX_WALLETS = {
  'coinbase': [
    '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
    'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS',
  ],
  'binance': [
    '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
    'FeesMarket3mj6p9C4mHsNhXuJvJuxz5Ncc6Dv5mDPyj',
  ],
  'kraken': [
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  ],
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

    // Check super admin status
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id })
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { walletAddress, maxDepth = 10, minAmountSol = 0.1, developerId } = await req.json()

    if (!walletAddress) {
      return new Response(JSON.stringify({ error: 'walletAddress is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Tracing wallet: ${walletAddress}, maxDepth: ${maxDepth}`)

    // Recursive function to trace wallet funding
    const traceWallet = async (
      wallet: string,
      currentDepth: number,
      visited: Set<string>
    ): Promise<WalletTraceNode | null> => {
      if (currentDepth > maxDepth || visited.has(wallet)) {
        return null
      }

      visited.add(wallet)

      // Check if this is a known CEX wallet
      let cexName: string | undefined
      let sourceType = 'unknown'
      
      for (const [exchange, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
        if (wallets.includes(wallet)) {
          cexName = exchange
          sourceType = 'cex_withdrawal'
          break
        }
      }

      const node: WalletTraceNode = {
        wallet,
        depth: currentDepth,
        amountSol: 0,
        timestamp: new Date(),
        sourceType,
        cexName,
        children: [],
      }

      // If we hit a CEX, stop tracing deeper
      if (cexName) {
        console.log(`Found CEX source: ${cexName} at depth ${currentDepth}`)
        return node
      }

      // Fetch transaction history from Helius
      try {
        const response = await fetch(
          `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&type=TRANSFER`,
          { method: 'GET' }
        )

        if (!response.ok) {
          console.error(`Helius API error: ${response.status}`)
          return node
        }

        const transactions = await response.json()
        
        // Find incoming SOL transfers
        const incomingTransfers = transactions
          .filter((tx: any) => {
            const nativeTransfers = tx.nativeTransfers || []
            return nativeTransfers.some((transfer: any) => 
              transfer.toUserAccount === wallet && 
              (transfer.amount / 1e9) >= minAmountSol
            )
          })
          .slice(0, 5) // Limit to top 5 funding sources per wallet

        // Trace each funding source
        for (const tx of incomingTransfers) {
          const nativeTransfers = tx.nativeTransfers || []
          for (const transfer of nativeTransfers) {
            if (transfer.toUserAccount === wallet && (transfer.amount / 1e9) >= minAmountSol) {
              const fromWallet = transfer.fromUserAccount
              const amountSol = transfer.amount / 1e9

              // Store this trace in database
              if (developerId) {
                await supabase.from('wallet_funding_traces').insert({
                  developer_id: developerId,
                  from_wallet: fromWallet,
                  to_wallet: wallet,
                  amount_sol: amountSol,
                  transaction_signature: tx.signature,
                  trace_depth: currentDepth,
                  timestamp: new Date(tx.timestamp * 1000),
                  source_type: sourceType,
                  cex_name: cexName,
                })
              }

              // Recursively trace the funding source
              const childNode = await traceWallet(fromWallet, currentDepth + 1, visited)
              if (childNode) {
                childNode.amountSol = amountSol
                childNode.timestamp = new Date(tx.timestamp * 1000)
                node.children.push(childNode)
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error tracing wallet ${wallet}:`, error)
      }

      return node
    }

    const visited = new Set<string>()
    const fundingTree = await traceWallet(walletAddress, 0, visited)

    // Extract all CEX sources found
    const cexSources: Array<{ exchange: string; wallet: string; depth: number }> = []
    const extractCexSources = (node: WalletTraceNode | null) => {
      if (!node) return
      if (node.cexName) {
        cexSources.push({
          exchange: node.cexName,
          wallet: node.wallet,
          depth: node.depth,
        })
      }
      node.children.forEach(extractCexSources)
    }
    extractCexSources(fundingTree)

    console.log(`Trace complete. Found ${cexSources.length} CEX sources, visited ${visited.size} wallets`)

    return new Response(
      JSON.stringify({
        success: true,
        fundingTree,
        cexSources,
        walletsTraced: visited.size,
        maxDepthReached: Math.max(...Array.from(visited).map((w, i) => 
          fundingTree ? getDepth(fundingTree, w) : 0
        )),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in developer-wallet-tracer:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function getDepth(node: WalletTraceNode, wallet: string): number {
  if (node.wallet === wallet) return node.depth
  for (const child of node.children) {
    const depth = getDepth(child, wallet)
    if (depth >= 0) return depth
  }
  return -1
}
