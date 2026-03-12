import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { createApiLogger } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function isKnownCex(funderName: string | null, funderType: string | null): boolean {
  if (funderType === 'exchange' || funderType === 'cex') return true;
  const name = (funderName || '').toLowerCase();
  return CEX_KEYWORDS.some(k => name.includes(k));
}

async function heliusFundedBy(
  walletAddress: string,
  apiKey: string,
  errors: string[]
): Promise<HeliusFundedByResult | null> {
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
      const body = await resp.text();
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

// Deep KYC root search: traces funding chain upward (depth 5) to find CEX/KYC roots
// Now powered by Helius /v1/wallet/{address}/funded-by (free, no paid plan needed)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) throw new Error('HELIUS_API_KEY not configured');

    const { walletAddress, maxDepth } = await req.json();
    if (!walletAddress) throw new Error('walletAddress required');

    const depth = Math.min(maxDepth || 5, 8);
    console.log(`[KYCDeep] Starting depth-${depth} Helius trace for ${walletAddress}`);

    const visited = new Set<string>();
    const chain: Array<{ wallet: string; funder: string; funderName: string | null; funderType: string | null; amountSol: number; depth: number }> = [];
    const errors: string[] = [];
    let kycRoot: string | null = null;
    let kycRootLabel: string | null = null;
    let meshLinksAdded = 0;

    const knownCexWallets = new Set<string>();

    // BFS upward through funding chain
    const queue: Array<{ wallet: string; depth: number }> = [{ wallet: walletAddress, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.wallet) || current.depth >= depth) continue;
      visited.add(current.wallet);

      console.log(`[KYCDeep] Tracing depth ${current.depth}: ${current.wallet.slice(0, 12)}...`);

      // Use Helius funded-by to find the original funder of this wallet
      const funding = await heliusFundedBy(current.wallet, heliusApiKey, errors);

      if (!funding) {
        // No funder found — if we're past depth 0, this is a potential KYC root (dead end)
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

      // Check if funder is a CEX
      if (isKnownCex(funding.funderName, funding.funderType)) {
        knownCexWallets.add(funding.funder);
        kycRoot = current.wallet; // The wallet funded by CEX is the KYC root
        kycRootLabel = funding.funderName || funding.funderType || 'exchange';
        console.log(`[KYCDeep] 🏦 CEX-funded KYC root: ${current.wallet.slice(0, 12)} (funded by "${kycRootLabel}" ${funding.funder.slice(0, 8)})`);
        // Don't trace into CEX wallets
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

      // Continue tracing upward
      if (!visited.has(funding.funder) && !knownCexWallets.has(funding.funder)) {
        queue.push({ wallet: funding.funder, depth: current.depth + 1 });
      }

      // Rate limit between Helius calls
      await new Promise(r => setTimeout(r, 200));
    }

    // If we found a KYC root, mark it in the mesh
    if (kycRoot && kycRoot !== walletAddress) {
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

      // Also mark intermediate wallets
      for (const link of chain) {
        if (link.funder === kycRoot || link.wallet === kycRoot) continue;
        await supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'kyc_root',
            source_id: kycRoot,
            linked_type: 'wallet',
            linked_id: link.wallet,
            relationship: 'same_kyc_root',
            confidence: 70,
            discovered_via: 'mesh-kyc-deep-search',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
        meshLinksAdded++;
      }
    }

    console.log(`[KYCDeep] Done: ${chain.length} links, KYC root: ${kycRoot?.slice(0, 12) || 'not found'} (${kycRootLabel || 'N/A'})`);

    return new Response(
      JSON.stringify({
        walletAddress,
        kycRoot,
        kycRootLabel,
        chainDepth: chain.length,
        walletsTraced: visited.size,
        meshLinksAdded,
        chain: chain.map(c => ({
          wallet: c.wallet,
          funder: c.funder,
          funderName: c.funderName,
          funderType: c.funderType,
          amountSol: c.amountSol,
          depth: c.depth,
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
});
