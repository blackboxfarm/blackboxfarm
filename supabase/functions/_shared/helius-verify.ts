/**
 * HELIUS VERIFY - On-Chain Spend Verification
 * 
 * Replaces unreliable Solscan API with Helius for accurate:
 * - Actual SOL spent on buys (from balance deltas)
 * - Actual tokens received
 * - True entry price calculation
 * 
 * This is the source of truth for position costs.
 */

export interface VerifiedBuy {
  signature: string;
  tokenMint: string;
  walletAddress: string;
  solSpent: number;         // Actual SOL deducted from wallet
  tokensReceived: number;   // Actual tokens received (human-readable)
  tokensReceivedRaw: string; // Raw token amount as string for BigInt precision
  tokenDecimals: number;    // Token decimal places
  entryPriceUsd: number;    // True entry price: (solSpent * solPrice) / tokens
  solPrice: number;         // SOL price at verification time
  feesPaid: number;         // Transaction fees in SOL
  timestamp: number;        // Transaction timestamp
  platform: string;         // Detected DEX (Jupiter, Raydium, PumpFun, etc.)
  verified: boolean;
}

export interface VerifiedSell {
  signature: string;
  tokenMint: string;
  walletAddress: string;
  tokensSold: number;
  solReceived: number;
  exitPriceUsd: number;
  solPrice: number;
  feesPaid: number;
  timestamp: number;
  platform: string;
  verified: boolean;
}

/**
 * Fetch current SOL price for USD calculations
 */
async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const json = await res.json();
    const price = Number(json?.data?.SOL?.price);
    if (Number.isFinite(price) && price > 0) return price;
  } catch (e) {
    console.error("[HeliusVerify] Failed to fetch SOL price:", e);
  }
  return 200; // Fallback
}

/**
 * Parse enhanced transaction data from Helius
 */
