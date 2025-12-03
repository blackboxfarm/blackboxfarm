import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Minimum thresholds to filter out dust/spam
const MIN_SOL_CHANGE = 0.001; // Ignore SOL transfers under 0.001 SOL
const MIN_TOKEN_VALUE_APPROX = 0.0001; // Ignore tiny token amounts

// Transaction types we care about for trading analysis
const RELEVANT_TYPES = ['SWAP', 'TRANSFER', 'TOKEN_MINT', 'UNKNOWN'];
const RELEVANT_SOURCES = ['PUMP_FUN', 'RAYDIUM', 'JUPITER', 'ORCA', 'METEORA', 'MOONSHOT', 'UNKNOWN', ''];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet, days = 30, maxTx = 50000 } = await req.json();
    
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
    console.log(`Days requested: ${days}`);
    console.log(`Max TX limit: ${maxTx}`);
    console.log(`Cutoff date: ${cutoffDate}`);
    console.log(`Filtering: Only swaps/trades with SOL > ${MIN_SOL_CHANGE}`);

    const results: any[] = [];
    let before: string | undefined;
    let done = false;
    let pageCount = 0;
    let stopReason = 'UNKNOWN';
    let oldestDateReached = '';
    let totalTxScanned = 0;
    let filteredOutCount = 0;

    while (!done && results.length < maxTx) {
      pageCount++;
      const url = before ? `${API_URL}&before=${before}` : API_URL;
      
      console.log(`Page ${pageCount}: fetching... (${results.length} trades found, ${filteredOutCount} filtered out)`);

      let res: Response;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (retryCount < maxRetries) {
        res = await fetch(url);
        
        if (res.ok) break;
        
        if (res.status === 429) {
          retryCount++;
          const waitTime = Math.min(5000 * Math.pow(2, retryCount - 1), 30000);
          console.log(`Rate limited (attempt ${retryCount}/${maxRetries}), waiting ${waitTime/1000}s...`);
          await sleep(waitTime);
          continue;
        }
        
        const errText = await res.text();
        console.error(`API error: ${res.status} - ${errText.substring(0, 200)}`);
        throw new Error(`API error: ${res.status}`);
      }
      
      if (!res!.ok) {
        stopReason = 'RATE_LIMITED';
        console.log(`⚠ Stopped due to persistent rate limiting after ${maxRetries} retries`);
        done = true;
        break;
      }

      const txs = await res.json();
      
      if (!txs || !txs.length) {
        stopReason = 'NO_MORE_TX';
        console.log('No more transactions');
        break;
      }

      console.log(`Page ${pageCount}: got ${txs.length} raw transactions`);

      for (const tx of txs) {
        totalTxScanned++;
        const blockTime = tx.timestamp || null;
        const sig = tx.signature || '';
        
        // Always update before cursor
        before = sig;
        
        // Track oldest date
        if (blockTime) {
          oldestDateReached = new Date(blockTime * 1000).toISOString();
        }

        if (blockTime && blockTime < cutoffTs) {
          stopReason = 'DATE_CUTOFF';
          console.log(`✓ Hit date cutoff at ${oldestDateReached} - requested ${days} days reached!`);
          done = true;
          break;
        }

        if (results.length >= maxTx) {
          stopReason = 'HIT_MAX_TX';
          console.log(`⚠ Hit max TX limit (${maxTx}) at ${oldestDateReached}`);
          done = true;
          break;
        }

        const txType = tx.type || '';
        const source = tx.source || '';
        const description = tx.description || '';
        const fee = tx.fee ? (tx.fee / 1e9).toFixed(9) : '0';
        const dt = blockTime ? new Date(blockTime * 1000).toISOString() : '';

        // Calculate SOL change from native transfers
        let solChange = 0;
        if (tx.nativeTransfers) {
          for (const nt of tx.nativeTransfers) {
            if (nt.toUserAccount === wallet) {
              solChange += (nt.amount || 0) / 1e9;
            }
            if (nt.fromUserAccount === wallet) {
              solChange -= (nt.amount || 0) / 1e9;
            }
          }
        }

        // Determine if this is a DEX/trading transaction
        const isPumpFun = source === 'PUMP_FUN' || 
          (tx.instructions || []).some((ix: any) => ix.programId === PUMP_PROGRAM_ID);
        const isDexTrade = ['PUMP_FUN', 'RAYDIUM', 'JUPITER', 'ORCA', 'METEORA', 'MOONSHOT'].includes(source);
        const isSwap = txType === 'SWAP';

        // Parse token transfers
        const tokenTransfers = tx.tokenTransfers || [];
        
        // === FILTERING LOGIC ===
        
        // Skip pure SOL transfers that are dust (spam/fees distribution)
        if (tokenTransfers.length === 0) {
          if (Math.abs(solChange) < MIN_SOL_CHANGE) {
            filteredOutCount++;
            continue; // Skip dust SOL transfers
          }
          
          // Skip system program dust distributions
          if (source === 'SYSTEM_PROGRAM' && Math.abs(solChange) < 0.01) {
            filteredOutCount++;
            continue;
          }
          
          // Only log significant SOL movements (> 0.01 SOL)
          if (Math.abs(solChange) >= 0.01) {
            results.push({
              datetime: dt,
              signature: sig,
              mint: 'SOL',
              token_symbol: 'SOL',
              action: solChange > 0 ? 'RECEIVE' : 'SEND',
              token_amount: Math.abs(solChange).toFixed(6),
              sol_change: solChange.toFixed(6),
              type: txType,
              source: source,
              bonding_pct: '',
              description: description.substring(0, 150),
              fee: fee,
            });
          } else {
            filteredOutCount++;
          }
          continue;
        }

        // Process token transfers - focus on actual trades
        for (const tt of tokenTransfers) {
          const mint = tt.mint || '';
          const tokenAmount = tt.tokenAmount || 0;
          const fromAccount = tt.fromUserAccount || '';
          const toAccount = tt.toUserAccount || '';
          
          // Determine BUY vs SELL
          let action = 'TRANSFER';
          if (toAccount === wallet) {
            action = 'BUY';
          } else if (fromAccount === wallet) {
            action = 'SELL';
          }

          // Skip if not a meaningful trade:
          // 1. Must have token movement involving our wallet
          // 2. For swaps, should have SOL change
          // 3. Skip tiny amounts
          
          if (action === 'TRANSFER' && !isDexTrade && !isSwap) {
            // Skip non-swap transfers unless they're significant
            if (Math.abs(solChange) < MIN_SOL_CHANGE) {
              filteredOutCount++;
              continue;
            }
          }

          // For BUY/SELL on DEX, always include
          // For transfers, only include if significant SOL involved
          const isSignificantTrade = 
            (isDexTrade || isSwap) || 
            (action !== 'TRANSFER') ||
            Math.abs(solChange) >= MIN_SOL_CHANGE;

          if (!isSignificantTrade) {
            filteredOutCount++;
            continue;
          }

          // Get bonding indicator for Pump.fun tokens
          let bondingPct = '';
          if (isPumpFun) {
            bondingPct = 'PUMP';
          }

          results.push({
            datetime: dt,
            signature: sig,
            mint: mint,
            token_symbol: tt.symbol || '',
            action: action,
            token_amount: tokenAmount.toString(),
            sol_change: solChange.toFixed(6),
            type: txType,
            source: source,
            bonding_pct: bondingPct,
            description: description.substring(0, 150),
            fee: fee,
          });
        }
      }

      // Rate limiting delay
      await sleep(500);
    }

    // Sort chronologically (oldest first)
    results.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    // Generate CSV
    const header = 'datetime,signature,mint,token_symbol,action,token_amount,sol_change,type,source,bonding_pct,description,fee\n';
    const lines = results.map(r =>
      [
        r.datetime,
        r.signature,
        r.mint,
        r.token_symbol,
        r.action,
        r.token_amount,
        r.sol_change,
        r.type,
        r.source,
        r.bonding_pct,
        `"${(r.description || '').replace(/"/g, "'")}"`,
        r.fee
      ].join(',')
    );
    const csv = header + lines.join('\n');

    console.log(`=== WHALE DUMP COMPLETE ===`);
    console.log(`Stop reason: ${stopReason}`);
    console.log(`Total TX scanned: ${totalTxScanned}`);
    console.log(`Filtered out (dust/spam): ${filteredOutCount}`);
    console.log(`Meaningful trades: ${results.length}`);
    console.log(`Pages fetched: ${pageCount}`);
    console.log(`Date range: ${results.length > 0 ? results[0].datetime : 'N/A'} to ${results.length > 0 ? results[results.length-1].datetime : 'N/A'}`);

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whale_${days}d_${results.length}trades.csv"`,
      },
    });

  } catch (error) {
    console.error('=== WHALE DUMP ERROR ===');
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
