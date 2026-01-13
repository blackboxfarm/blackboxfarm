/**
 * SOLSCAN API - Clean On-Chain Truth
 * 
 * Use Solscan for VERIFICATION (post-trade accuracy).
 * Use Helius for EXECUTION (speed).
 * 
 * Solscan provides pre-parsed transaction data - no calculation needed.
 */

export interface SolscanSwapInfo {
  tokenMint: string;
  tokenSymbol?: string;
  tokenDecimals: number;
  tokensReceived: number;      // Already parsed, human-readable amount
  tokensReceivedRaw: string;   // Raw amount as string
  solSpent: number;            // Exact SOL spent
  solSpentLamports: number;    // Lamports
  fee: number;                 // Transaction fee in SOL
  feeLamports: number;
  timestamp: number;           // Unix timestamp
  platform: string;            // DEX/Platform used
  success: boolean;
}

export interface SolscanTokenTransfer {
  token_address: string;
  token_name?: string;
  token_symbol?: string;
  token_decimals: number;
  amount: number;
  amount_str: string;
  flow: 'in' | 'out';
  owner: string;
}

export interface SolscanSolTransfer {
  source: string;
  destination: string;
  amount: number;  // In lamports
  amount_str: string;
  flow: 'in' | 'out';
}

export interface SolscanTransactionDetail {
  signature: string;
  block_time: number;
  status: string;
  fee: number;  // Lamports
  signer: string[];
  token_transfers?: SolscanTokenTransfer[];
  sol_transfers?: SolscanSolTransfer[];
  parsed_instruction?: any[];
  program_ids?: string[];
}

/**
 * Fetch parsed transaction from Solscan Pro API v1.0
 * Uses the /transaction endpoint for detailed transaction data
 * This gives us EXACT on-chain values - no calculation needed
 */
