import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Minimum thresholds
const MIN_SOL_CHANGE = 0.001;

// Derive bonding curve PDA for a Pump.fun mint
async function deriveBondingCurve(mintPubkey: string): Promise<string> {
  // Standard seed: ["bonding-curve", mint]
  // We'll construct the address manually using the known pattern
  // For now, return a placeholder - actual derivation requires crypto libs
  return '';
}

// Calculate bonding curve progress from token reserves
// Formula: 100 - (((realTokenReserves - 206900000000) * 100) / 793100000000)
// Where 206.9M tokens (with 6 decimals = 206900000000) is graduation threshold
function calculateBondingProgress(realTokenReserves: number): number {
  const GRADUATION_THRESHOLD = 206900000000; // 206.9M tokens with 6 decimals
  const INITIAL_TOKENS = 793100000000; // 793.1M tokens available for sale
  
  if (realTokenReserves <= GRADUATION_THRESHOLD) {
    return 100; // Graduated
  }
  
  const tokensRemaining = realTokenReserves - GRADUATION_THRESHOLD;
  const progress = 100 - ((tokensRemaining * 100) / INITIAL_TOKENS);
  return Math.max(0, Math.min(100, progress));
}

// Fetch bonding curve state for Pump.fun token
async function getBondingCurvePercent(mint: string, heliusApiKey: string): Promise<string> {
  try {
    // Use Helius to get the bonding curve account
    // The bonding curve PDA is derived from the mint
    // We'll query DAS API for token info to check if it's still on curve
    
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'bonding-check',
        method: 'getAsset',
        params: { id: mint }
      })
    });

    if (!response.ok) return '?';
    
    const data = await response.json();
    if (!data.result) return '?';
    
    // Check if token authority is still Pump.fun (not graduated)
    const creators = data.result.creators || [];
    const authorities = data.result.authorities || [];
    
    // If mint authority is revoked and has Raydium LP, it's graduated
    const content = data.result.content || {};
    const metadata = content.metadata || {};
    
    // Simple heuristic: check if description mentions pump.fun
    if (metadata.description?.toLowerCase().includes('pump.fun')) {
      return 'PUMP'; // Still on pump.fun
    }
    
    return '?';
  } catch (e) {
    console.error(`Bonding lookup failed for ${mint}:`, e);
    return '?';
  }
}

