/**
 * HELIUS API - Enhanced Transaction Parsing
 * 
 * Uses Helius parseTransactions for pre-parsed swap data.
 * No calculation needed - just read the swap event data.
 */

export interface HeliusSwapInfo {
  tokenMint: string;
  tokenSymbol?: string;
  tokenDecimals: number;
  tokensReceived: number;
  tokensReceivedRaw: string; // Raw BigInt as string to preserve precision
  solSpent: number;
  fee: number;
  timestamp: number;
  platform: string;
  success: boolean;
}

interface SwapEvent {
  nativeInput?: { account: string; amount: string };
  nativeOutput?: { account: string; amount: string };
  tokenInputs?: TokenChange[];
  tokenOutputs?: TokenChange[];
}

interface TokenChange {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: {
    tokenAmount: string;
    decimals: number;
  };
}

interface ParsedTransaction {
  signature: string;
  type: string;
  source: string;
  fee: number;
  timestamp: number;
  events?: {
    swap?: SwapEvent;
  };
  accountData?: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: {
      userAccount: string;
      tokenAccount: string;
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }[];
  }[];
}

/**
 * Parse a BUY transaction using Helius enhanced API
 * Returns pre-parsed swap event data - the on-chain truth
 */
export async function parseBuyFromHelius(
  signature: string,
  tokenMint: string,
  walletPubkey: string,
  heliusApiKey: string
): Promise<HeliusSwapInfo | null> {
  try {
    const url = `https://api.helius.xyz/v0/transactions/`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': heliusApiKey },
      body: JSON.stringify({ transactions: [signature] }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      console.error(`Helius API error ${res.status}`);
      return null;
    }

    const data: ParsedTransaction[] = await res.json();
    
    if (!data || data.length === 0) {
      console.log(`No parsed data from Helius for ${signature.slice(0, 12)}...`);
      return null;
    }

    const tx = data[0];
    console.log(`Helius tx ${signature.slice(0, 12)}... type=${tx.type}, source=${tx.source}`);

    // METHOD 1: Use swap event if available (most reliable for DEX trades)
    if (tx.events?.swap) {
      const swap = tx.events.swap;
      
      // SOL spent (nativeInput)
      let solSpent = 0;
      if (swap.nativeInput?.account === walletPubkey) {
        solSpent = Number(swap.nativeInput.amount) / 1e9;
        console.log(`Swap nativeInput: ${solSpent} SOL`);
      }

      // Tokens received (tokenOutputs)
      let tokensReceived = 0;
      let tokensReceivedRaw = "0";
      let tokenDecimals = 6;
      
      const tokenOut = swap.tokenOutputs?.find(t => t.mint === tokenMint);
      if (tokenOut) {
        tokenDecimals = tokenOut.rawTokenAmount.decimals;
        tokensReceivedRaw = tokenOut.rawTokenAmount.tokenAmount;
        tokensReceived = Number(tokensReceivedRaw) / Math.pow(10, tokenDecimals);
        console.log(`Swap tokenOutput: ${tokensReceived} tokens (raw=${tokensReceivedRaw}, ${tokenDecimals} decimals)`);
      }

      if (solSpent > 0 && tokensReceived > 0) {
        console.log(`VERIFIED BUY (swap event): ${solSpent} SOL → ${tokensReceived} tokens on ${tx.source}`);
        return {
          tokenMint,
          tokenDecimals,
          tokensReceived,
          tokensReceivedRaw,
          solSpent,
          fee: tx.fee / 1e9,
          timestamp: tx.timestamp,
          platform: tx.source || 'unknown',
          success: true
        };
      }
    }

    // METHOD 2: Use accountData balance changes (fallback, but accurate)
    if (tx.accountData) {
      const walletData = tx.accountData.find(a => a.account === walletPubkey);
      
      if (walletData) {
        // SOL spent = negative balance change
        const solSpent = walletData.nativeBalanceChange < 0 
          ? Math.abs(walletData.nativeBalanceChange) / 1e9 
          : 0;

        // Token received
        let tokensReceived = 0;
        let tokensReceivedRaw = "0";
        let tokenDecimals = 6;

        const tokenChange = walletData.tokenBalanceChanges?.find(t => t.mint === tokenMint);
        if (tokenChange) {
          tokenDecimals = tokenChange.rawTokenAmount.decimals;
          tokensReceivedRaw = tokenChange.rawTokenAmount.tokenAmount;
          tokensReceived = Number(tokensReceivedRaw) / Math.pow(10, tokenDecimals);
        }

        // Also check other accounts for token transfers TO our wallet
        if (tokensReceived <= 0) {
          for (const acc of tx.accountData) {
            const tc = acc.tokenBalanceChanges?.find(
              t => t.mint === tokenMint && t.userAccount === walletPubkey
            );
            if (tc && Number(tc.rawTokenAmount.tokenAmount) > 0) {
              tokenDecimals = tc.rawTokenAmount.decimals;
              tokensReceivedRaw = tc.rawTokenAmount.tokenAmount;
              tokensReceived = Number(tokensReceivedRaw) / Math.pow(10, tokenDecimals);
              break;
            }
          }
        }

        if (solSpent > 0 && tokensReceived > 0) {
          console.log(`VERIFIED BUY (accountData): ${solSpent} SOL → ${tokensReceived} tokens on ${tx.source}`);
          return {
            tokenMint,
            tokenDecimals,
            tokensReceived,
            tokensReceivedRaw,
            solSpent,
            fee: tx.fee / 1e9,
            timestamp: tx.timestamp,
            platform: tx.source || 'unknown',
            success: true
          };
        }

        console.log(`accountData: solSpent=${solSpent}, tokensReceived=${tokensReceived}`);
      }
    }

    console.log(`Could not extract buy data from Helius for ${signature.slice(0, 12)}...`);
    return null;

  } catch (e) {
    console.error(`Helius parse failed for ${signature}:`, e);
    return null;
  }
}

