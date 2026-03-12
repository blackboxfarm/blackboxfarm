/**
 * Unified Creator Resolver
 * 
 * Canonical 4-step chain to resolve token creator wallet:
 * 1. Pump.fun user-created API (authoritative for pump tokens)
 * 2. Helius TOKEN_MINT transaction proof
 * 3. Helius DAS getAssetsByCreator
 * 4. Internal DB records (token_lifecycle, developer_tokens)
 * 
 * Replaces solscan-creator-lookup internals.
 */

import { getHeliusApiKey, getHeliusRestUrl, getHeliusRpcUrl } from './helius-client.ts';

export interface CreatorResolution {
  creatorWallet: string | null;
  source: 'pumpfun' | 'helius_mint_tx' | 'helius_das' | 'db_cache' | 'none';
  confidence: number;
  errors: string[];
}

function isPumpFunToken(mint: string): boolean {
  return mint.endsWith('pump');
}

/**
 * Resolve the creator wallet for a token mint using the canonical chain.
 * Does NOT use Solscan.
 */
export async function resolveTokenCreator(
  tokenMint: string,
  supabase: any,
  apiErrors: string[] = []
): Promise<CreatorResolution> {
  // Step 1: Pump.fun API (primary for pump tokens, also works for non-pump sometimes)
  try {
    const pfRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (pfRes.ok) {
      const data = await pfRes.json();
      if (data?.creator) {
        return {
          creatorWallet: data.creator,
          source: 'pumpfun',
          confidence: 100,
          errors: [],
        };
      }
    } else if (pfRes.status !== 404) {
      apiErrors.push(`Pump.fun API ${pfRes.status} for ${tokenMint.slice(0, 8)}`);
    }
  } catch (e) {
    apiErrors.push(`Pump.fun API error: ${e instanceof Error ? e.message : 'timeout'}`);
  }

  // Step 2: Helius TOKEN_MINT transaction proof
  const heliusKey = getHeliusApiKey();
  if (heliusKey) {
    try {
      const txUrl = getHeliusRestUrl(`/v0/addresses/${tokenMint}/transactions`, { type: 'TOKEN_MINT', limit: '5' });
      const txRes = await fetch(txUrl, { signal: AbortSignal.timeout(8000) });
      if (txRes.ok) {
        const transactions = await txRes.json();
        if (Array.isArray(transactions) && transactions.length > 0) {
          // The fee payer of the mint tx is typically the creator
          const feePayer = transactions[0]?.feePayer;
          if (feePayer) {
            return {
              creatorWallet: feePayer,
              source: 'helius_mint_tx',
              confidence: 95,
              errors: [],
            };
          }
        }
      }
    } catch (e) {
      apiErrors.push(`Helius TOKEN_MINT error: ${e instanceof Error ? e.message : 'timeout'}`);
    }

    // Step 3: Helius DAS getAssetsByCreator (reverse lookup)
    try {
      const rpcUrl = getHeliusRpcUrl(heliusKey);
      const dasRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'creator-resolve',
          method: 'getAsset',
          params: { id: tokenMint },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (dasRes.ok) {
        const result = await dasRes.json();
        const creators = result?.result?.authorities || result?.result?.creators || [];
        const creator = creators.find((c: any) => c.verified || c.share === 100);
        if (creator?.address) {
          return {
            creatorWallet: creator.address,
            source: 'helius_das',
            confidence: 85,
            errors: [],
          };
        }
      }
    } catch (e) {
      apiErrors.push(`Helius DAS error: ${e instanceof Error ? e.message : 'timeout'}`);
    }
  }

  // Step 4: Internal DB records
  try {
    const { data: lifecycle } = await supabase
      .from('token_lifecycle')
      .select('creator_wallet')
      .eq('token_mint', tokenMint)
      .maybeSingle();
    if (lifecycle?.creator_wallet) {
      return {
        creatorWallet: lifecycle.creator_wallet,
        source: 'db_cache',
        confidence: 80,
        errors: [],
      };
    }

    const { data: devToken } = await supabase
      .from('developer_tokens')
      .select('creator_wallet')
      .eq('token_mint', tokenMint)
      .maybeSingle();
    if (devToken?.creator_wallet) {
      return {
        creatorWallet: devToken.creator_wallet,
        source: 'db_cache',
        confidence: 75,
        errors: [],
      };
    }
  } catch (e) {
    apiErrors.push(`DB lookup error: ${e instanceof Error ? e.message : 'unknown'}`);
  }

  return {
    creatorWallet: null,
    source: 'none',
    confidence: 0,
    errors: apiErrors,
  };
}