// Get token metadata including symbol
async function getTokenMetadata(mints: string[], heliusApiKey: string): Promise<Map<string, {symbol: string, name: string}>> {
  const result = new Map<string, {symbol: string, name: string}>();
  
  if (mints.length === 0) return result;
  
  try {
    // Batch lookup - max 100 at a time
    const batchSize = 100;
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      
      const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAccounts: batch })
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      for (const item of data) {
        if (item.account && item.onChainMetadata?.metadata?.data) {
          const meta = item.onChainMetadata.metadata.data;
          result.set(item.account, {
            symbol: meta.symbol || '',
            name: meta.name || ''
          });
        } else if (item.account && item.legacyMetadata) {
          result.set(item.account, {
            symbol: item.legacyMetadata.symbol || '',
            name: item.legacyMetadata.name || ''
          });
        }
      }
      
      await sleep(200); // Rate limit
    }
  } catch (e) {
    console.error('Token metadata batch lookup failed:', e);
  }
  
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet, days = 2, maxTx = 2000 } = await req.json(); // Default: 2 days, 2000 tx for testing
    
    if (!wallet) {
      return new Response(
        JSON.stringify({ error: 'wallet address required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY');
    if (!HELIUS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const API_URL = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}`;
    const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const cutoffDate = new Date(cutoffTs * 1000).toISOString();

    console.log(`=== WHALE DUMP START ===`);
    console.log(`Wallet: ${wallet}`);
    console.log(`Days: ${days}, Max TX: ${maxTx}`);
    console.log(`Cutoff: ${cutoffDate}`);

    const results: any[] = [];
    const uniqueMints = new Set<string>();
    let before: string | undefined;
    let done = false;
    let pageCount = 0;
    let stopReason = 'UNKNOWN';
    let oldestDateReached = '';
    let totalTxScanned = 0;

    // Phase 1: Collect all transactions
    while (!done && results.length < maxTx) {
      pageCount++;
      const url = before ? `${API_URL}&before=${before}` : API_URL;
      
      console.log(`Page ${pageCount}: fetching... (${results.length} trades)`);

      let res: Response;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (retryCount < maxRetries) {
        res = await fetch(url);
        if (res.ok) break;
        
        if (res.status === 429) {
          retryCount++;
          const waitTime = Math.min(5000 * Math.pow(2, retryCount - 1), 30000);
          console.log(`Rate limited, waiting ${waitTime/1000}s...`);
          await sleep(waitTime);
          continue;
        }
        throw new Error(`API error: ${res.status}`);
      }
      
      if (!res!.ok) {
        stopReason = 'RATE_LIMITED';
        done = true;
        break;
      }

      const txs = await res.json();
      
      if (!txs || !txs.length) {
        stopReason = 'NO_MORE_TX';
        break;
      }

      for (const tx of txs) {
        totalTxScanned++;
        const blockTime = tx.timestamp || null;
        const sig = tx.signature || '';
        before = sig;
        
        if (blockTime) {
          oldestDateReached = new Date(blockTime * 1000).toISOString();
        }

        if (blockTime && blockTime < cutoffTs) {
          stopReason = 'DATE_CUTOFF';
          done = true;
          break;
        }

        if (results.length >= maxTx) {
          stopReason = 'HIT_MAX_TX';
          done = true;
          break;
        }

        const txType = tx.type || '';
        const source = tx.source || '';
        const description = tx.description || '';
        const fee = tx.fee ? (tx.fee / 1e9).toFixed(6) : '0';
        const dt = blockTime ? new Date(blockTime * 1000).toISOString() : '';

        // Calculate SOL change
        let solChange = 0;
        if (tx.nativeTransfers) {
          for (const nt of tx.nativeTransfers) {
            if (nt.toUserAccount === wallet) solChange += (nt.amount || 0) / 1e9;
            if (nt.fromUserAccount === wallet) solChange -= (nt.amount || 0) / 1e9;
          }
        }

        const isPumpFun = source === 'PUMP_FUN' || 
          (tx.instructions || []).some((ix: any) => ix.programId === PUMP_PROGRAM_ID);
        const isDex = ['PUMP_FUN', 'RAYDIUM', 'JUPITER', 'ORCA', 'METEORA', 'MOONSHOT'].includes(source);

        const tokenTransfers = tx.tokenTransfers || [];
        
        // Skip dust SOL-only transactions
        if (tokenTransfers.length === 0) {
          if (Math.abs(solChange) >= 0.01) {
            results.push({
              datetime: dt,
              signature: sig,
              mint: 'SOL',
              token_symbol: 'SOL',
              token_name: 'Solana',
              action: solChange > 0 ? 'RECEIVE' : 'SEND',
              token_amount: Math.abs(solChange).toFixed(4),
              sol_change: solChange.toFixed(4),
              type: txType,
              source: source,
              is_pump: false,
              bonding_pct: '',
              fee: fee,
            });
          }
          continue;
        }

        // Process token transfers
        for (const tt of tokenTransfers) {
          const mint = tt.mint || '';
          if (!mint) continue;
          
          const tokenAmount = tt.tokenAmount || 0;
          const fromAccount = tt.fromUserAccount || '';
          const toAccount = tt.toUserAccount || '';
          
          let action = 'TRANSFER';
          if (toAccount === wallet) action = 'BUY';
          else if (fromAccount === wallet) action = 'SELL';

          // Skip non-trades unless significant
          if (action === 'TRANSFER' && !isDex && Math.abs(solChange) < MIN_SOL_CHANGE) {
            continue;
          }

          uniqueMints.add(mint);

          results.push({
            datetime: dt,
            signature: sig,
            mint: mint,
            token_symbol: tt.symbol || '',
            token_name: '',
            action: action,
            token_amount: tokenAmount.toString(),
            sol_change: solChange.toFixed(4),
            type: txType,
            source: source,
            is_pump: isPumpFun,
            bonding_pct: isPumpFun ? 'PUMP' : '',
            fee: fee,
          });
        }
      }

      await sleep(500);
    }

    console.log(`Phase 1 complete: ${results.length} trades, ${uniqueMints.size} unique mints`);

    // Phase 2: Enrich with token metadata
    if (uniqueMints.size > 0) {
      console.log(`Fetching metadata for ${uniqueMints.size} tokens...`);
      const metadata = await getTokenMetadata(Array.from(uniqueMints), HELIUS_API_KEY);
      
      for (const r of results) {
        if (r.mint && r.mint !== 'SOL' && metadata.has(r.mint)) {
          const meta = metadata.get(r.mint)!;
          r.token_symbol = meta.symbol || r.token_symbol;
          r.token_name = meta.name || '';
        }
      }
    }

    // Sort chronologically
    results.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    // Generate full CSV with all data INCLUDING curve_progress
    const header = 'datetime,signature,mint,symbol,name,side,token_amount,sol_change,type,source,is_pump,curve_progress,fee\n';
    const lines = results.map(r =>
      [
        r.datetime,
        r.signature,
        r.mint,
        r.token_symbol,
        `"${(r.token_name || '').replace(/"/g, "'")}"`,
        r.action === 'BUY' ? 'BUY' : (r.action === 'SELL' ? 'SELL' : r.action),
        r.token_amount,
        r.sol_change,
        r.type,
        r.source,
        r.is_pump ? 'YES' : '',
        r.is_pump ? 'ON_CURVE' : '',
        r.fee
      ].join(',')
    );
    const csv = header + lines.join('\n');

    console.log(`=== WHALE DUMP COMPLETE ===`);
    console.log(`Stop: ${stopReason}, Trades: ${results.length}, Scanned: ${totalTxScanned}`);
    console.log(`Date range: ${results[0]?.datetime || 'N/A'} to ${results[results.length-1]?.datetime || 'N/A'}`);

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whale_${days}d_${results.length}trades.csv"`,
      },
    });

  } catch (error) {
    console.error('WHALE DUMP ERROR:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