interface HeliusTransaction {
  signature: string;
  type: string;
  source: string;
  fee: number;
  timestamp: number;
  feePayer: string;
  events?: {
    swap?: {
      nativeInput?: { account: string; amount: string };
      nativeOutput?: { account: string; amount: string };
      tokenInputs?: Array<{
        userAccount: string;
        tokenAccount: string;
        mint: string;
        rawTokenAmount: { tokenAmount: string; decimals: number };
      }>;
      tokenOutputs?: Array<{
        userAccount: string;
        tokenAccount: string;
        mint: string;
        rawTokenAmount: { tokenAmount: string; decimals: number };
      }>;
    };
  };
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: Array<{
      userAccount: string;
      tokenAccount: string;
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }>;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

/**
 * Verify a BUY transaction on-chain using Helius
 * Returns exact SOL spent and tokens received
 */
export async function verifyBuyTransaction(
  signature: string,
  tokenMint: string,
  walletAddress: string,
  heliusApiKey: string,
  retryCount: number = 3,
  retryDelayMs: number = 2000
): Promise<VerifiedBuy | null> {
  
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[HeliusVerify] Retry ${attempt + 1}/${retryCount} for ${signature.slice(0, 12)}...`);
        await new Promise(r => setTimeout(r, retryDelayMs * attempt));
      }
      
      const url = `https://api.helius.xyz/v0/transactions/`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': heliusApiKey },
        body: JSON.stringify({ transactions: [signature] }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (!res.ok) {
        console.error(`[HeliusVerify] HTTP ${res.status} for ${signature.slice(0, 12)}`);
        continue;
      }
      
      const data: HeliusTransaction[] = await res.json();
      
      if (!data || data.length === 0) {
        console.log(`[HeliusVerify] No data yet for ${signature.slice(0, 12)}...`);
        continue;
      }
      
      const tx = data[0];
      console.log(`[HeliusVerify] TX ${signature.slice(0, 12)}... type=${tx.type}, source=${tx.source}`);
      
      let solSpent = 0;
      let tokensReceived = 0;
      let tokensReceivedRaw = "0";
      let tokenDecimals = 6;
      
      // METHOD 1: Swap event (most reliable for DEX trades)
      if (tx.events?.swap) {
        const swap = tx.events.swap;
        
        // SOL spent = nativeInput for our wallet
        if (swap.nativeInput?.account === walletAddress) {
          solSpent = Number(swap.nativeInput.amount) / 1e9;
          console.log(`[HeliusVerify] Swap nativeInput: ${solSpent} SOL`);
        }
        
        // Tokens received = tokenOutput with our mint
        const tokenOut = swap.tokenOutputs?.find(t => t.mint === tokenMint);
        if (tokenOut) {
          tokenDecimals = tokenOut.rawTokenAmount.decimals;
          tokensReceivedRaw = tokenOut.rawTokenAmount.tokenAmount;
          tokensReceived = Number(tokensReceivedRaw) / Math.pow(10, tokenDecimals);
          console.log(`[HeliusVerify] Swap tokenOutput: ${tokensReceived} tokens (raw=${tokensReceivedRaw})`);
        }
      }
      
      // METHOD 2: Account data balance changes (fallback)
      if ((solSpent <= 0 || tokensReceived <= 0) && tx.accountData) {
        const walletData = tx.accountData.find(a => a.account === walletAddress);
        
        if (walletData) {
          // SOL spent = negative native balance change (excluding fees)
          if (walletData.nativeBalanceChange < 0) {
            // Note: This includes tx fees, so we add them back to get pure spend
            solSpent = Math.abs(walletData.nativeBalanceChange) / 1e9;
            // Subtract fee to get actual swap amount
            const feeInSol = tx.fee / 1e9;
            solSpent = Math.max(0, solSpent - feeInSol);
            console.log(`[HeliusVerify] Balance delta: ${solSpent} SOL (after fee ${feeInSol})`);
          }
          
          // Token received
          const tokenChange = walletData.tokenBalanceChanges?.find(t => t.mint === tokenMint);
          if (tokenChange) {
            tokenDecimals = tokenChange.rawTokenAmount.decimals;
            tokensReceivedRaw = tokenChange.rawTokenAmount.tokenAmount;
            const rawAmount = Number(tokensReceivedRaw);
            if (rawAmount > 0) {
              tokensReceived = rawAmount / Math.pow(10, tokenDecimals);
            }
          }
        }
        
        // Also check other accounts for token transfers TO our wallet
        if (tokensReceived <= 0) {
          for (const acc of tx.accountData) {
            const tc = acc.tokenBalanceChanges?.find(
              t => t.mint === tokenMint && t.userAccount === walletAddress
            );
            if (tc && Number(tc.rawTokenAmount.tokenAmount) > 0) {
              tokenDecimals = tc.rawTokenAmount.decimals;
              tokensReceivedRaw = tc.rawTokenAmount.tokenAmount;
              tokensReceived = Number(tokensReceivedRaw) / Math.pow(10, tokenDecimals);
              console.log(`[HeliusVerify] Found token in other account: ${tokensReceived} (raw=${tokensReceivedRaw})`);
              break;
            }
          }
        }
      }
      
      // Validate we got meaningful data
      if (solSpent <= 0 || tokensReceived <= 0) {
        console.warn(`[HeliusVerify] Incomplete data: sol=${solSpent}, tokens=${tokensReceived}`);
        continue;
      }
      
      // Calculate entry price
      const solPrice = await fetchSolPrice();
      const usdSpent = solSpent * solPrice;
      const entryPriceUsd = usdSpent / tokensReceived;
      
      console.log(`[HeliusVerify] ✅ VERIFIED BUY:`);
      console.log(`  SOL spent:     ${solSpent.toFixed(6)} SOL ($${usdSpent.toFixed(2)})`);
      console.log(`  Tokens:        ${tokensReceived.toLocaleString()}`);
      console.log(`  Entry price:   $${entryPriceUsd.toFixed(10)}`);
      console.log(`  Platform:      ${tx.source}`);
      
      return {
        signature,
        tokenMint,
        walletAddress,
        solSpent,
        tokensReceived,
        tokensReceivedRaw,
        tokenDecimals,
        entryPriceUsd,
        solPrice,
        feesPaid: tx.fee / 1e9,
        timestamp: tx.timestamp,
        platform: tx.source || 'unknown',
        verified: true,
      };
      
    } catch (e) {
      console.error(`[HeliusVerify] Error on attempt ${attempt + 1}:`, e);
    }
  }
  
  console.error(`[HeliusVerify] ❌ Failed to verify ${signature.slice(0, 12)} after ${retryCount} attempts`);
  return null;
}

/**
 * Verify a SELL transaction on-chain using Helius
 * Returns exact tokens sold and SOL received
 */
