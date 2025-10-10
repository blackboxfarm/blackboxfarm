// Raydium AMM decoder
import type { BuyerRow } from "../first-buyers-utils.ts";

const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CLMM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

export async function resolveRaydiumPools(
  tokenMint: string,
  rpcUrl: string
): Promise<{ poolAddress: string; programId: string }[]> {
  const pools: { poolAddress: string; programId: string }[] = [];
  
  try {
    // Try to find pools via DexScreener first (faster)
    const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (dexResponse.ok) {
      const dexData = await dexResponse.json();
      if (dexData.pairs && Array.isArray(dexData.pairs)) {
        for (const pair of dexData.pairs) {
          if (pair.dexId === 'raydium') {
            pools.push({
              poolAddress: pair.pairAddress,
              programId: RAYDIUM_AMM_V4
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error resolving Raydium pools via DexScreener:', error);
  }
  
  return pools;
}

export async function decodeRaydiumSwap(
  tx: any,
  poolInfo: { poolAddress: string; programId: string }
): Promise<{ wallet: string; amount_in?: string; timestamp: string } | null> {
  if (!tx) return null;

  try {
    const meta = tx.meta;
    const transaction = tx.transaction;
    const message = transaction?.message;
    
    if (!message || !meta || !tx.blockTime) return null;

    const instructions = message.instructions || [];
    
    for (const ix of instructions) {
      const programId = typeof ix.programId === 'string' 
        ? ix.programId 
        : ix.programId?.toBase58?.() || '';
      
      if (programId === poolInfo.programId) {
        const accounts = ix.accounts || [];
        
        // Check if this instruction involves our pool
        let involvesPool = false;
        for (const account of accounts) {
          const accountKey = typeof account === 'string'
            ? account
            : account?.toBase58?.() || account?.pubkey?.toBase58?.() || '';
          if (accountKey === poolInfo.poolAddress) {
            involvesPool = true;
            break;
          }
        }
        
        if (involvesPool) {
          // The first account is typically the user/signer
          const userAccount = accounts[0];
          const wallet = typeof userAccount === 'string'
            ? userAccount
            : userAccount?.toBase58?.() || userAccount?.pubkey?.toBase58?.() || '';
          
          if (wallet) {
            // Try to determine swap amount from balance changes
            let amountIn: string | undefined;
            
            if (meta.preBalances && meta.postBalances && meta.preBalances.length > 0) {
              const preBalance = meta.preBalances[0] || 0;
              const postBalance = meta.postBalances[0] || 0;
              const diff = preBalance - postBalance;
              if (diff > 0) {
                amountIn = (diff / 1e9).toString();
              }
            }
            
            return {
              wallet,
              amount_in: amountIn,
              timestamp: new Date(tx.blockTime * 1000).toISOString()
            };
          }
        }
      }
    }
  } catch (error) {
    console.error('Error decoding Raydium swap:', error);
  }

  return null;
}
