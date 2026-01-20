/**
 * VENUE-AWARE EXECUTABLE QUOTE PROVIDER
 * 
 * Gets executable quotes from the ACTUAL venue that will execute the trade:
 * - pump.fun on-curve: bonding curve math
 * - bags.fm on-curve: PumpPortal simulation
 * - bonk.fun on-curve: PumpPortal simulation  
 * - graduated tokens: Jupiter quote
 * 
 * This prevents the mismatch where we validate against Jupiter but execute via PumpPortal.
 */

export interface VenueQuote {
  venue: 'pumpfun' | 'bags_fm' | 'bonk_fun' | 'jupiter' | 'unknown';
  isOnCurve: boolean;
  executablePriceUsd: number;
  tokensOut: number;
  solSpent: number;
  priceImpactPct: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  simulationUsed?: boolean;
}

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const METEORA_DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const RAYDIUM_LAUNCHLAB_PROGRAM_ID = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';

/**
 * Detect which venue will execute a trade for a given token
 */
export async function detectVenue(
  tokenMint: string,
  heliusApiKey?: string
): Promise<{ venue: VenueQuote['venue']; isOnCurve: boolean }> {
  // Check pump.fun via API first (fastest)
  try {
    const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    
    if (pumpRes.ok) {
      const data = await pumpRes.json();
      if (data && !data.complete) {
        return { venue: 'pumpfun', isOnCurve: true };
      }
      if (data && data.complete) {
        // Graduated pump.fun token - goes to Jupiter/Raydium
        return { venue: 'jupiter', isOnCurve: false };
      }
    }
  } catch (e) {
    console.log('[VenueDetect] pump.fun API check failed:', e);
  }

  // Check for bags.fm / bonk.fun via DexScreener dexId
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      signal: AbortSignal.timeout(3000)
    });
    
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pairs = dexData?.pairs || [];
      
      for (const pair of pairs) {
        const dexId = (pair.dexId || '').toLowerCase();
        const pairUrl = (pair.url || '').toLowerCase();
        
        // bags.fm uses Meteora DBC
        if (dexId.includes('meteora') && pairUrl.includes('bags')) {
          // Check if still on curve (not graduated)
          if (heliusApiKey) {
            const curveCheck = await checkMeteoraDBC(tokenMint, heliusApiKey);
            if (curveCheck?.isOnCurve) {
              return { venue: 'bags_fm', isOnCurve: true };
            }
          }
          return { venue: 'bags_fm', isOnCurve: false };
        }
        
        // bonk.fun uses Raydium Launchlab
        if (dexId.includes('raydium') && pairUrl.includes('bonk')) {
          if (heliusApiKey) {
            const curveCheck = await checkRaydiumLaunchlab(tokenMint, heliusApiKey);
            if (curveCheck?.isOnCurve) {
              return { venue: 'bonk_fun', isOnCurve: true };
            }
          }
          return { venue: 'bonk_fun', isOnCurve: false };
        }
      }
      
      // Has DexScreener pairs but not a special venue - it's graduated
      if (pairs.length > 0) {
        return { venue: 'jupiter', isOnCurve: false };
      }
    }
  } catch (e) {
    console.log('[VenueDetect] DexScreener check failed:', e);
  }

  // Default to unknown - will use Jupiter
  return { venue: 'unknown', isOnCurve: false };
}

/**
 * Quick check for Meteora DBC on-curve status
 */
async function checkMeteoraDBC(tokenMint: string, heliusApiKey: string): Promise<{ isOnCurve: boolean } | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(METEORA_DBC_PROGRAM_ID);
    
    // Get program accounts that might be pools for this token
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [{ dataSize: 400 }],
      commitment: 'confirmed',
    });

    const mintBuffer = new PublicKey(tokenMint).toBuffer();
    const mintHex = Array.from(mintBuffer).map(b => b.toString(16).padStart(2, '0')).join('');

    for (const { account } of accounts) {
      const dataHex = Array.from(account.data).map(b => b.toString(16).padStart(2, '0')).join('');
      if (dataHex.includes(mintHex)) {
        // Found a pool - assume on curve (detailed check done elsewhere)
        return { isOnCurve: true };
      }
    }
    
    return null;
  } catch (e) {
    console.log('[checkMeteoraDBC] Failed:', e);
    return null;
  }
}

/**
 * Quick check for Raydium Launchlab on-curve status
 */