export async function verifySellTransaction(
  signature: string,
  tokenMint: string,
  walletAddress: string,
  heliusApiKey: string,
  retryCount: number = 3,
  retryDelayMs: number = 2000
): Promise<VerifiedSell | null> {
  
  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, retryDelayMs * attempt));
      }
      
      const url = `https://api.helius.xyz/v0/transactions/`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': heliusApiKey },
        body: JSON.stringify({ transactions: [signature] }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (!res.ok) continue;
      
      const data: HeliusTransaction[] = await res.json();
      if (!data || data.length === 0) continue;
      
      const tx = data[0];
      
      let tokensSold = 0;
      let solReceived = 0;
      
      // METHOD 1: Swap event
      if (tx.events?.swap) {
        const swap = tx.events.swap;
        
        // SOL received = nativeOutput for our wallet
        if (swap.nativeOutput?.account === walletAddress) {
          solReceived = Number(swap.nativeOutput.amount) / 1e9;
        }
        
        // Tokens sold = tokenInput with our mint
        const tokenIn = swap.tokenInputs?.find(t => t.mint === tokenMint);
        if (tokenIn) {
          const decimals = tokenIn.rawTokenAmount.decimals;
          tokensSold = Number(tokenIn.rawTokenAmount.tokenAmount) / Math.pow(10, decimals);
        }
      }
      
      // METHOD 2: Account data balance changes
      if ((solReceived <= 0 || tokensSold <= 0) && tx.accountData) {
        const walletData = tx.accountData.find(a => a.account === walletAddress);
        
        if (walletData) {
          // SOL received = positive native balance change
          if (walletData.nativeBalanceChange > 0) {
            solReceived = walletData.nativeBalanceChange / 1e9;
          }
          
          // Token sold (negative change)
          for (const acc of tx.accountData) {
            const tc = acc.tokenBalanceChanges?.find(
              t => t.mint === tokenMint && t.userAccount === walletAddress
            );
            if (tc && Number(tc.rawTokenAmount.tokenAmount) < 0) {
              const decimals = tc.rawTokenAmount.decimals;
              tokensSold = Math.abs(Number(tc.rawTokenAmount.tokenAmount)) / Math.pow(10, decimals);
              break;
            }
          }
        }
      }
      
      if (solReceived <= 0 || tokensSold <= 0) {
        console.warn(`[HeliusVerify] Incomplete sell data: sol=${solReceived}, tokens=${tokensSold}`);
        continue;
      }
      
      const solPrice = await fetchSolPrice();
      const usdReceived = solReceived * solPrice;
      const exitPriceUsd = usdReceived / tokensSold;
      
      console.log(`[HeliusVerify] ✅ VERIFIED SELL:`);
      console.log(`  Tokens sold:   ${tokensSold.toLocaleString()}`);
      console.log(`  SOL received:  ${solReceived.toFixed(6)} SOL ($${usdReceived.toFixed(2)})`);
      console.log(`  Exit price:    $${exitPriceUsd.toFixed(10)}`);
      
      return {
        signature,
        tokenMint,
        walletAddress,
        tokensSold,
        solReceived,
        exitPriceUsd,
        solPrice,
        feesPaid: tx.fee / 1e9,
        timestamp: tx.timestamp,
        platform: tx.source || 'unknown',
        verified: true,
      };
      
    } catch (e) {
      console.error(`[HeliusVerify] Sell verification error:`, e);
    }
  }
  
  return null;
}

/**
 * Update a position with verified on-chain data
 */
export async function updatePositionWithVerifiedBuy(
  supabase: any,
  positionId: string,
  verifiedBuy: VerifiedBuy
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("flip_positions")
      .update({
        buy_amount_sol: verifiedBuy.solSpent,
        buy_amount_usd: verifiedBuy.solSpent * verifiedBuy.solPrice,
        buy_price_usd: verifiedBuy.entryPriceUsd,
        quantity_tokens: verifiedBuy.tokensReceived,
        quantity_tokens_raw: verifiedBuy.tokensReceivedRaw,
        token_decimals: verifiedBuy.tokenDecimals,
        verified_on_chain: true,
        verification_source: 'helius',
        verified_at: new Date().toISOString(),
        swap_platform: verifiedBuy.platform,
      })
      .eq("id", positionId);
    
    if (error) {
      console.error(`[HeliusVerify] Failed to update position ${positionId}:`, error);
      return false;
    }
    
    console.log(`[HeliusVerify] Position ${positionId} updated with verified data`);
    return true;
    
  } catch (e) {
    console.error("[HeliusVerify] Update error:", e);
    return false;
  }
}