/**
 * Parse a SELL transaction using Helius enhanced API
 */
export async function parseSellFromHelius(
  signature: string,
  tokenMint: string,
  walletPubkey: string,
  heliusApiKey: string
): Promise<{
  tokensSold: number;
  solReceived: number;
  fee: number;
  timestamp: number;
  platform: string;
  success: boolean;
} | null> {
  try {
    const url = `https://api.helius.xyz/v0/transactions/`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': heliusApiKey },
      body: JSON.stringify({ transactions: [signature] }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      return null;
    }

    const data: ParsedTransaction[] = await res.json();
    
    if (!data || data.length === 0) {
      return null;
    }

    const tx = data[0];

    // Use swap event if available
    if (tx.events?.swap) {
      const swap = tx.events.swap;
      
      // SOL received (nativeOutput)
      let solReceived = 0;
      if (swap.nativeOutput?.account === walletPubkey) {
        solReceived = Number(swap.nativeOutput.amount) / 1e9;
      }

      // Tokens sold (tokenInputs)
      let tokensSold = 0;
      const tokenIn = swap.tokenInputs?.find(t => t.mint === tokenMint);
      if (tokenIn) {
        const decimals = tokenIn.rawTokenAmount.decimals;
        tokensSold = Number(tokenIn.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);
      }

      if (solReceived > 0 && tokensSold > 0) {
        console.log(`VERIFIED SELL: ${tokensSold} tokens → ${solReceived} SOL on ${tx.source}`);
        return {
          tokensSold,
          solReceived,
          fee: tx.fee / 1e9,
          timestamp: tx.timestamp,
          platform: tx.source || 'unknown',
          success: true
        };
      }
    }

    // Fallback to accountData
    if (tx.accountData) {
      const walletData = tx.accountData.find(a => a.account === walletPubkey);
      
      if (walletData) {
        const solReceived = walletData.nativeBalanceChange > 0 
          ? walletData.nativeBalanceChange / 1e9 
          : 0;

        let tokensSold = 0;
        for (const acc of tx.accountData) {
          const tc = acc.tokenBalanceChanges?.find(
            t => t.mint === tokenMint && t.userAccount === walletPubkey
          );
          if (tc && Number(tc.rawTokenAmount.tokenAmount) < 0) {
            const decimals = tc.rawTokenAmount.decimals;
            tokensSold = Math.abs(Number(tc.rawTokenAmount.tokenAmount)) / Math.pow(10, decimals);
            break;
          }
        }

        if (solReceived > 0 && tokensSold > 0) {
          return {
            tokensSold,
            solReceived,
            fee: tx.fee / 1e9,
            timestamp: tx.timestamp,
            platform: tx.source || 'unknown',
            success: true
          };
        }
      }
    }

    return null;

  } catch (e) {
    console.error(`Helius sell parse failed for ${signature}:`, e);
    return null;
  }
}