export async function fetchTransactionFromSolscan(
  signature: string,
  solscanApiKey: string
): Promise<SolscanTransactionDetail | null> {
  try {
    // Use v1.0 endpoint which has transaction detail
    const res = await fetch(
      `https://pro-api.solscan.io/v1.0/transaction/${signature}`,
      {
        headers: {
          'Accept': 'application/json',
          'token': solscanApiKey
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!res.ok) {
      console.log(`Solscan API v1 returned ${res.status} for ${signature}`);
      
      // Try public API as fallback (rate limited but works)
      const publicRes = await fetch(
        `https://api.solscan.io/transaction?tx=${signature}`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        }
      );
      
      if (!publicRes.ok) {
        console.log(`Solscan public API also failed: ${publicRes.status}`);
        return null;
      }
      
      const publicJson = await publicRes.json();
      if (publicJson && publicJson.status === 'Success') {
        return mapPublicApiResponse(publicJson);
      }
      return null;
    }

    const json = await res.json();
    
    // v1.0 returns data directly, not wrapped in {success, data}
    if (!json || json.error) {
      console.log(`Solscan API v1 error for ${signature}:`, json?.error || 'no data');
      return null;
    }

    return mapV1ApiResponse(json);
  } catch (e) {
    console.error(`Solscan fetch failed for ${signature}:`, e);
    return null;
  }
}

function mapV1ApiResponse(json: any): SolscanTransactionDetail | null {
  try {
    return {
      signature: json.txHash || json.signature,
      block_time: json.blockTime,
      status: json.status || 'Success',
      fee: json.fee || 0,
      signer: json.signer || [],
      token_transfers: json.tokenTransfers?.map((t: any) => ({
        token_address: t.token?.address || t.mint,
        token_name: t.token?.name,
        token_symbol: t.token?.symbol,
        token_decimals: t.token?.decimals || 9,
        amount: t.amount || t.tokenAmount,
        amount_str: String(t.amount || t.tokenAmount),
        flow: t.fromAddress === json.signer?.[0] ? 'out' : 'in',
        owner: t.toAddress || t.fromAddress
      })),
      sol_transfers: json.solTransfers?.map((t: any) => ({
        source: t.source,
        destination: t.destination,
        amount: t.amount,
        amount_str: String(t.amount),
        flow: t.source === json.signer?.[0] ? 'out' : 'in'
      })),
      program_ids: json.programIds
    };
  } catch (e) {
    console.error('Error mapping v1 API response:', e);
    return null;
  }
}

function mapPublicApiResponse(json: any): SolscanTransactionDetail | null {
  try {
    return {
      signature: json.txHash,
      block_time: json.blockTime,
      status: json.status,
      fee: json.fee || 0,
      signer: json.signer || [],
      token_transfers: json.tokenTransfers?.map((t: any) => ({
        token_address: t.token?.address || t.mint,
        token_name: t.token?.name,
        token_symbol: t.token?.symbol,
        token_decimals: t.token?.decimals || 9,
        amount: t.amount,
        amount_str: String(t.amount),
        flow: t.change_type === 'dec' ? 'out' : 'in',
        owner: t.owner || t.to_address || t.from_address
      })),
      sol_transfers: json.solTransfers?.map((t: any) => ({
        source: t.source,
        destination: t.destination,
        amount: t.amount,
        amount_str: String(t.amount),
        flow: t.change_type === 'dec' ? 'out' : 'in'
      })),
      program_ids: json.programIds
    };
  } catch (e) {
    console.error('Error mapping public API response:', e);
    return null;
  }
}

/**
 * Parse a buy transaction from Solscan data
 * Returns pre-calculated values - the on-chain truth
 */
export async function parseBuyFromSolscan(
  signature: string,
  tokenMint: string,
  walletPubkey: string,
  solscanApiKey: string
): Promise<SolscanSwapInfo | null> {
  const tx = await fetchTransactionFromSolscan(signature, solscanApiKey);
  
  if (!tx) {
    return null;
  }

  console.log(`Solscan tx ${signature.slice(0, 12)}... status=${tx.status}, fee=${tx.fee}`);

  // Check if transaction succeeded
  if (tx.status !== 'Success') {
    console.log(`Transaction failed: ${tx.status}`);
    return null;
  }

  // Find token transfer IN to our wallet (the buy)
  let tokensReceived = 0;
  let tokensReceivedRaw = '0';
  let tokenDecimals = 6;
  let tokenSymbol: string | undefined;

  if (tx.token_transfers && tx.token_transfers.length > 0) {
    const inboundTransfer = tx.token_transfers.find(
      t => t.token_address === tokenMint && t.flow === 'in' && t.owner === walletPubkey
    );

    if (inboundTransfer) {
      tokensReceived = inboundTransfer.amount;
      tokensReceivedRaw = inboundTransfer.amount_str;
      tokenDecimals = inboundTransfer.token_decimals;
      tokenSymbol = inboundTransfer.token_symbol;
      console.log(`Found token IN: ${tokensReceived} ${tokenSymbol || tokenMint.slice(0, 8)}`);
    }
  }

  // Find SOL transfer OUT from our wallet (the payment)
  let solSpentLamports = 0;
  
  if (tx.sol_transfers && tx.sol_transfers.length > 0) {
    // Sum all SOL going OUT from our wallet
    for (const transfer of tx.sol_transfers) {
      if (transfer.source === walletPubkey && transfer.flow === 'out') {
        solSpentLamports += transfer.amount;
      }
    }
    console.log(`Found SOL OUT: ${solSpentLamports} lamports = ${solSpentLamports / 1e9} SOL`);
  }

  // If no explicit SOL transfers, check if WSOL was used
  if (solSpentLamports === 0 && tx.token_transfers) {
    const wsolOut = tx.token_transfers.find(
      t => t.token_address === 'So11111111111111111111111111111111111111112' && 
           t.flow === 'out' && 
           t.owner === walletPubkey
    );
    if (wsolOut) {
      // WSOL has 9 decimals
      solSpentLamports = Math.round(wsolOut.amount * 1e9);
      console.log(`Found WSOL OUT: ${wsolOut.amount} = ${solSpentLamports} lamports`);
    }
  }

  if (tokensReceived <= 0) {
    console.log(`No tokens received for ${tokenMint}`);
    return null;
  }

  if (solSpentLamports <= 0) {
    console.log(`No SOL spent detected`);
    return null;
  }

  // Determine platform from program IDs
  let platform = 'unknown';
  if (tx.program_ids) {
    if (tx.program_ids.some(p => p.includes('pump') || p === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')) {
      platform = 'pump.fun';
    } else if (tx.program_ids.some(p => p.includes('raydium') || p.includes('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'))) {
      platform = 'raydium';
    } else if (tx.program_ids.some(p => p.includes('JUP'))) {
      platform = 'jupiter';
    }
  }

  return {
    tokenMint,
    tokenSymbol,
    tokenDecimals,
    tokensReceived,
    tokensReceivedRaw,
    solSpent: solSpentLamports / 1e9,
    solSpentLamports,
    fee: tx.fee / 1e9,
    feeLamports: tx.fee,
    timestamp: tx.block_time,
    platform,
    success: true
  };
}

/**
 * Parse a sell transaction from Solscan data
 */
export async function parseSellFromSolscan(
  signature: string,
  tokenMint: string,
  walletPubkey: string,
  solscanApiKey: string
): Promise<{
  tokensSold: number;
  tokensSoldRaw: string;
  solReceived: number;
  solReceivedLamports: number;
  fee: number;
  timestamp: number;
  platform: string;
  success: boolean;
} | null> {
  const tx = await fetchTransactionFromSolscan(signature, solscanApiKey);
  
  if (!tx || tx.status !== 'Success') {
    return null;
  }

  // Find token transfer OUT from our wallet (the sell)
  let tokensSold = 0;
  let tokensSoldRaw = '0';

  if (tx.token_transfers && tx.token_transfers.length > 0) {
    const outboundTransfer = tx.token_transfers.find(
      t => t.token_address === tokenMint && t.flow === 'out' && t.owner === walletPubkey
    );

    if (outboundTransfer) {
      tokensSold = outboundTransfer.amount;
      tokensSoldRaw = outboundTransfer.amount_str;
    }
  }

  // Find SOL transfer IN to our wallet (the proceeds)
  let solReceivedLamports = 0;
  
  if (tx.sol_transfers && tx.sol_transfers.length > 0) {
    for (const transfer of tx.sol_transfers) {
      if (transfer.destination === walletPubkey && transfer.flow === 'in') {
        solReceivedLamports += transfer.amount;
      }
    }
  }

  // Check WSOL if no direct SOL
  if (solReceivedLamports === 0 && tx.token_transfers) {
    const wsolIn = tx.token_transfers.find(
      t => t.token_address === 'So11111111111111111111111111111111111111112' && 
           t.flow === 'in' && 
           t.owner === walletPubkey
    );
    if (wsolIn) {
      solReceivedLamports = Math.round(wsolIn.amount * 1e9);
    }
  }

  // Determine platform
  let platform = 'unknown';
  if (tx.program_ids) {
    if (tx.program_ids.some(p => p.includes('pump') || p === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')) {
      platform = 'pump.fun';
    } else if (tx.program_ids.some(p => p.includes('raydium'))) {
      platform = 'raydium';
    } else if (tx.program_ids.some(p => p.includes('JUP'))) {
      platform = 'jupiter';
    }
  }

  if (tokensSold <= 0 || solReceivedLamports <= 0) {
    return null;
  }

  return {
    tokensSold,
    tokensSoldRaw,
    solReceived: solReceivedLamports / 1e9,
    solReceivedLamports,
    fee: tx.fee / 1e9,
    timestamp: tx.block_time,
    platform,
    success: true
  };
}
