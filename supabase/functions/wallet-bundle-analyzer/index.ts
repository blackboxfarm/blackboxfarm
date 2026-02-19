import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireHeliusApiKey, getHeliusRestUrl, getHeliusRpcUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ──────────────────────────────────────────────────

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (res.status === 429) { await delay(2000 * (i + 1)); continue; }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await delay(1000 * (i + 1));
    }
  }
  throw new Error("Max retries");
}

interface WalletAnalysis {
  pubkey: string;
  nickname: string | null;
  source: string;
  hasPrivateKey: boolean;
  keyValid: boolean | null;
  onChainCreationDate: string | null;
  firstTxSignature: string | null;
  solBalance: number | null;
  crossTransfers: CrossTransfer[];
  fundingSources: FundingSource[];
  recentSwaps: SwapActivity[];
}

interface CrossTransfer {
  from: string;
  to: string;
  amountSol: number;
  timestamp: string;
  signature: string;
}

interface FundingSource {
  funder: string;
  amountSol: number;
  timestamp: string;
  isCex: boolean;
  cexName: string | null;
  signature: string;
}

interface SwapActivity {
  tokenMint: string;
  direction: 'buy' | 'sell';
  amountSol: number;
  timestamp: string;
  platform: string;
  signature: string;
}

interface BundleReport {
  wallets: WalletAnalysis[];
  crossTransferLinks: CrossTransfer[];
  sharedFundingSources: { funder: string; wallets: string[]; cexName: string | null }[];
  simultaneousTrades: { tokenMint: string; wallets: string[]; timestamps: string[]; windowSeconds: number }[];
  riskScore: number;
  riskFactors: string[];
  verdict: 'CLEAN' | 'LOW_RISK' | 'MODERATE_RISK' | 'HIGH_RISK' | 'BUNDLE_DETECTED';
}

// Known CEX wallets
const CEX_WALLETS: Record<string, string> = {
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": "Binance",
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": "Binance",
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": "Binance",
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2": "Binance",
  "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH": "Binance",
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": "Coinbase",
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": "Coinbase",
  "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm": "Coinbase",
  "CeijuS2rMHqxhbQq6ZvGxV7g7h3MrdKZPdpJR4NRV9WN": "Kraken",
  "EUuHEFLSqdDKirPEoZpTj9sQHgJY6aJB8KumLFXxcmv8": "Kraken",
  "6F6DgCxqLY9K7irEpHu97sUvZp8KkWG8rwNDK7dLMT5t": "Bybit",
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": "OKX",
  "Bi3Ru8krBjCJfKhKqUwdiLJwz4jPNwT1nz9Cg3Ai5gZf": "OKX",
  "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6": "KuCoin",
  "u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w": "Gate.io",
  "ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ": "MEXC",
  "88xTWZMeKfiTgbfEmPLdsUCQcZinwUfk25EBQZ21XMAZ": "Huobi",
  "A77HErxSEiyjsLLz6yNMvnA5vKSZwCzLtpAKc1BQy4GL": "Bitget",
};

function getCexName(wallet: string): string | null {
  return CEX_WALLETS[wallet] || null;
}

// ─── Core Analysis Functions ─────────────────────────────────

