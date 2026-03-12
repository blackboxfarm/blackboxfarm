/**
 * Funding Resolver — Helius-first funding chain discovery
 * 
 * Replaces Solscan funding discovery with Helius /v1/wallet/{address}/funded-by
 * as the primary source. Falls back to mesh DB cache.
 */

import { getHeliusApiKey } from './helius-client.ts';
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

function isKnownCex(name: string | null, type: string | null): boolean {
  if (type === 'exchange' || type === 'cex') return true;
  const n = (name || '').toLowerCase();
  return CEX_KEYWORDS.some(k => n.includes(k));
}

/**
 * Discover who funded a wallet using Helius funded-by endpoint.
 * Returns the primary funder with CEX detection.
 */
export async function discoverFunding(
  walletAddress: string,
  apiErrors: string[] = []
): Promise<FundingResult | null> {
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

    const resp = await fetch(
      `https://api.helius.xyz/v1/wallet/${walletAddress}/funded-by?api-key=${heliusKey}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (resp.status === 404) {
      await logger.complete(404, 'No funding transaction found');
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

    return {
      funder: data.funder,
      funderName: data.funderName || null,
      funderType: data.funderType || null,
      amountSol: data.amount || 0,
      isCex,
      source: 'helius',
    };
  } catch (e) {
    const msg = `Helius funded-by error: ${e instanceof Error ? e.message : 'timeout'}`;
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
  maxDepth: number = 3,
  apiErrors: string[] = []
): Promise<{
  chain: FundingResult[];
  kycRoot: string | null;
  kycRootLabel: string | null;
}> {
  const chain: FundingResult[] = [];
  const visited = new Set<string>();
  let current = walletAddress;
  let kycRoot: string | null = null;
  let kycRootLabel: string | null = null;

  for (let depth = 0; depth < maxDepth; depth++) {
    if (visited.has(current)) break;
    visited.add(current);

    const funding = await discoverFunding(current, apiErrors);
    if (!funding) break;

    chain.push(funding);

    if (funding.isCex) {
      kycRoot = current; // The wallet funded by CEX is the KYC root
      kycRootLabel = funding.funderName || funding.funderType || 'exchange';
      break; // Don't trace into CEX wallets
    }

    current = funding.funder;
    
    // Rate limit
    if (depth < maxDepth - 1) await new Promise(r => setTimeout(r, 200));
  }

  // If no CEX found, the deepest wallet with no further funders is the root
  if (!kycRoot && chain.length > 0) {
    kycRoot = chain[chain.length - 1].funder;
  }

  return { chain, kycRoot, kycRootLabel };
}