async function checkRaydiumLaunchlab(tokenMint: string, heliusApiKey: string): Promise<{ isOnCurve: boolean } | null> {
  try {
    const { Connection, PublicKey } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    const programId = new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID);
    const mint = new PublicKey(tokenMint);
    
    // Derive pool PDA
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), mint.toBuffer()],
      programId
    );

    const tokenAccounts = await connection.getTokenAccountsByOwner(poolPda, { mint });
    
    if (tokenAccounts.value.length > 0) {
      // Has tokens in vault = still on curve
      return { isOnCurve: true };
    }
    
    return { isOnCurve: false };
  } catch (e) {
    console.log('[checkRaydiumLaunchlab] Failed:', e);
    return null;
  }
}

/**
 * Get SOL price for USD conversions
 */
async function getSolPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      const price = Number(json?.data?.['So11111111111111111111111111111111111111112']?.price);
      if (price > 0) return price;
    }
  } catch (e) {}
  
  return 180; // Fallback
}

/**
 * Simulate PumpPortal transaction to get exact executable quote
 * This is the ONLY reliable way to know what price we'll get on bonding curve tokens
 */
export async function simulatePumpPortalTrade(
  tokenMint: string,
  solAmountLamports: number,
  walletPubkey: string,
  heliusApiKey: string,
  slippageBps: number = 500
): Promise<VenueQuote | null> {
  try {
    console.log(`[PumpPortal Sim] Simulating trade: ${solAmountLamports} lamports for ${tokenMint}`);
    
    // Build PumpPortal transaction (same as raydium-swap does)
    const tradeRes = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: walletPubkey,
        action: 'buy',
        mint: tokenMint,
        amount: solAmountLamports / 1e9, // SOL amount
        denominatedInSol: 'true',
        slippage: slippageBps / 100, // PumpPortal uses percentage
        priorityFee: 0.0005, // Minimal for simulation
        pool: 'auto'
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!tradeRes.ok) {
      const errText = await tradeRes.text();
      console.log(`[PumpPortal Sim] Trade API returned ${tradeRes.status}: ${errText}`);
      return null;
    }

    // PumpPortal returns base64-encoded transaction
    const txData = await tradeRes.arrayBuffer();
    const txBase64 = btoa(String.fromCharCode(...new Uint8Array(txData)));
    
    // Simulate via Helius RPC
    const { Connection, Transaction, VersionedTransaction } = await import('npm:@solana/web3.js@1.95.3');
    
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      'confirmed'
    );

    // Decode transaction
    const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));
    let tx: Transaction | VersionedTransaction;
    
    try {
      tx = VersionedTransaction.deserialize(txBytes);
    } catch {
      tx = Transaction.from(txBytes);
    }

    // Simulate
    const simResult = await connection.simulateTransaction(tx as VersionedTransaction, {
      replaceRecentBlockhash: true,
      sigVerify: false,
    });

    if (simResult.value.err) {
      console.log(`[PumpPortal Sim] Simulation failed:`, simResult.value.err);
      return null;
    }

    // Parse token balance changes from simulation logs
    // This is tricky - we need to look at the logs for token amounts
    const logs = simResult.value.logs || [];
    let tokensOut = 0;
    
    for (const log of logs) {
      // PumpPortal logs include the output amount
      const match = log.match(/Token amount: (\d+)/i) || log.match(/output.*?(\d+)/i);
      if (match) {
        tokensOut = Number(match[1]);
        break;
      }
    }

    // If we couldn't parse from logs, try to estimate from curve math
    if (tokensOut === 0) {
      console.log('[PumpPortal Sim] Could not parse tokens from simulation, using curve estimate');
      return null;
    }

    const solPrice = await getSolPrice();
    const solSpent = solAmountLamports / 1e9;
    const usdSpent = solSpent * solPrice;
    const executablePriceUsd = tokensOut > 0 ? usdSpent / (tokensOut / 1e6) : 0;

    console.log(`[PumpPortal Sim] Result: ${tokensOut} tokens for ${solSpent} SOL @ $${executablePriceUsd.toFixed(10)}`);

    return {
      venue: 'pumpfun', // PumpPortal handles all curve venues
      isOnCurve: true,
      executablePriceUsd,
      tokensOut: tokensOut / 1e6, // Convert to human-readable
      solSpent,
      priceImpactPct: (solSpent / 30) * 100, // Rough estimate based on typical curve liquidity
      confidence: 'high',
      source: 'pumpportal_simulation',
      simulationUsed: true
    };
  } catch (e) {
    console.error('[PumpPortal Sim] Error:', e);
    return null;
  }
}

/**
 * Get venue-aware executable quote
 * 
 * Uses the SAME venue that will actually execute the trade:
 * - pump.fun API quote for pump.fun tokens
 * - PumpPortal simulation for bags.fm/bonk.fun on-curve tokens
 * - Jupiter quote for graduated tokens
 */