/** Get the oldest transaction for a wallet (proxy for on-chain creation date) */
async function getFirstTransaction(pubkey: string, heliusApiKey: string): Promise<{ timestamp: string; signature: string } | null> {
  try {
    // Get signatures oldest first
    const rpcUrl = getHeliusRpcUrl(heliusApiKey);
    
    // First get total count with a recent batch
    const recentRes = await fetchWithRetry(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getSignaturesForAddress',
        params: [pubkey, { limit: 1000 }]
      })
    });
    
    if (!recentRes.ok) return null;
    const recentData = await recentRes.json();
    let signatures = recentData.result || [];
    
    // Walk backwards to find the oldest
    while (signatures.length === 1000) {
      const oldest = signatures[signatures.length - 1];
      await delay(200);
      const olderRes = await fetchWithRetry(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getSignaturesForAddress',
          params: [pubkey, { limit: 1000, before: oldest.signature }]
        })
      });
      if (!olderRes.ok) break;
      const olderData = await olderRes.json();
      const olderSigs = olderData.result || [];
      if (olderSigs.length === 0) break;
      signatures = olderSigs;
    }
    
    if (signatures.length === 0) return null;
    
    const oldest = signatures[signatures.length - 1];
    return {
      timestamp: new Date((oldest.blockTime || 0) * 1000).toISOString(),
      signature: oldest.signature
    };
  } catch (e) {
    console.error(`getFirstTransaction failed for ${pubkey.slice(0, 8)}:`, e);
    return null;
  }
}

/** Get enhanced transactions for a wallet via Helius parsed API */
async function getEnhancedTransactions(pubkey: string, heliusApiKey: string, limit = 100): Promise<any[]> {
  try {
    const url = getHeliusRestUrl(`/v0/addresses/${pubkey}/transactions`, { limit: String(limit) });
    const res = await fetchWithRetry(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error(`getEnhancedTransactions failed for ${pubkey.slice(0, 8)}:`, e);
    return [];
  }
}

/** Check SOL balance via RPC */
async function getSolBalance(pubkey: string, heliusApiKey: string): Promise<number | null> {
  try {
    const rpcUrl = getHeliusRpcUrl(heliusApiKey);
    const res = await fetchWithRetry(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [pubkey] })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.result?.value || 0) / 1e9;
  } catch { return null; }
}

/** Validate a wallet address exists on-chain */
async function validateWalletKey(pubkey: string, heliusApiKey: string): Promise<boolean> {
  try {
    const rpcUrl = getHeliusRpcUrl(heliusApiKey);
    const res = await fetchWithRetry(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [pubkey, { encoding: 'base64' }] })
    });
    if (!res.ok) return false;
    const data = await res.json();
    // If account exists or has had transactions, it's valid
    // Even if null (no lamports), the address format is valid if no RPC error
    return !data.error;
  } catch { return false; }
}

/** Extract cross-wallet transfers from enhanced transactions */
function extractCrossTransfers(
  txs: any[],
  walletPubkey: string,
  allWalletPubkeys: Set<string>
): CrossTransfer[] {
  const transfers: CrossTransfer[] = [];
  
  for (const tx of txs) {
    if (!tx.nativeTransfers) continue;
    for (const nt of tx.nativeTransfers) {
      const amountSol = (nt.amount || 0) / 1e9;
      if (amountSol < 0.001) continue;
      
      // Check if transfer is between two of our wallets
      const from = nt.fromUserAccount;
      const to = nt.toUserAccount;
      
      if (from === walletPubkey && allWalletPubkeys.has(to) && to !== walletPubkey) {
        transfers.push({
          from, to, amountSol,
          timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
          signature: tx.signature
        });
      }
      if (to === walletPubkey && allWalletPubkeys.has(from) && from !== walletPubkey) {
        transfers.push({
          from, to, amountSol,
          timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
          signature: tx.signature
        });
      }
    }
  }
  
  return transfers;
}

