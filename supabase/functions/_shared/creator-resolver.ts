/**
 * Unified Creator Resolver
 * 
 * Canonical 5-step chain to resolve token creator wallet:
 * 1. Pump.fun user-created API (authoritative for pump tokens)
 * 2. Helius TOKEN_MINT transaction proof
 * 3. Helius DAS getAsset (authorities/creators)
 * 4. Helius RPC getSignaturesForAddress → getTransaction (on-chain fallback)
 * 5. Internal DB records (token_lifecycle, developer_tokens)
 * 
 * Replaces the old Solscan-based creator lookup path.
 */

import { getHeliusApiKey, getHeliusRestUrl, getHeliusRpcUrl } from './helius-client.ts';
import { fetchPumpFunCoin } from './pumpfun-fetch.ts';
import { assertUpdate } from './db-assert.ts';

export interface CreatorResolution {
  creatorWallet: string | null;
  source: 'pumpfun' | 'helius_mint_tx' | 'helius_das' | 'helius_rpc_onchain' | 'db_cache' | 'none';
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
  // Step 1: Pump.fun API via shared wrapper (primary for pump tokens)
  try {
    const data = await fetchPumpFunCoin(tokenMint, 'creator-resolver');
    if (data?.creator) {
      // Backfill token_lifecycle so downstream queries (e.g. "tokens minted
      // by this dev") don't return zero. Fire-and-forget — never block.
      try {
        if (supabase?.from) {
          await assertUpdate(
            supabase
              .from('token_lifecycle')
              .update({ creator_wallet: data.creator })
              .eq('token_mint', tokenMint)
              .is('creator_wallet', null),
            'token_lifecycle.creator_wallet',
          );
        }
      } catch (e) { throw e; }
      return {
        creatorWallet: data.creator,
        source: 'pumpfun',
        confidence: 100,
        errors: [],
      };
    }
  } catch (e) {
    apiErrors.push(`Pump.fun API error: ${e instanceof Error ? e.message : 'timeout'}`);
  }

  // Step 2: Helius TOKEN_MINT transaction proof
  const heliusKey = getHeliusApiKey();
  if (heliusKey) {
    try {
      const txUrl = getHeliusRestUrl(`/v0/addresses/${tokenMint}/transactions`, { type: 'TOKEN_MINT', limit: '5' });
      const txRes = await fetch(txUrl, { signal: AbortSignal.timeout(12000) });
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

    // Step 3: Helius DAS getAsset (reverse lookup)
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
        signal: AbortSignal.timeout(12000),
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

    // Step 4: Helius RPC on-chain fallback — getSignaturesForAddress on the mint
    // then parse the earliest transaction to find who initiated the mint
    try {
      const rpcUrl = getHeliusRpcUrl(heliusKey);
      
      // Get earliest signatures for the token mint address
      const sigRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'creator-sigs',
          method: 'getSignaturesForAddress',
          params: [tokenMint, { limit: 20 }],
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (sigRes.ok) {
        const sigData = await sigRes.json();
        const signatures = sigData?.result || [];
        
        if (signatures.length > 0) {
          // Use the OLDEST signature (last in array) — that's the mint/create tx
          const oldestSig = signatures[signatures.length - 1]?.signature;
          
          if (oldestSig) {
            await new Promise(r => setTimeout(r, 100)); // Rate limit
            
            const txRes = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'creator-tx',
                method: 'getTransaction',
                params: [oldestSig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
              }),
              signal: AbortSignal.timeout(12000),
            });

            if (txRes.ok) {
              const txData = await txRes.json();
              const tx = txData?.result;
              
              if (tx) {
                // The fee payer of the earliest transaction is the creator
                const accounts = tx.transaction?.message?.accountKeys || [];
                // Fee payer is always the first signer
                const feePayer = typeof accounts[0] === 'string' 
                  ? accounts[0] 
                  : accounts[0]?.pubkey;
                
                if (feePayer && feePayer !== tokenMint) {
                  console.log(`[CreatorResolver] RPC on-chain fallback resolved creator: ${feePayer.slice(0, 8)}... for ${tokenMint.slice(0, 8)}...`);
                  return {
                    creatorWallet: feePayer,
                    source: 'helius_rpc_onchain',
                    confidence: 90,
                    errors: [],
                  };
                }
              }
            }
          }
        }
      }
    } catch (e) {
      apiErrors.push(`Helius RPC on-chain error: ${e instanceof Error ? e.message : 'timeout'}`);
    }
  }

  // Step 5: Internal DB records
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
