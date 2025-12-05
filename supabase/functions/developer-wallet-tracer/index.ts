import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { fetchTransactionHistory, isProviderEnabled } from '../_shared/rpc-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WalletTraceNode {
  wallet: string;
  depth: number;
  amountSol: number;
  timestamp: Date;
  sourceType: string;
  cexName?: string;
  children: WalletTraceNode[];
}

// Known CEX hot wallets
const KNOWN_CEX_WALLETS: Record<string, string[]> = {
  'Binance': [
    '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    'FeesMarket3mj6p9C4mHsNhXuJvJuxz5Ncc6Dv5mDPyj'
  ],
  'Coinbase': [
    'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS',
    'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE',
    '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S'
  ],
  'Kraken': [
    'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL'
  ],
  'Bybit': [
    'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2'
  ],
  'OKX': [
    '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD'
  ],
  'KuCoin': [
    'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6'
  ]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check super admin status
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { walletAddress, maxDepth = 10, minAmountSol = 0.1, developerId } = await req.json();

    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'walletAddress is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[developer-wallet-tracer] Tracing wallet: ${walletAddress}, maxDepth: ${maxDepth}`);

    // Check which CEX a wallet belongs to
    function getCexName(wallet: string): string | null {
      for (const [cex, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
        if (wallets.includes(wallet)) {
          return cex;
        }
      }
      return null;
    }

    // Recursive wallet tracing function using provider fallbacks
    async function traceWallet(
      wallet: string,
      currentDepth: number,
      visited: Set<string>
    ): Promise<WalletTraceNode | null> {
      if (currentDepth > maxDepth || visited.has(wallet)) {
        return null;
      }

      visited.add(wallet);

      // Check if this is a known CEX wallet
      const cexName = getCexName(wallet);
      let sourceType = cexName ? 'cex_withdrawal' : 'unknown';

      const node: WalletTraceNode = {
        wallet,
        depth: currentDepth,
        amountSol: 0,
        timestamp: new Date(),
        sourceType,
        cexName: cexName || undefined,
        children: []
      };

      // If we hit a CEX, stop tracing deeper
      if (cexName) {
        console.log(`[developer-wallet-tracer] Found CEX source: ${cexName} at depth ${currentDepth}`);
        return node;
      }

      try {
        // Fetch transaction history using provider fallback system
        const txResult = await fetchTransactionHistory(wallet, 50);

        if (txResult.error || !txResult.data) {
          console.warn(`[developer-wallet-tracer] Could not fetch transactions for ${wallet}: ${txResult.error}`);
          return node;
        }

        console.log(`[developer-wallet-tracer] Fetched ${txResult.data.length} transactions via ${txResult.provider}`);

        // Find incoming SOL transfers
        const incomingTransfers: { from: string; amount: number; timestamp: number; signature: string }[] = [];

        for (const tx of txResult.data) {
          // Handle Helius format (nativeTransfers)
          if (tx.nativeTransfers) {
            for (const transfer of tx.nativeTransfers) {
              if (transfer.toUserAccount === wallet && (transfer.amount / 1e9) >= minAmountSol) {
                incomingTransfers.push({
                  from: transfer.fromUserAccount,
                  amount: transfer.amount / 1e9,
                  timestamp: tx.timestamp || Date.now() / 1000,
                  signature: tx.signature
                });
              }
            }
          }
          // Handle Solscan format
          else if (tx.lamport !== undefined && tx.src) {
            if ((tx.lamport / 1e9) >= minAmountSol) {
              incomingTransfers.push({
                from: tx.src,
                amount: tx.lamport / 1e9,
                timestamp: tx.blockTime || Date.now() / 1000,
                signature: tx.txHash || tx.signature
              });
            }
          }
        }

        // Trace each significant funding source (limit to top 5)
        for (const transfer of incomingTransfers.slice(0, 5)) {
          // Store this trace in database if developerId provided
          if (developerId) {
            await supabase.from('wallet_funding_traces').insert({
              developer_id: developerId,
              from_wallet: transfer.from,
              to_wallet: wallet,
              amount_sol: transfer.amount,
              transaction_signature: transfer.signature,
              trace_depth: currentDepth,
              timestamp: new Date(transfer.timestamp * 1000),
              source_type: sourceType
            }).catch(e => console.error('Insert error:', e));
          }

          // Recursively trace the funding source
          const childNode = await traceWallet(transfer.from, currentDepth + 1, visited);
          if (childNode) {
            childNode.amountSol = transfer.amount;
            childNode.timestamp = new Date(transfer.timestamp * 1000);
            node.children.push(childNode);
          }
        }
      } catch (error) {
        console.error(`[developer-wallet-tracer] Error tracing wallet ${wallet}:`, error);
      }

      return node;
    }

    const visited = new Set<string>();
    const fundingTree = await traceWallet(walletAddress, 0, visited);

    // Extract all CEX sources found
    const cexSources: Array<{ exchange: string; wallet: string; depth: number }> = [];
    const extractCexSources = (node: WalletTraceNode | null) => {
      if (!node) return;
      if (node.cexName) {
        cexSources.push({
          exchange: node.cexName,
          wallet: node.wallet,
          depth: node.depth
        });
      }
      node.children.forEach(extractCexSources);
    };
    extractCexSources(fundingTree);

    console.log(`[developer-wallet-tracer] Trace complete. Found ${cexSources.length} CEX sources, visited ${visited.size} wallets`);

    return new Response(
      JSON.stringify({
        success: true,
        fundingTree,
        cexSources,
        walletsTraced: visited.size,
        maxDepthReached: maxDepth
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[developer-wallet-tracer] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
