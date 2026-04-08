import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { createApiLogger } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { isCexWallet, getCexName } from '../_shared/cex-wallets.ts';

const CEX_KEYWORDS = ['binance', 'coinbase', 'okx', 'bybit', 'kraken', 'kucoin', 'huobi', 'gate.io', 'ftx', 'gemini', 'bitfinex', 'crypto.com', 'mexc'];

interface HeliusFundedByResult {
  funder: string;
  funderName: string | null;
  funderType: string | null;
  amount: number;
  amountRaw: string;
  signature: string;
  timestamp: number;
  slot: number;
}

function isKnownCex(funderAddress: string, funderName: string | null, funderType: string | null): boolean {
  // Check shared CEX wallet database first (most reliable)
  if (isCexWallet(funderAddress)) return true;
  if (funderType === 'exchange' || funderType === 'cex') return true;
  const name = (funderName || '').toLowerCase();
  return CEX_KEYWORDS.some(k => name.includes(k));
}

async function heliusFundedBy(
  walletAddress: string,
  apiKey: string,
  errors: string[]
): Promise<HeliusFundedByResult | null> {
  // Safety net: reject malformed addresses before burning Helius credits
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!base58Regex.test(walletAddress)) {
    const msg = `Invalid Base58 wallet address: ${walletAddress.slice(0, 16)}... — rejecting to save API credits`;
    console.error(`[mesh-kyc-deep-search] ${msg}`);
    errors.push(msg);
    return null;
  }
  // Extra heuristic: all-lowercase 40+ char addresses are likely corrupted mints
  if (walletAddress.length > 40 && walletAddress === walletAddress.toLowerCase()) {
    const msg = `Suspiciously all-lowercase address: ${walletAddress.slice(0, 16)}... — likely corrupted Base58`;
    console.error(`[mesh-kyc-deep-search] ${msg}`);
    errors.push(msg);
    return null;
  }
  try {
    const logger = createApiLogger({
      serviceName: 'helius',
      endpoint: '/v1/wallet/funded-by',
      tokenMint: walletAddress,
      functionName: 'mesh-kyc-deep-search',
      requestType: 'oracle_spider',
      credits: 1,
    });

    const resp = await fetch(
      `https://api.helius.xyz/v1/wallet/${walletAddress}/funded-by?api-key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (resp.status === 404) {
      await logger.complete(404, 'No funding transaction found');
      return null;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      await logger.complete(resp.status, `Helius funded-by ${resp.status}: ${body.slice(0, 200)}`);
      errors.push(`Helius funded-by ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }

    await logger.complete(resp.status);
    const data: HeliusFundedByResult = await resp.json();
    console.log(`[KYCDeep] Helius funded-by: ${walletAddress.slice(0, 8)}... → funder=${data.funder?.slice(0, 8)} name="${data.funderName || 'unknown'}" type="${data.funderType || 'unknown'}" amount=${data.amount} SOL`);
    return data;
  } catch (e) {
    const msg = `Helius funded-by error: ${e instanceof Error ? e.message : 'timeout'}`;
    errors.push(msg);
    console.error(`[KYCDeep] ${msg}`);
    return null;
  }
}

/**
 * Discover sibling wallets: "Who else did this funder send SOL to?"
 * This exposes bundle/coordinated wallet networks.
 */
