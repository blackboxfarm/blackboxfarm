// Pump.fun bonding curve decoder
import type { BuyerRow } from "../first-buyers-utils.ts";

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

export async function tryHeliusEnhancedApi(
  tokenMint: string,
  heliusApiKey: string,
  limit: number
): Promise<Omit<BuyerRow, "rank">[]> {
  const results: Omit<BuyerRow, "rank">[] = [];
  
  try {
    const { getHeliusRpcUrl } = await import('../helius-client.ts');
    const rpcUrl = getHeliusRpcUrl(heliusApiKey);
    
    // Use Helius Enhanced Transactions API with mint search
    console.log('Calling Helius Enhanced Transactions API (mint search) for token:', tokenMint);
    
    const query = {
      jsonrpc: "2.0",
      id: "helius-first-buyers",
      method: "searchAssets",
      params: {
        ownerAddress: "",
        tokenType: "fungible",
        displayOptions: {
          showFungible: true
        },
        mintAddress: tokenMint,
        page: 1,
        limit: Math.min(limit, 100)
      }
    };

    let retries = 0;
    const maxRetries = 5;
    let lastError: any = null;

    while (retries < maxRetries) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query)
        });

        console.log('Helius response status:', response.status);

        if (response.status === 429) {
          retries++;
          const waitTime = 300 * retries; // Exponential backoff: 300ms, 600ms, 900ms, etc.
          console.log(`Helius 429 rate limit. Retrying in ${waitTime}ms (attempt ${retries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Helius API error: ${response.status} - ${errorText}`);
          lastError = new Error(`Helius API error: ${response.status}`);
          break;
        }

        const data = await response.json();
        
        if (data.error) {
          console.error('Helius API returned error:', data.error);
          lastError = data.error;
          break;
        }

        // For now, Helius searchAssets doesn't give us first buyers directly
        // We'll need to fall back to on-chain scanning
        console.log('⚠️ Helius API path not fully implemented for first buyers. Using on-chain fallback.');
        break;

      } catch (error: any) {
        console.error('Helius API request failed:', error);
        lastError = error;
        break;
      }
    }

    if (retries >= maxRetries) {
      console.error('❌ Helius API max retries exceeded');
    }

  } catch (error) {
    console.error('Error in tryHeliusEnhancedApi:', error);
  }

  return results;
}

export async function decodePumpFunBuy(
  tx: any,
  tokenMint: string
): Promise<{ wallet: string; amount_in?: string; timestamp: string } | null> {
  if (!tx) return null;

  try {
    const meta = tx.meta;
    const transaction = tx.transaction;
    const message = transaction?.message;
    
    if (!message || !meta) return null;

    const blockTime = tx.blockTime;
    if (!blockTime) return null;

    // Look for instructions that interact with the Pump.fun program
    const instructions = message.instructions || [];
    
    for (const ix of instructions) {
      const programId = typeof ix.programId === 'string' 
        ? ix.programId 
        : ix.programId?.toBase58?.() || '';
      
      if (programId === PUMP_PROGRAM_ID) {
        // Check if this instruction involves our token mint
        const accounts = ix.accounts || [];
        let involvesMint = false;
        
        // Check parsed instruction data
        if (ix.parsed) {
          const info = ix.parsed.info || {};
          if (info.mint === tokenMint) {
            involvesMint = true;
          }
        }
        
        // Check accounts list
        if (!involvesMint) {
          for (const account of accounts) {
            const accountKey = typeof account === 'string' 
              ? account 
              : account?.toBase58?.() || account?.pubkey?.toBase58?.() || '';
            if (accountKey === tokenMint) {
              involvesMint = true;
              break;
            }
          }
        }
        
        if (involvesMint) {
          // The first account is typically the buyer/signer
          const buyerAccount = accounts[0];
          const wallet = typeof buyerAccount === 'string'
            ? buyerAccount
            : buyerAccount?.toBase58?.() || buyerAccount?.pubkey?.toBase58?.() || '';
          
          if (wallet) {
            // Try to find SOL amount from balance changes
            let amountIn: string | undefined;
            
            if (meta.preBalances && meta.postBalances) {
              const preBalance = meta.preBalances[0] || 0;
              const postBalance = meta.postBalances[0] || 0;
              const diff = preBalance - postBalance;
              if (diff > 0) {
                amountIn = (diff / 1e9).toString(); // Convert lamports to SOL
              }
            }
            
            return {
              wallet,
              amount_in: amountIn,
              timestamp: new Date(blockTime * 1000).toISOString()
            };
          }
        }
      }
    }
  } catch (error) {
    console.error('Error decoding Pump.fun transaction:', error);
  }

  return null;
}
