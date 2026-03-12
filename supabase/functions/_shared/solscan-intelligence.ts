/**
 * Solscan Intelligence — Oracle Spider Data Source
 * 
 * Uses Solscan Pro API v2.0 to discover:
 * 1. Token creator/mint authority (token meta)
 * 2. Wallet funding chain (SOL transfers TO a wallet = who funded it)
 * 3. Tokens created/minted by a wallet
 */

import { createApiLogger } from "./api-logger.ts";

const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111111';

interface SolscanFunder {
  wallet: string;
  amountSol: number;
  timestamp: number;
  txSignature?: string;
}

interface SolscanTokenCreation {
  mint: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

interface SolscanIntelResult {
  // Token resolution
  creatorWallet: string | null;
  mintAuthority: string | null;
  tokenMeta: Record<string, any> | null;

  // Wallet funding chain
  funders: SolscanFunder[];
  topFunder: string | null;

  // Tokens created by wallet
  createdTokens: SolscanTokenCreation[];

  // Diagnostics
  apiErrors: string[];
  callsMade: number;
}

function getSolscanApiKey(): string | null {
  return Deno.env.get('SOLSCAN_API_KEY') || null;
}

function solscanHeaders(apiKey: string): Record<string, string> {
  return { 'Accept': 'application/json', 'token': apiKey };
}

/**
 * Resolve creator wallet for a token mint via Solscan token meta
 */
export async function solscanResolveTokenCreator(
  tokenMint: string,
  apiErrors: string[] = []
): Promise<{ creator: string | null; mintAuthority: string | null; meta: any }> {
  const apiKey = getSolscanApiKey();
  if (!apiKey) {
    apiErrors.push('SOLSCAN_API_KEY not configured');
    return { creator: null, mintAuthority: null, meta: null };
  }

  try {
    const logger = createApiLogger({
      serviceName: 'solscan',
      endpoint: '/v2.0/token/meta',
      tokenMint,
      functionName: 'solscanResolveTokenCreator',
      requestType: 'oracle_spider',
      credits: 1,
    });

    const resp = await fetch(
      `https://pro-api.solscan.io/v2.0/token/meta?address=${tokenMint}`,
      { headers: solscanHeaders(apiKey), signal: AbortSignal.timeout(8000) }
    );

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      await logger.complete(resp.status, `Solscan ${resp.status}: ${errBody.slice(0, 200)}`);
      apiErrors.push(`Solscan token/meta ${resp.status}`);
      return { creator: null, mintAuthority: null, meta: null };
    }

    await logger.complete(resp.status);
    const data = await resp.json();
    const meta = data?.data || data;

    const creator = meta?.creator || null;
    const mintAuthority = meta?.mint_authority || meta?.mintAuthority || null;

    if (creator) console.log(`[Solscan Intel] Token ${tokenMint.slice(0, 8)}... creator: ${creator.slice(0, 8)}...`);

    return { creator, mintAuthority, meta };
  } catch (e) {
    const msg = `Solscan token/meta error: ${e instanceof Error ? e.message : 'timeout'}`;
    apiErrors.push(msg);
    console.error(`[Solscan Intel] ${msg}`);
    return { creator: null, mintAuthority: null, meta: null };
  }
}

/**
 * Check if a wallet has a known CEX label on Solscan (e.g., "Binance 2", "Coinbase 1")
 * Uses the /v2.0/account/detail endpoint which returns tags/labels.
 */
