import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRestUrl, getHeliusRpcUrl, redactHeliusSecrets, requireHeliusApiKey } from '../_shared/helius-client.ts';

enableHeliusTracking('token-flow-tracer');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Known burn addresses
const BURN_ADDRESSES = new Set([
  '1nc1nerator11111111111111111111111111111111',
  '11111111111111111111111111111111', // System program (sometimes used as burn)
  'burnXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
]);

interface TokenTransfer {
  signature: string;
  timestamp: number;
  fromWallet: string;
  toWallet: string;
  amount: number;
  isBurn: boolean;
  destinationType: string; // 'burn' | 'self' | 'cex' | 'unknown_wallet'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check - super admin required
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403, headers: corsHeaders });
    }

    const { walletAddress, tokenMint } = await req.json();
    if (!walletAddress || !tokenMint) {
      return new Response(JSON.stringify({ error: 'walletAddress and tokenMint required' }), { status: 400, headers: corsHeaders });
    }

    console.log(`[token-flow-tracer] Tracing token ${tokenMint} flows for wallet ${walletAddress}`);

    // Fetch all transactions for this wallet from Helius parsed transaction history
    // We'll paginate to get comprehensive data
    const allTransactions: any[] = [];
    let lastSignature: string | undefined;
    const MAX_PAGES = 5; // up to 500 txs

    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const extraParams: Record<string, string> = { limit: '100' };
        if (lastSignature) extraParams.before = lastSignature;

        const url = getHeliusRestUrl(`/v0/addresses/${walletAddress}/transactions`, extraParams);
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          console.error(`[token-flow-tracer] Helius REST ${response.status}: ${await response.text()}`);
          break;
        }

        const txs = await response.json();
        if (!txs || txs.length === 0) break;
        allTransactions.push(...txs);
        lastSignature = txs[txs.length - 1].signature;
        console.log(`[token-flow-tracer] Page ${page + 1}: fetched ${txs.length} txs (total: ${allTransactions.length})`);
        if (txs.length < 100) break;
      } catch (err) {
        console.error(`[token-flow-tracer] Fetch page ${page + 1} error:`, redactHeliusSecrets(String(err)));
        break;
      }
    }

    console.log(`[token-flow-tracer] Total transactions fetched: ${allTransactions.length}`);

    // Filter for token transfers involving our target token mint
    const tokenFlows: TokenTransfer[] = [];
    const buybacks: TokenTransfer[] = [];
    const outflows: TokenTransfer[] = [];
    const destinationWallets: Record<string, { totalAmount: number; txCount: number; isBurn: boolean }> = {};

    let totalBought = 0;
    let totalSent = 0;
    let totalBurned = 0;

    for (const tx of allTransactions) {
      // Check tokenTransfers (SPL token transfers)
      if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.mint !== tokenMint) continue;

          const amount = transfer.tokenAmount || 0;
          const from = transfer.fromUserAccount || '';
          const to = transfer.toUserAccount || '';

          // Is this a buy (tokens coming IN to the dev wallet)?
          if (to === walletAddress && from !== walletAddress) {
            const flow: TokenTransfer = {
              signature: tx.signature,
              timestamp: tx.timestamp || 0,
              fromWallet: from,
              toWallet: to,
              amount,
              isBurn: false,
              destinationType: 'buy',
            };
            buybacks.push(flow);
            totalBought += amount;
          }

          // Is this an outflow (tokens going OUT from the dev wallet)?
          if (from === walletAddress && to !== walletAddress) {
            const isBurn = BURN_ADDRESSES.has(to) || to === '';
            const flow: TokenTransfer = {
              signature: tx.signature,
              timestamp: tx.timestamp || 0,
              fromWallet: from,
              toWallet: to,
              amount,
              isBurn,
              destinationType: isBurn ? 'burn' : 'unknown_wallet',
            };
            outflows.push(flow);
            tokenFlows.push(flow);

            if (isBurn) {
              totalBurned += amount;
            } else {
              totalSent += amount;
            }

            // Track destination wallets
            if (!destinationWallets[to]) {
              destinationWallets[to] = { totalAmount: 0, txCount: 0, isBurn };
            }
            destinationWallets[to].totalAmount += amount;
            destinationWallets[to].txCount += 1;
          }
        }
      }
    }

    // Now check if tokens are being sent to Token Account addresses (ATAs)
    // and resolve the owner wallets
    const uniqueDestinations = Object.keys(destinationWallets).filter(d => !BURN_ADDRESSES.has(d));
    
    // Check token balances of destination wallets to see if they still hold tokens
    const destinationAnalysis: Array<{
      wallet: string;
      totalReceived: number;
      txCount: number;
      isBurn: boolean;
      currentBalance: number | null;
    }> = [];

    // Use Helius DAS to check current token holdings of destination wallets
    for (const destWallet of uniqueDestinations.slice(0, 10)) { // limit to top 10
      let currentBalance: number | null = null;
      try {
        const rpcUrl = getHeliusRpcUrl();
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [
              destWallet,
              { mint: tokenMint },
              { encoding: 'jsonParsed' },
            ],
          }),
        });

        const data = await response.json();
        if (data.result?.value?.length > 0) {
          const parsed = data.result.value[0].account.data.parsed;
          currentBalance = parsed?.info?.tokenAmount?.uiAmount || 0;
        } else {
          currentBalance = 0;
        }
      } catch {
        currentBalance = null;
      }

      destinationAnalysis.push({
        wallet: destWallet,
        totalReceived: destinationWallets[destWallet].totalAmount,
        txCount: destinationWallets[destWallet].txCount,
        isBurn: destinationWallets[destWallet].isBurn,
        currentBalance,
      });
    }

    // Sort by total received
    destinationAnalysis.sort((a, b) => b.totalReceived - a.totalReceived);

    // Determine verdict
    let verdict = 'unknown';
    if (totalBurned > 0 && totalBurned > totalSent) {
      verdict = 'BURNING_TOKENS';
    } else if (totalSent > 0 && totalSent > totalBurned) {
      verdict = 'DISTRIBUTING_TO_WALLETS';
    } else if (totalBought > 0 && totalSent === 0 && totalBurned === 0) {
      verdict = 'HOLDING_IN_WALLET';
    } else if (totalBought === 0) {
      verdict = 'NO_BUYBACKS_DETECTED';
    } else {
      verdict = 'MIXED_ACTIVITY';
    }

    const summary = {
      walletAddress,
      tokenMint,
      totalTransactionsScanned: allTransactions.length,
      totalBuybackTxs: buybacks.length,
      totalOutflowTxs: outflows.length,
      totalTokensBought: totalBought,
      totalTokensSentOut: totalSent,
      totalTokensBurned: totalBurned,
      verdict,
      destinations: destinationAnalysis,
      recentBuybacks: buybacks.slice(0, 10).map(b => ({
        signature: b.signature,
        amount: b.amount,
        from: b.fromWallet,
        timestamp: b.timestamp ? new Date(b.timestamp * 1000).toISOString() : null,
      })),
      recentOutflows: outflows.slice(0, 10).map(o => ({
        signature: o.signature,
        amount: o.amount,
        to: o.toWallet,
        isBurn: o.isBurn,
        timestamp: o.timestamp ? new Date(o.timestamp * 1000).toISOString() : null,
      })),
    };

    console.log(`[token-flow-tracer] VERDICT: ${verdict} | Bought: ${totalBought} | Sent: ${totalSent} | Burned: ${totalBurned}`);
    console.log(`[token-flow-tracer] Unique destination wallets: ${uniqueDestinations.length}`);

    return new Response(JSON.stringify(summary), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[token-flow-tracer] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