export async function getVenueAwareQuote(
  tokenMint: string,
  solAmountLamports: number,
  walletPubkey: string,
  options: {
    heliusApiKey?: string;
    slippageBps?: number;
  } = {}
): Promise<VenueQuote | null> {
  const { heliusApiKey, slippageBps = 500 } = options;
  
  // Detect venue first
  const { venue, isOnCurve } = await detectVenue(tokenMint, heliusApiKey);
  
  console.log(`[VenueQuote] Token ${tokenMint.slice(0, 8)}... detected as: ${venue}, onCurve=${isOnCurve}`);
  
  const solPrice = await getSolPrice();
  const solSpent = solAmountLamports / 1e9;
  const usdSpent = solSpent * solPrice;
  
  // ============================================
  // PUMP.FUN ON-CURVE: Use bonding curve math
  // ============================================
  if (venue === 'pumpfun' && isOnCurve) {
    try {
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      
      if (pumpRes.ok) {
        const data = await pumpRes.json();
        const virtualSolReserves = Number(data.virtual_sol_reserves);
        const virtualTokenReserves = Number(data.virtual_token_reserves);
        
        if (virtualSolReserves && virtualTokenReserves) {
          // Constant product AMM math
          const newSolReserves = virtualSolReserves + solAmountLamports;
          const newTokenReserves = (virtualSolReserves * virtualTokenReserves) / newSolReserves;
          const tokensOutRaw = virtualTokenReserves - newTokenReserves;
          const tokensOut = tokensOutRaw / 1e6; // 6 decimals
          
          const executablePriceUsd = tokensOut > 0 ? usdSpent / tokensOut : 0;
          const priceImpactPct = (solAmountLamports / virtualSolReserves) * 100;
          
          return {
            venue: 'pumpfun',
            isOnCurve: true,
            executablePriceUsd,
            tokensOut,
            solSpent,
            priceImpactPct,
            confidence: 'high',
            source: 'pumpfun_curve_math'
          };
        }
      }
    } catch (e) {
      console.log('[VenueQuote] pump.fun curve quote failed:', e);
    }
  }
  
  // ============================================
  // BAGS.FM / BONK.FUN ON-CURVE: Use PumpPortal simulation
  // These tokens execute via PumpPortal but Jupiter doesn't know them
  // ============================================
  if ((venue === 'bags_fm' || venue === 'bonk_fun') && isOnCurve && heliusApiKey) {
    const simQuote = await simulatePumpPortalTrade(
      tokenMint,
      solAmountLamports,
      walletPubkey,
      heliusApiKey,
      slippageBps
    );
    
    if (simQuote) {
      simQuote.venue = venue;
      return simQuote;
    }
    
    // Fallback: try to get price from DexScreener and estimate
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
        signal: AbortSignal.timeout(3000)
      });
      
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        // Use highest liquidity pair
        const pairs = (dexData?.pairs || []).sort((a: any, b: any) => 
          (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0)
        );
        const pair = pairs[0];
        
        if (pair?.priceUsd) {
          const priceUsd = Number(pair.priceUsd);
          const estimatedTokens = usdSpent / priceUsd;
          
          return {
            venue,
            isOnCurve: true,
            executablePriceUsd: priceUsd,
            tokensOut: estimatedTokens,
            solSpent,
            priceImpactPct: 5, // Estimate
            confidence: 'low', // DexScreener price may not match execution
            source: 'dexscreener_estimate'
          };
        }
      }
    } catch (e) {
      console.log('[VenueQuote] DexScreener fallback failed:', e);
    }
  }
  
  // ============================================
  // GRADUATED TOKENS: Use Jupiter quote
  // ============================================
  try {
    const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${solAmountLamports}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    
    const res = await fetch(quoteUrl, {
      headers: { 
        "Accept": "application/json",
        ...(jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}),
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (res.ok) {
      const quote = await res.json();
      
      if (quote?.outAmount) {
        const outputDecimals = quote.outputMint?.decimals || 6;
        const tokensOut = Number(quote.outAmount) / Math.pow(10, outputDecimals);
        const priceImpactPct = Number(quote.priceImpactPct || 0);
        const executablePriceUsd = tokensOut > 0 ? usdSpent / tokensOut : 0;
        
        return {
          venue: 'jupiter',
          isOnCurve: false,
          executablePriceUsd,
          tokensOut,
          solSpent,
          priceImpactPct,
          confidence: 'high',
          source: 'jupiter_quote'
        };
      }
    }
  } catch (e) {
    console.log('[VenueQuote] Jupiter quote failed:', e);
  }
  
  return null;
}