export async function solscanCheckAccountLabel(
  walletAddress: string,
  apiErrors: string[] = []
): Promise<{ label: string | null; isCex: boolean; tags: string[] }> {
  const apiKey = getSolscanApiKey();
  if (!apiKey) return { label: null, isCex: false, tags: [] };

  try {
    const logger = createApiLogger({
      serviceName: 'solscan',
      endpoint: '/v2.0/account/detail',
      tokenMint: walletAddress,
      functionName: 'solscanCheckAccountLabel',
      requestType: 'oracle_spider',
      credits: 1,
    });

    const resp = await fetch(
      `https://pro-api.solscan.io/v2.0/account/detail?address=${walletAddress}`,
      { headers: solscanHeaders(apiKey), signal: AbortSignal.timeout(8000) }
    );

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      await logger.complete(resp.status, `Solscan ${resp.status}: ${errBody.slice(0, 200)}`);
      apiErrors.push(`Solscan account/detail ${resp.status}`);
      return { label: null, isCex: false, tags: [] };
    }

    await logger.complete(resp.status);
    const data = await resp.json();
    const detail = data?.data || data;

    // Solscan returns tags like ["Token Creator", "#Pump.fun"] and 
    // assigned_to or label fields for CEX wallets
    const tags: string[] = detail?.tags || [];
    const label = detail?.assigned_to || detail?.label || detail?.account_label || null;
    
    // Also check the "funded_by" field directly if present
    const fundedBy = detail?.funded_by || null;
    
    const CEX_KEYWORDS = ['binance', 'coinbase', 'okx', 'bybit', 'kraken', 'kucoin', 'huobi', 'gate.io', 'ftx', 'gemini', 'bitfinex', 'crypto.com', 'mexc'];
    
    const labelLower = (label || '').toLowerCase();
    const fundedByLower = (fundedBy || '').toLowerCase();
    const isCex = CEX_KEYWORDS.some(k => labelLower.includes(k) || fundedByLower.includes(k));

    if (label) console.log(`[Solscan Intel] Account ${walletAddress.slice(0, 8)}... label: "${label}" (CEX: ${isCex})`);
    if (fundedBy) console.log(`[Solscan Intel] Account ${walletAddress.slice(0, 8)}... funded_by: "${fundedBy}"`);

    return { label: label || fundedBy, isCex, tags };
  } catch (e) {
    const msg = `Solscan account/detail error: ${e instanceof Error ? e.message : 'timeout'}`;
    apiErrors.push(msg);
    return { label: null, isCex: false, tags: [] };
  }
}

/**
 * Discover who funded a wallet by looking at SOL transfers TO the wallet.
 * Returns top funders sorted by amount.
 */