/** Extract funding sources (first incoming SOL transfers) */
function extractFundingSources(txs: any[], walletPubkey: string): FundingSource[] {
  const sources: FundingSource[] = [];
  
  // Sort oldest first
  const sorted = [...txs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  for (const tx of sorted) {
    if (!tx.nativeTransfers) continue;
    for (const nt of tx.nativeTransfers) {
      if (nt.toUserAccount === walletPubkey && nt.fromUserAccount !== walletPubkey) {
        const amountSol = (nt.amount || 0) / 1e9;
        if (amountSol < 0.01) continue;
        
        const funder = nt.fromUserAccount;
        const cexName = getCexName(funder);
        
        sources.push({
          funder,
          amountSol,
          timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
          isCex: !!cexName,
          cexName,
          signature: tx.signature
        });
      }
    }
  }
  
  // Return top 10 funding sources
  return sources.slice(0, 10);
}

/** Extract swap/trade activity */
function extractSwapActivity(txs: any[], walletPubkey: string): SwapActivity[] {
  const swaps: SwapActivity[] = [];
  
  for (const tx of txs) {
    if (tx.type !== 'SWAP' || !tx.events?.swap) continue;
    
    const swap = tx.events.swap;
    let direction: 'buy' | 'sell' = 'buy';
    let amountSol = 0;
    let tokenMint = '';
    
    if (swap.nativeInput?.amount) {
      direction = 'buy';
      amountSol = Number(swap.nativeInput.amount) / 1e9;
      tokenMint = swap.tokenOutputs?.[0]?.mint || '';
    } else if (swap.nativeOutput?.amount) {
      direction = 'sell';
      amountSol = Number(swap.nativeOutput.amount) / 1e9;
      tokenMint = swap.tokenInputs?.[0]?.mint || '';
    }
    
    if (tokenMint && amountSol > 0) {
      swaps.push({
        tokenMint, direction, amountSol,
        timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
        platform: tx.source || 'unknown',
        signature: tx.signature
      });
    }
  }
  
  return swaps;
}

// ─── Main Analysis ────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const heliusApiKey = requireHeliusApiKey();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gather all wallets from all tables
    const [superAdmin, blackbox, airdrop, rentReclaimer, walletPool] = await Promise.all([
      supabase.from('super_admin_wallets').select('pubkey, label, is_active, secret_key_encrypted, created_at'),
      supabase.from('blackbox_wallets').select('pubkey, is_active, secret_key_encrypted, created_at'),
      supabase.from('airdrop_wallets').select('pubkey, nickname, is_active, secret_key_encrypted, created_at'),
      supabase.from('rent_reclaimer_wallets').select('pubkey, nickname, is_active, secret_key_encrypted, created_at'),
      supabase.from('wallet_pools').select('pubkey, is_active, secret_key_encrypted, created_at'),
    ]);

    // Build unique wallet list (skip placeholders/invalid addresses)
    const walletMap = new Map<string, { nickname: string | null; source: string; hasPrivateKey: boolean; dbCreatedAt: string }>();
    
    for (const w of (superAdmin.data || [])) {
      if (w.pubkey.length >= 32 && w.pubkey.length <= 44 && !w.pubkey.startsWith('PLACEHOLDER')) {
        walletMap.set(w.pubkey, { nickname: w.label, source: 'super_admin', hasPrivateKey: !!w.secret_key_encrypted, dbCreatedAt: w.created_at });
      }
    }
    for (const w of (blackbox.data || [])) {
      if (w.pubkey.length >= 32 && w.pubkey.length <= 44 && !w.pubkey.startsWith('PLACEHOLDER') && !w.pubkey.startsWith('CUP9') && !w.pubkey.startsWith('PSY8')) {
        if (!walletMap.has(w.pubkey)) {
          walletMap.set(w.pubkey, { nickname: null, source: 'blackbox', hasPrivateKey: !!w.secret_key_encrypted, dbCreatedAt: w.created_at });
        }
      }
    }
    for (const w of (airdrop.data || [])) {
      if (w.pubkey.length >= 32 && w.pubkey.length <= 44) {
        if (!walletMap.has(w.pubkey)) {
          walletMap.set(w.pubkey, { nickname: w.nickname, source: 'airdrop', hasPrivateKey: !!w.secret_key_encrypted, dbCreatedAt: w.created_at });
        }
      }
    }
    for (const w of (rentReclaimer.data || [])) {
      if (w.pubkey.length >= 32 && w.pubkey.length <= 44) {
        if (!walletMap.has(w.pubkey)) {
          walletMap.set(w.pubkey, { nickname: w.nickname, source: 'custom', hasPrivateKey: !!w.secret_key_encrypted, dbCreatedAt: w.created_at });
        }
      }
    }
    for (const w of (walletPool.data || [])) {
      if (w.pubkey.length >= 32 && w.pubkey.length <= 44) {
        if (!walletMap.has(w.pubkey)) {
          walletMap.set(w.pubkey, { nickname: null, source: 'wallet_pool', hasPrivateKey: !!w.secret_key_encrypted, dbCreatedAt: w.created_at });
        }
      }
    }

    const allPubkeys = new Set(walletMap.keys());
    console.log(`Analyzing ${allPubkeys.size} unique wallets for bundle detection`);

    const walletAnalyses: WalletAnalysis[] = [];
    const allCrossTransfers: CrossTransfer[] = [];
    const allFundingSources: Map<string, FundingSource[]> = new Map();
    const allSwapActivity: Map<string, SwapActivity[]> = new Map();
    
    // Process wallets in batches of 3 to avoid rate limits
    const pubkeyArray = Array.from(allPubkeys);
    
    for (let i = 0; i < pubkeyArray.length; i += 3) {
      const batch = pubkeyArray.slice(i, i + 3);
      console.log(`Processing batch ${Math.floor(i / 3) + 1}/${Math.ceil(pubkeyArray.length / 3)}: ${batch.map(p => p.slice(0, 8)).join(', ')}`);
      
      const batchResults = await Promise.all(batch.map(async (pubkey) => {
        const info = walletMap.get(pubkey)!;
        
        // Parallel: get first tx, balance, enhanced txs, and validate
        const [firstTx, balance, enhancedTxs, isValid] = await Promise.all([
          getFirstTransaction(pubkey, heliusApiKey),
          getSolBalance(pubkey, heliusApiKey),
          getEnhancedTransactions(pubkey, heliusApiKey, 100),
          validateWalletKey(pubkey, heliusApiKey),
        ]);
        
        const crossTransfers = extractCrossTransfers(enhancedTxs, pubkey, allPubkeys);
        const fundingSources = extractFundingSources(enhancedTxs, pubkey);
        const swaps = extractSwapActivity(enhancedTxs, pubkey);
        
        return {
          analysis: {
            pubkey,
            nickname: info.nickname,
            source: info.source,
            hasPrivateKey: info.hasPrivateKey,
            keyValid: isValid,
            onChainCreationDate: firstTx?.timestamp || null,
            firstTxSignature: firstTx?.signature || null,
            solBalance: balance,
            crossTransfers,
            fundingSources,
            recentSwaps: swaps,
          } as WalletAnalysis,
          crossTransfers,
          fundingSources,
          swaps,
        };
      }));
      
      for (const r of batchResults) {
        walletAnalyses.push(r.analysis);
        allCrossTransfers.push(...r.crossTransfers);
        allFundingSources.set(r.analysis.pubkey, r.fundingSources);
        allSwapActivity.set(r.analysis.pubkey, r.swaps);
      }
      
      // Rate limit delay between batches
      if (i + 3 < pubkeyArray.length) {
        await delay(500);
      }
    }

    // ─── Deduplicate cross transfers ──────────────────────────
    const uniqueCrossTransfers: CrossTransfer[] = [];
    const seenSigs = new Set<string>();
    for (const ct of allCrossTransfers) {
      if (!seenSigs.has(ct.signature)) {
        seenSigs.add(ct.signature);
        uniqueCrossTransfers.push(ct);
      }
    }

    // ─── Find shared funding sources ──────────────────────────
    const funderToWallets = new Map<string, Set<string>>();
    for (const [pubkey, sources] of allFundingSources) {
      for (const src of sources) {
        if (!funderToWallets.has(src.funder)) {
          funderToWallets.set(src.funder, new Set());
        }
        funderToWallets.get(src.funder)!.add(pubkey);
      }
    }
    
    const sharedFunders = Array.from(funderToWallets.entries())
      .filter(([_, wallets]) => wallets.size > 1)
      .map(([funder, wallets]) => ({
        funder,
        wallets: Array.from(wallets),
        cexName: getCexName(funder),
      }));

    // ─── Find simultaneous trading ────────────────────────────
    const SIMULTANEOUS_WINDOW_SECONDS = 300; // 5 minute window
    const tokenSwapMap = new Map<string, { pubkey: string; timestamp: string; epochMs: number }[]>();
    
    for (const [pubkey, swaps] of allSwapActivity) {
      for (const swap of swaps) {
        if (!tokenSwapMap.has(swap.tokenMint)) {
          tokenSwapMap.set(swap.tokenMint, []);
        }
        tokenSwapMap.get(swap.tokenMint)!.push({
          pubkey,
          timestamp: swap.timestamp,
          epochMs: new Date(swap.timestamp).getTime(),
        });
      }
    }
    
    const simultaneousTrades: BundleReport['simultaneousTrades'] = [];
    for (const [tokenMint, activities] of tokenSwapMap) {
      // Check if 2+ different wallets traded the same token within the window
      const uniqueWallets = new Set(activities.map(a => a.pubkey));
      if (uniqueWallets.size < 2) continue;
      
      // Sort by time and find clusters
      const sorted = activities.sort((a, b) => a.epochMs - b.epochMs);
      for (let i = 0; i < sorted.length; i++) {
        const cluster = [sorted[i]];
        for (let j = i + 1; j < sorted.length; j++) {
          if ((sorted[j].epochMs - sorted[i].epochMs) / 1000 <= SIMULTANEOUS_WINDOW_SECONDS) {
            cluster.push(sorted[j]);
          }
        }
        const clusterWallets = new Set(cluster.map(c => c.pubkey));
        if (clusterWallets.size >= 2) {
          simultaneousTrades.push({
            tokenMint,
            wallets: Array.from(clusterWallets),
            timestamps: cluster.map(c => c.timestamp),
            windowSeconds: SIMULTANEOUS_WINDOW_SECONDS,
          });
          break; // One cluster per token is enough
        }
      }
    }

    // ─── Calculate risk score ─────────────────────────────────
    let riskScore = 0;
    const riskFactors: string[] = [];
    
    if (uniqueCrossTransfers.length > 0) {
      riskScore += Math.min(uniqueCrossTransfers.length * 15, 40);
      riskFactors.push(`${uniqueCrossTransfers.length} direct transfer(s) between wallets`);
    }
    
    if (sharedFunders.length > 0) {
      riskScore += Math.min(sharedFunders.length * 10, 25);
      for (const sf of sharedFunders) {
        riskFactors.push(`${sf.wallets.length} wallets share funder ${sf.cexName || sf.funder.slice(0, 8)}...`);
      }
    }
    
    if (simultaneousTrades.length > 0) {
      riskScore += Math.min(simultaneousTrades.length * 20, 35);
      riskFactors.push(`${simultaneousTrades.length} simultaneous trade cluster(s) within ${SIMULTANEOUS_WINDOW_SECONDS}s`);
    }
    
    // Determine verdict
    let verdict: BundleReport['verdict'] = 'CLEAN';
    if (riskScore >= 70) verdict = 'BUNDLE_DETECTED';
    else if (riskScore >= 50) verdict = 'HIGH_RISK';
    else if (riskScore >= 30) verdict = 'MODERATE_RISK';
    else if (riskScore >= 10) verdict = 'LOW_RISK';

    if (riskFactors.length === 0) {
      riskFactors.push('No on-chain links detected between wallets');
    }

    const report: BundleReport = {
      wallets: walletAnalyses,
      crossTransferLinks: uniqueCrossTransfers,
      sharedFundingSources: sharedFunders,
      simultaneousTrades,
      riskScore,
      riskFactors,
      verdict,
    };

    console.log(`Bundle analysis complete: ${verdict} (score: ${riskScore})`);

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Bundle analyzer error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
