/**
 * SOLSCAN API v2.0 - Direct On-Chain Truth
 * 
 * Solscan provides PRE-PARSED transaction data:
 * - sol_bal_change: exact SOL balance changes per account
 * - token_bal_change: exact token balance changes per account
 * 
 * NO CALCULATION NEEDED - just read the data.
 */

export interface SolscanSwapInfo {
  tokenMint: string;
  tokenSymbol?: string;
  tokenDecimals: number;
  tokensReceived: number;
  solSpent: number;
  fee: number;
  timestamp: number;
  platform: string;
  success: boolean;
}

interface SolBalChange {
  address: string;
  pre_balance: number;
  post_balance: number;
  change_amount: number;  // In lamports, negative = spent
}

interface TokenBalChange {
  address: string;
  token_address: string;
  token_decimals: number;
  token_name?: string;
  token_symbol?: string;
  pre_balance: string;
  post_balance: string;
  change_amount: number;  // Already human-readable with decimals applied
  pre_owner?: string;
  post_owner?: string;
}

interface SolscanTxDetailV2 {
  success: boolean;
  data: {
    tx_hash: string;
    block_id: number;
    block_time: number;
    fee: number;  // Lamports
    status: number;  // 1 = success
    sol_bal_change: SolBalChange[];
    token_bal_change: TokenBalChange[];
    programs_involved: string[];
    signer: string[];
  };
}

/**
 * Fetch transaction from Solscan Pro API v2.0
 * Returns pre-parsed balance changes - the on-chain truth
 */