export async function solscanDiscoverFunders(
  walletAddress: string,
  apiErrors: string[] = [],
  maxPages: number = 2
): Promise<SolscanFunder[]> {
  const apiKey = getSolscanApiKey();
  if (!apiKey) {
    apiErrors.push('SOLSCAN_API_KEY not configured');
    return [];
  }

  const funders = new Map<string, SolscanFunder>();

  try {
    // Fetch SOL transfers TO this wallet (incoming SOL = funding)
    let page = 1;
    let hasMore = true;
    let lastSignature: string | undefined;

    while (hasMore && page <= maxPages) {
      const logger = createApiLogger({
        serviceName: 'solscan',
        endpoint: '/v2.0/account/transfer',
        tokenMint: walletAddress,
        functionName: 'solscanDiscoverFunders',
        requestType: 'oracle_spider',
        credits: 1,
      });

      let url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${walletAddress}&activity_type[]=ACTIVITY_SPL_TRANSFER&token=${SOL_NATIVE_MINT}&page=${page}&page_size=40&sort_by=block_time&sort_order=desc`;

      const resp = await fetch(url, {
        headers: solscanHeaders(apiKey),
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        await logger.complete(resp.status, `Solscan ${resp.status}: ${errBody.slice(0, 200)}`);
        apiErrors.push(`Solscan account/transfer ${resp.status}`);
        break;
      }

      await logger.complete(resp.status);
      const data = await resp.json();
      const transfers = data?.data || [];

      if (!Array.isArray(transfers) || transfers.length === 0) {
        hasMore = false;
        break;
      }

      for (const tx of transfers) {
        // We want transfers WHERE this wallet is the RECEIVER (incoming SOL)
        const from = tx.from_address || tx.source || tx.from || null;
        const to = tx.to_address || tx.dest || tx.to || null;
        const amount = tx.amount ? Number(tx.amount) / 1e9 : 0; // lamports to SOL

        if (to === walletAddress && from && from !== walletAddress && amount > 0.01) {
          const existing = funders.get(from);
          if (existing) {
            existing.amountSol += amount;
          } else {
            funders.set(from, {
              wallet: from,
              amountSol: amount,
              timestamp: tx.block_time || tx.blockTime || 0,
              txSignature: tx.trans_id || tx.signature || undefined,
            });
          }
        }
      }

      if (transfers.length < 40) {
        hasMore = false;
      }
      page++;

      // Small delay between pages
      if (hasMore) await new Promise(r => setTimeout(r, 200));
    }

    const sorted = Array.from(funders.values()).sort((a, b) => b.amountSol - a.amountSol);
    if (sorted.length > 0) {
      console.log(`[Solscan Intel] Wallet ${walletAddress.slice(0, 8)}... has ${sorted.length} funders. Top: ${sorted[0].wallet.slice(0, 8)}... (${sorted[0].amountSol.toFixed(2)} SOL)`);
    }

    return sorted;
  } catch (e) {
    const msg = `Solscan account/transfer error: ${e instanceof Error ? e.message : 'timeout'}`;
    apiErrors.push(msg);
    console.error(`[Solscan Intel] ${msg}`);
    return [];
  }
}

/**
 * Discover tokens created/minted by a wallet via Solscan account transfer
 * filtered to ACTIVITY_SPL_CREATE_ACCOUNT and ACTIVITY_SPL_MINT
 */
export async function solscanDiscoverCreatedTokens(
  walletAddress: string,
  apiErrors: string[] = []
): Promise<SolscanTokenCreation[]> {
  const apiKey = getSolscanApiKey();
  if (!apiKey) {
    apiErrors.push('SOLSCAN_API_KEY not configured');
    return [];
  }

  const tokens: SolscanTokenCreation[] = [];

  try {
    const logger = createApiLogger({
      serviceName: 'solscan',
      endpoint: '/v2.0/account/transfer',
      tokenMint: walletAddress,
      functionName: 'solscanDiscoverCreatedTokens',
      requestType: 'oracle_spider',
      credits: 1,
    });

    // Look for MINT activities by this wallet
    const url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${walletAddress}&activity_type[]=ACTIVITY_SPL_MINT&page=1&page_size=40&sort_by=block_time&sort_order=desc`;

    const resp = await fetch(url, {
      headers: solscanHeaders(apiKey),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      await logger.complete(resp.status, `Solscan ${resp.status}: ${errBody.slice(0, 200)}`);
      apiErrors.push(`Solscan account/transfer MINT ${resp.status}`);
      return [];
    }

    await logger.complete(resp.status);
    const data = await resp.json();
    const transfers = data?.data || [];

    const seenMints = new Set<string>();
    for (const tx of transfers) {
      const mint = tx.token_address || tx.token || null;
      if (mint && !seenMints.has(mint)) {
        seenMints.add(mint);
        tokens.push({
          mint,
          name: tx.token_name || undefined,
          symbol: tx.token_symbol || undefined,
          decimals: tx.token_decimals || undefined,
        });
      }
    }

    if (tokens.length > 0) {
      console.log(`[Solscan Intel] Wallet ${walletAddress.slice(0, 8)}... minted ${tokens.length} tokens`);
    }

    return tokens;
  } catch (e) {
    const msg = `Solscan created tokens error: ${e instanceof Error ? e.message : 'timeout'}`;
    apiErrors.push(msg);
    console.error(`[Solscan Intel] ${msg}`);
    return [];
  }
}

/**
 * Full intelligence sweep for the oracle spider.
 * Given a wallet or token, discovers:
 * - Creator wallet (if token)
 * - Funding chain (who funded the wallet)
 * - Tokens created by the wallet
 */
export async function solscanFullIntelSweep(
  input: string,
  inputType: 'wallet' | 'token',
  apiErrors: string[] = []
): Promise<SolscanIntelResult> {
  const result: SolscanIntelResult = {
    creatorWallet: null,
    mintAuthority: null,
    tokenMeta: null,
    funders: [],
    topFunder: null,
    createdTokens: [],
    apiErrors,
    callsMade: 0,
  };

  const apiKey = getSolscanApiKey();
  if (!apiKey) {
    apiErrors.push('SOLSCAN_API_KEY not configured');
    return result;
  }

  console.log(`[Solscan Intel] Full sweep: ${inputType} ${input.slice(0, 12)}...`);

  let targetWallet = inputType === 'wallet' ? input : null;

  // Step 1: If token, resolve creator
  if (inputType === 'token') {
    const { creator, mintAuthority, meta } = await solscanResolveTokenCreator(input, apiErrors);
    result.creatorWallet = creator;
    result.mintAuthority = mintAuthority;
    result.tokenMeta = meta;
    result.callsMade++;

    targetWallet = creator || mintAuthority;
  }

  // Step 2: Discover funding chain for the wallet
  if (targetWallet) {
    result.funders = await solscanDiscoverFunders(targetWallet, apiErrors);
    result.callsMade += 2; // up to 2 pages
    result.topFunder = result.funders.length > 0 ? result.funders[0].wallet : null;

    // Step 3: Discover tokens created by this wallet
    result.createdTokens = await solscanDiscoverCreatedTokens(targetWallet, apiErrors);
    result.callsMade++;
  }

  console.log(`[Solscan Intel] Sweep complete: creator=${result.creatorWallet?.slice(0, 8) || 'none'}, funders=${result.funders.length}, tokens=${result.createdTokens.length}, calls=${result.callsMade}`);

  return result;
}
