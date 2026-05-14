/**
 * Funding Resolver — Helius-first funding chain discovery
 * 
 * Uses reputation_mesh cache to avoid redundant Helius API calls.
 * Falls back to Helius /v1/wallet/{address}/funded-by when no cache hit.
 * Uses centralized heliusRestFetch for rate limiting + circuit breaker.
 */

import { getHeliusApiKey, heliusRestFetch, redactHeliusSecrets } from './helius-client.ts';
import { createApiLogger } from './api-logger.ts';

export interface FundingResult {
  funder: string;
  funderName: string | null;
  funderType: string | null;
  amountSol: number;
  isCex: boolean;
  source: 'helius' | 'mesh_cache' | 'unknown';
}

const CEX_KEYWORDS = ['binance', 'coinbase', 'okx', 'bybit', 'kraken', 'kucoin', 'huobi', 'gate.io', 'ftx', 'gemini', 'bitfinex', 'crypto.com', 'mexc'];

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Cache TTL: skip Helius if mesh data is newer than 7 days
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isValidSolanaAddress(address: string): boolean {
  if (typeof address !== 'string' || !BASE58_REGEX.test(address)) return false;
  if (address === address.toLowerCase() && address.length > 40) return false;
  return true;
}

function isKnownCex(name: string | null, type: string | null): boolean {
  if (type === 'exchange' || type === 'cex') return true;
  const n = (name || '').toLowerCase();
  return CEX_KEYWORDS.some(k => n.includes(k));
}

/**
 * Check reputation_mesh for cached funding data.
 * Returns cached result if found and fresh enough.
 */
async function checkMeshCache(walletAddress: string): Promise<FundingResult | 'no_funder' | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return null;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.54.0');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from('reputation_mesh')
      .select('linked_id, confidence, metadata, discovered_at')
      .eq('source_type', 'wallet')
      .eq('source_id', walletAddress)
      .eq('relationship', 'funded_by')
      .order('discovered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.linked_id) return null;

    // Check freshness
    const discoveredAt = new Date(data.discovered_at).getTime();
    if (Date.now() - discoveredAt > CACHE_TTL_MS) {
      console.log(`[FundingResolver] Cache expired for ${walletAddress.slice(0, 8)}... (${Math.round((Date.now() - discoveredAt) / 86400000)}d old)`);
      return null;
    }

    // Negative-cache sentinel: linked_id == self + metadata.no_funder = true
    const meta0 = (data.metadata || {}) as Record<string, any>;
    if (data.linked_id === walletAddress && meta0.no_funder === true) {
      console.log(`[FundingResolver] ✅ NEG-CACHE HIT for ${walletAddress.slice(0, 8)}... (no funder, skipping Helius)`);
      return 'no_funder';
    }

    const meta = (data.metadata || {}) as Record<string, any>;
    const funderName = meta.funder_name || null;
    const funderType = meta.funder_type || null;
    const isCex = isKnownCex(funderName, funderType);

    console.log(`[FundingResolver] ✅ CACHE HIT for ${walletAddress.slice(0, 8)}... → ${data.linked_id.slice(0, 8)}... (saved 1 Helius credit)`);

    return {
      funder: data.linked_id,
      funderName,
      funderType,
      amountSol: meta.amount_sol || 0,
      isCex,
      source: 'mesh_cache',
    };
  } catch (e) {
    console.warn(`[FundingResolver] Cache check failed:`, e);
    return null;
  }
}

/**
 * Write funding result to reputation_mesh for future cache hits.
 */
async function writeMeshCache(walletAddress: string, result: FundingResult): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.54.0');
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('reputation_mesh').upsert({
      source_type: 'wallet',
      source_id: walletAddress,
      linked_type: 'wallet',
      linked_id: result.funder,
      relationship: 'funded_by',
      confidence: result.isCex ? 95 : 80,
      discovered_via: 'funding-resolver',
      discovered_at: new Date().toISOString(),
      metadata: {
        funder_name: result.funderName,
        funder_type: result.funderType,
        amount_sol: result.amountSol,
        is_cex: result.isCex,
      },
    }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
  } catch (e) {
    console.warn(`[FundingResolver] Cache write failed:`, e);
  }
}

/**
 * Discover who funded a wallet.
 * Checks mesh cache first, then falls back to Helius API.
 */