async function discoverSiblings(
  funderWallet: string,
  apiKey: string,
  knownWallets: Set<string>,
  maxSiblings: number = 30
): Promise<Array<{ wallet: string; amountSol: number }>> {
  const siblings: Array<{ wallet: string; amountSol: number }> = [];
  
  try {
    // Use Helius enhanced transactions to find outgoing SOL transfers
    const resp = await fetch(`https://api.helius.xyz/v0/addresses/${funderWallet}/transactions?api-key=${apiKey}&type=TRANSFER&limit=100`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) return siblings;

    const txs: any[] = await resp.json();
    const recipientMap = new Map<string, number>();

    for (const tx of txs) {
      // Check native transfers (SOL movements)
      const nativeTransfers = tx.nativeTransfers || [];
      for (const nt of nativeTransfers) {
        if (nt.fromUserAccount === funderWallet && nt.toUserAccount !== funderWallet) {
          const recipient = nt.toUserAccount;
          const amountSol = (nt.amount || 0) / 1e9;
          if (amountSol >= 0.01) { // Min 0.01 SOL to be meaningful
            recipientMap.set(recipient, (recipientMap.get(recipient) || 0) + amountSol);
          }
        }
      }
    }

    // Sort by amount and take top siblings
    const sorted = [...recipientMap.entries()]
      .filter(([wallet]) => !knownWallets.has(wallet))
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSiblings);

    for (const [wallet, amountSol] of sorted) {
      siblings.push({ wallet, amountSol });
    }

    console.log(`[KYCDeep] Siblings of ${funderWallet.slice(0, 8)}: ${siblings.length} recipients found (${txs.length} txs scanned)`);
  } catch (e) {
    console.warn(`[KYCDeep] Sibling discovery failed for ${funderWallet.slice(0, 8)}: ${e}`);
  }

  return siblings;
}