export async function fetchTransactionFromSolscan(
  signature: string,
  solscanApiKey: string
): Promise<SolscanTxDetailV2 | null> {
  try {
    // Solscan Pro API v2.0 uses query param and 'token' header
    const url = `https://pro-api.solscan.io/v2.0/transaction/detail?tx=${signature}`;
    
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'token': solscanApiKey  // v2.0 uses 'token' header
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Solscan API error ${res.status}: ${errText}`);
      return null;
    }

    const json: SolscanTxDetailV2 = await res.json();
    
    if (!json.success || !json.data) {
      console.error(`Solscan returned success=false for ${signature}`);
      return null;
    }

    return json;
  } catch (e) {
    console.error(`Solscan fetch failed for ${signature}:`, e);
    return null;
  }
}

/**
 * Parse a BUY transaction - wallet spends SOL, receives tokens
 * Uses pre-parsed balance changes from Solscan - no calculation
 */
export async function parseBuyFromSolscan(
  signature: string,
  tokenMint: string,
  walletPubkey: string,
  solscanApiKey: string
): Promise<SolscanSwapInfo | null> {
  const tx = await fetchTransactionFromSolscan(signature, solscanApiKey);
  
  if (!tx) {
    console.log(`No tx data from Solscan for ${signature.slice(0, 12)}...`);
    return null;
  }

  const data = tx.data;
  
  // Check transaction succeeded
  if (data.status !== 1) {
    console.log(`Transaction failed, status=${data.status}`);
    return null;
  }

  console.log(`Solscan tx ${signature.slice(0, 12)}... block=${data.block_id}, fee=${data.fee}`);

  // 1. Find SOL spent by wallet (negative change_amount = spent)
  let solSpentLamports = 0;
  const walletSolChange = data.sol_bal_change?.find(c => c.address === walletPubkey);
  
  if (walletSolChange) {
    // change_amount is negative when SOL is spent
    solSpentLamports = Math.abs(walletSolChange.change_amount);
    console.log(`Wallet SOL change: ${walletSolChange.change_amount} lamports (spent ${solSpentLamports})`);
  }

  // 2. Find tokens received by wallet (positive change_amount)
  let tokensReceived = 0;
  let tokenDecimals = 6;
  let tokenSymbol: string | undefined;

  const tokenChange = data.token_bal_change?.find(
    c => c.token_address === tokenMint && c.change_amount > 0
  );

  if (tokenChange) {
    tokenDecimals = tokenChange.token_decimals || 6;
    // Solscan returns raw amounts - divide by 10^decimals for human-readable
    tokensReceived = tokenChange.change_amount / Math.pow(10, tokenDecimals);
    tokenSymbol = tokenChange.token_symbol;
    console.log(`Token received: ${tokensReceived} ${tokenSymbol || tokenMint.slice(0, 8)} (raw=${tokenChange.change_amount}, decimals=${tokenDecimals})`);
  }

  // Validate we have what we need
  if (tokensReceived <= 0) {
    console.log(`No tokens received for mint ${tokenMint}`);
    return null;
  }

  if (solSpentLamports <= 0) {
    console.log(`No SOL spent detected for wallet ${walletPubkey}`);
    return null;
  }

  // 3. Determine platform from program IDs
  let platform = 'unknown';
  const programs = data.programs_involved || [];
  
  if (programs.some(p => p.includes('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'))) {
    platform = 'pump.fun';
  } else if (programs.some(p => p.includes('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'))) {
    platform = 'raydium';
  } else if (programs.some(p => p.includes('JUP'))) {
    platform = 'jupiter';
  }

  const solSpent = solSpentLamports / 1e9;
  const fee = data.fee / 1e9;

  console.log(`VERIFIED BUY: ${solSpent} SOL → ${tokensReceived} ${tokenSymbol || 'tokens'} on ${platform}`);

  return {
    tokenMint,
    tokenSymbol,
    tokenDecimals,
    tokensReceived,
    solSpent,
    fee,
    timestamp: data.block_time,
    platform,
    success: true
  };
}

/**
 * Parse a SELL transaction - wallet spends tokens, receives SOL
 */
export async function parseSellFromSolscan(
  signature: string,
  tokenMint: string,
  walletPubkey: string,
  solscanApiKey: string
): Promise<{
  tokensSold: number;
  solReceived: number;
  fee: number;
  timestamp: number;
  platform: string;
  success: boolean;
} | null> {
  const tx = await fetchTransactionFromSolscan(signature, solscanApiKey);
  
  if (!tx || tx.data.status !== 1) {
    return null;
  }

  const data = tx.data;

  // 1. Find SOL received by wallet (positive change_amount)
  let solReceivedLamports = 0;
  const walletSolChange = data.sol_bal_change?.find(c => c.address === walletPubkey);
  
  if (walletSolChange && walletSolChange.change_amount > 0) {
    solReceivedLamports = walletSolChange.change_amount;
  }

  // 2. Find tokens sold by wallet (negative change_amount)
  let tokensSold = 0;
  let tokenDecimals = 6;
  const tokenChange = data.token_bal_change?.find(
    c => c.token_address === tokenMint && c.change_amount < 0
  );

  if (tokenChange) {
    tokenDecimals = tokenChange.token_decimals || 6;
    // Solscan returns raw amounts - divide by 10^decimals for human-readable
    tokensSold = Math.abs(tokenChange.change_amount) / Math.pow(10, tokenDecimals);
  }

  if (tokensSold <= 0 || solReceivedLamports <= 0) {
    return null;
  }

  // Determine platform
  let platform = 'unknown';
  const programs = data.programs_involved || [];
  
  if (programs.some(p => p.includes('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'))) {
    platform = 'pump.fun';
  } else if (programs.some(p => p.includes('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'))) {
    platform = 'raydium';
  } else if (programs.some(p => p.includes('JUP'))) {
    platform = 'jupiter';
  }

  console.log(`VERIFIED SELL: ${tokensSold} tokens → ${solReceivedLamports / 1e9} SOL on ${platform}`);

  return {
    tokensSold,
    solReceived: solReceivedLamports / 1e9,
    fee: data.fee / 1e9,
    timestamp: data.block_time,
    platform,
    success: true
  };
}