export async function discoverFunding(
  walletAddress: string,
  apiErrors: string[] = []
): Promise<FundingResult | null> {
  if (!isValidSolanaAddress(walletAddress)) {
    console.warn(`[FundingResolver] Skipping invalid address: ${walletAddress}`);
    apiErrors.push(`Invalid Solana address for funding lookup: ${walletAddress.slice(0, 20)}`);
    return null;
  }

  // ── Check cache first ──
  const cached = await checkMeshCache(walletAddress);
  if (cached === 'no_funder') return null;
  if (cached) return cached;

  // ── Helius API call ──
  const heliusKey = getHeliusApiKey();
  if (!heliusKey) {
    apiErrors.push('HELIUS_API_KEY not configured for funding discovery');
    return null;
  }

  try {
    const logger = createApiLogger({
      serviceName: 'helius',
      endpoint: '/v1/wallet/funded-by',
      tokenMint: walletAddress,
      functionName: 'funding-resolver',
      requestType: 'oracle_spider',
      credits: 1,
    });

    // Use centralized heliusRestFetch for rate limiting + circuit breaker
    const resp = await heliusRestFetch(`/v1/wallet/${walletAddress}/funded-by`, {
      timeoutMs: 10000,
    });

    if (resp.status === 404) {
      // 404 = wallet has no upstream funder (genesis / fresh / program-funded).
      // This is a valid data outcome, NOT an API failure — log as success and
      // write a negative-cache sentinel so we don't re-query this dead-end.
      await logger.complete(200);
      writeNegativeCache(walletAddress).catch(() => {});
      return null;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      await logger.complete(resp.status, `Helius funded-by ${resp.status}: ${body.slice(0, 200)}`);
      apiErrors.push(`Helius funded-by ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }

    await logger.complete(resp.status);
    const data = await resp.json();

    if (!data?.funder) return null;

    const isCex = isKnownCex(data.funderName, data.funderType);

    console.log(`[FundingResolver] ${walletAddress.slice(0, 8)}... funded by ${data.funder.slice(0, 8)}... name="${data.funderName || 'unknown'}" CEX=${isCex}`);

    const result: FundingResult = {
      funder: data.funder,
      funderName: data.funderName || null,
      funderType: data.funderType || null,
      amountSol: data.amount || 0,
      isCex,
      source: 'helius',
    };

    // Write to cache for next time (fire-and-forget)
    writeMeshCache(walletAddress, result).catch(() => {});

    return result;
  } catch (e) {
    const msg = `Helius funded-by error: ${e instanceof Error ? redactHeliusSecrets(e.message) : 'timeout'}`;
    apiErrors.push(msg);
    console.error(`[FundingResolver] ${msg}`);
    return null;
  }
}

/**
 * Discover full funding chain (depth N) using Helius.
 * Returns ordered array from wallet → funder → ... → KYC root.
 */
export async function discoverFundingChain(
  walletAddress: string,
  maxDepth: number = 20,
  apiErrors: string[] = []
): Promise<{
  chain: FundingResult[];
  kycRoot: string | null;
  kycRootLabel: string | null;
  circularFunding: boolean;
  circularWallets: string[];
}> {
  const chain: FundingResult[] = [];
  const visited = new Set<string>();
  const visitOrder: string[] = [];
  let current = walletAddress;
  let kycRoot: string | null = null;
  let kycRootLabel: string | null = null;
  let circularFunding = false;
  let circularWallets: string[] = [];

  for (let depth = 0; depth < maxDepth; depth++) {
    if (visited.has(current)) {
      circularFunding = true;
      const loopStart = visitOrder.indexOf(current);
      circularWallets = visitOrder.slice(loopStart);
      console.log(`[FundingResolver] 🔄 CIRCULAR FUNDING DETECTED: ${circularWallets.map(w => w.slice(0, 8)).join(' ↔ ')} (loop at depth ${depth})`);
      break;
    }
    visited.add(current);
    visitOrder.push(current);

    const funding = await discoverFunding(current, apiErrors);
    if (!funding) break;

    chain.push(funding);

    if (funding.isCex) {
      kycRoot = current;
      kycRootLabel = funding.funderName || funding.funderType || 'exchange';
      break;
    }

    current = funding.funder;
    
    // Rate limit only for Helius calls (cache hits are free)
    if (funding.source === 'helius' && depth < maxDepth - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!kycRoot && chain.length > 0) {
    kycRoot = chain[chain.length - 1].funder;
  }

  return { chain, kycRoot, kycRootLabel, circularFunding, circularWallets };
}