// Deep KYC root search: traces funding chain upward (depth 5+) AND discovers sibling wallets
// Now powered by Helius /v1/wallet/{address}/funded-by + enhanced transactions
Deno.serve(withRunLog('mesh-kyc-deep-search', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) throw new Error('HELIUS_API_KEY not configured');

    const { walletAddress, maxDepth, discoverBundle } = await req.json();
    if (!walletAddress) throw new Error('walletAddress required');

    const depth = Math.min(maxDepth || 5, 8);
    const shouldDiscoverBundle = discoverBundle !== false; // Default: true
    console.log(`[KYCDeep] Starting depth-${depth} Helius trace for ${walletAddress} (bundle discovery: ${shouldDiscoverBundle})`);

    const visited = new Set<string>();
    const chain: Array<{ wallet: string; funder: string; funderName: string | null; funderType: string | null; amountSol: number; depth: number }> = [];
    const errors: string[] = [];
    let kycRoot: string | null = null;
    let kycRootLabel: string | null = null;
    let meshLinksAdded = 0;
    const siblingWallets: Array<{ wallet: string; amountSol: number; fundedBy: string }> = [];

    const knownCexWallets = new Set<string>();

    // BFS upward through funding chain
    const queue: Array<{ wallet: string; depth: number }> = [{ wallet: walletAddress, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.wallet) || current.depth >= depth) continue;
      visited.add(current.wallet);

      console.log(`[KYCDeep] Tracing depth ${current.depth}: ${current.wallet.slice(0, 12)}...`);

      const funding = await heliusFundedBy(current.wallet, heliusApiKey, errors);

      if (!funding) {
        if (current.depth > 0 && !kycRoot) {
          kycRoot = current.wallet;
          console.log(`[KYCDeep] Potential KYC root at depth ${current.depth}: ${current.wallet.slice(0, 12)} (no further funders)`);
        }
        continue;
      }

      chain.push({
        wallet: current.wallet,
        funder: funding.funder,
        funderName: funding.funderName,
        funderType: funding.funderType,
        amountSol: funding.amount,
        depth: current.depth + 1,
      });

      if (isKnownCex(funding.funder, funding.funderName, funding.funderType)) {
        knownCexWallets.add(funding.funder);
        kycRoot = current.wallet;
        kycRootLabel = funding.funderName || funding.funderType || 'exchange';
        console.log(`[KYCDeep] 🏦 CEX-funded KYC root: ${current.wallet.slice(0, 12)} (funded by "${kycRootLabel}" ${funding.funder.slice(0, 8)})`);
        continue;
      }

      // Write mesh link for the funding relationship
      const { error } = await supabase
        .from('reputation_mesh')
        .upsert({
          source_type: 'wallet',
          source_id: funding.funder,
          linked_type: 'wallet',
          linked_id: current.wallet,
          relationship: 'funded_by',
          confidence: Math.min(95, 60 + funding.amount * 5),
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });

      if (!error) meshLinksAdded++;

      // ═══ SIBLING DISCOVERY: Find other wallets funded by this same funder ═══
      if (shouldDiscoverBundle && !knownCexWallets.has(funding.funder) && current.depth <= 5) {
        const siblings = await discoverSiblings(funding.funder, heliusApiKey, visited, 50);
        
        for (const sib of siblings) {
          siblingWallets.push({ ...sib, fundedBy: funding.funder });
          
          // Write sibling mesh links
          const { error: sibErr } = await supabase
            .from('reputation_mesh')
            .upsert({
              source_type: 'wallet',
              source_id: funding.funder,
              linked_type: 'wallet',
              linked_id: sib.wallet,
              relationship: 'funded_by',
              confidence: Math.min(90, 50 + sib.amountSol * 3),
              discovered_via: 'mesh-kyc-deep-search:sibling',
              discovered_at: new Date().toISOString(),
              evidence: { amountSol: sib.amountSol, siblingOf: current.wallet },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });

          if (!sibErr) meshLinksAdded++;
        }

        if (siblings.length > 0) {
          console.log(`[KYCDeep] 🕸️ Found ${siblings.length} sibling wallets funded by ${funding.funder.slice(0, 8)}`);
        }
      }

      if (!visited.has(funding.funder) && !knownCexWallets.has(funding.funder)) {
        queue.push({ wallet: funding.funder, depth: current.depth + 1 });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    // If we found a KYC root, mark it in the mesh
    if (kycRoot && kycRoot !== walletAddress) {
      await supabase
        .from('reputation_mesh')
        .upsert({
          source_type: 'wallet',
          source_id: kycRoot,
          linked_type: 'kyc_root',
          linked_id: kycRoot,
          relationship: 'is_kyc_root',
          confidence: 95,
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
      meshLinksAdded++;

      await supabase
        .from('reputation_mesh')
        .upsert({
          source_type: 'kyc_root',
          source_id: kycRoot,
          linked_type: 'wallet',
          linked_id: walletAddress,
          relationship: 'same_kyc_root',
          confidence: 85,
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
      meshLinksAdded++;

      // Mark intermediate wallets AND sibling wallets under same KYC root
      const allWalletsUnderKyc = [
        ...chain.map(c => c.wallet),
        ...siblingWallets.map(s => s.wallet),
      ];
      
      for (const wallet of allWalletsUnderKyc) {
        if (wallet === kycRoot) continue;
        await supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'kyc_root',
            source_id: kycRoot,
            linked_type: 'wallet',
            linked_id: wallet,
            relationship: 'same_kyc_root',
            confidence: 70,
            discovered_via: 'mesh-kyc-deep-search',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
        meshLinksAdded++;
      }
    }

    console.log(`[KYCDeep] Done: ${chain.length} chain links, ${siblingWallets.length} siblings, KYC root: ${kycRoot?.slice(0, 12) || 'not found'} (${kycRootLabel || 'N/A'}), ${meshLinksAdded} mesh links added`);

    return new Response(
      JSON.stringify({
        walletAddress,
        kycRoot,
        kycRootLabel,
        chainDepth: chain.length,
        walletsTraced: visited.size,
        meshLinksAdded,
        siblingCount: siblingWallets.length,
        chain: chain.map(c => ({
          wallet: c.wallet,
          funder: c.funder,
          funderName: c.funderName,
          funderType: c.funderType,
          amountSol: c.amountSol,
          depth: c.depth,
        })),
        siblings: siblingWallets.slice(0, 20).map(s => ({
          wallet: s.wallet,
          amountSol: s.amountSol,
          fundedBy: s.fundedBy,
        })),
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[KYCDeep] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}));

