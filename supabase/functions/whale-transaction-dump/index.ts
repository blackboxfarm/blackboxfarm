import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Fetch current bonding curve % for a Pump.fun token
async function getBondingCurvePercent(mint: string, heliusApiKey: string): Promise<string> {
  try {
    // Get token info from Helius DAS API
    const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [mint] })
    });
    
    if (!response.ok) return 'N/A';
    
    const data = await response.json();
    if (!data || !data[0]) return 'N/A';
    
    const tokenInfo = data[0];
    
    // For Pump.fun tokens, check if graduated (no longer on bonding curve)
    // If token has significant liquidity on Raydium, it's graduated (100%)
    // Otherwise estimate based on supply info
    
    // Simple heuristic: if onChainAccountInfo shows it's still on pump.fun curve
    // we'd need to query the bonding curve account directly
    // For now, return "active" or "graduated" based on source
    
    return 'current'; // Placeholder - would need pump.fun specific API
  } catch (e) {
    console.error(`Bonding curve lookup failed for ${mint}:`, e);
    return 'N/A';
  }
}

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

    const results: any[] = [];
    let before: string | undefined;
    let done = false;
    let pageCount = 0;
    let stopReason = 'UNKNOWN';
    let oldestDateReached = '';
    const mintBondingCache = new Map<string, string>();

    while (!done && results.length < maxTx) {
      pageCount++;
      const url = before ? `${API_URL}&before=${before}` : API_URL;
      
      console.log(`Page ${pageCount}: fetching... (have ${results.length} rows so far)`);

      let res: Response;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (retryCount < maxRetries) {
        res = await fetch(url);
        
        if (res.ok) break;
        
        if (res.status === 429) {
          retryCount++;
          const waitTime = Math.min(5000 * Math.pow(2, retryCount - 1), 30000); // 5s, 10s, 20s, 30s max
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
        console.log('No more transactions');
        break;
      }

      console.log(`Page ${pageCount}: got ${txs.length} transactions`);

      for (const tx of txs) {
        const blockTime = tx.timestamp || null;
        
        // Track oldest date we've seen
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
          console.log(`⚠ Hit max TX limit (${maxTx}) at ${oldestDateReached} - increase maxTx for more data`);
          done = true;
          break;
        }

        const dt = blockTime ? new Date(blockTime * 1000).toISOString() : '';
        const sig = tx.signature || '';
        const fee = tx.fee ? (tx.fee / 1e9).toFixed(9) : '0';
        const txType = tx.type || '';
        const source = tx.source || '';
        const description = tx.description || '';

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

        // Determine if this is a Pump.fun transaction
        const isPumpFun = source === 'PUMP_FUN' || 
          (tx.instructions || []).some((ix: any) => ix.programId === PUMP_PROGRAM_ID);

        // Parse token transfers
        const tokenTransfers = tx.tokenTransfers || [];
        
        if (tokenTransfers.length === 0) {
          // No token transfers - still log the transaction (e.g., SOL transfers)
          results.push({
            datetime: dt,
            signature: sig,
            mint: '',
            token_symbol: '',
            action: solChange > 0 ? 'RECEIVE_SOL' : solChange < 0 ? 'SEND_SOL' : 'OTHER',
            token_amount: '0',
            sol_change: solChange.toFixed(9),
            type: txType,
            source: source,
            bonding_pct: '',
            description: description.substring(0, 200),
            fee: fee,
          });
        } else {
          // Process each token transfer
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

            // Get bonding curve % for Pump.fun tokens (cached)
            let bondingPct = '';
            if (isPumpFun && mint) {
              if (mintBondingCache.has(mint)) {
                bondingPct = mintBondingCache.get(mint)!;
              } else {
                // For performance, we'll mark as "PUMP" and skip expensive lookups
                // Real bonding curve % would require querying pump.fun's bonding curve account
                bondingPct = 'PUMP';
                mintBondingCache.set(mint, bondingPct);
              }
            }

            results.push({
              datetime: dt,
              signature: sig,
              mint: mint,
              token_symbol: tt.tokenStandard === 'Fungible' ? (tt.symbol || '') : '',
              action: action,
              token_amount: tokenAmount.toString(),
              sol_change: solChange.toFixed(9),
              type: txType,
              source: source,
              bonding_pct: bondingPct,
              description: description.substring(0, 200),
              fee: fee,
            });
          }
        }

        before = sig;
      }

      // Slower rate to avoid rate limiting - 500ms between pages
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
        JSON.stringify(r.description),
        r.fee
      ].join(',')
    );
    const csv = header + lines.join('\n');

    console.log(`=== WHALE DUMP COMPLETE ===`);
    console.log(`Stop reason: ${stopReason}`);
    console.log(`Total rows: ${results.length}`);
    console.log(`Pages fetched: ${pageCount}`);
    console.log(`Oldest date reached: ${oldestDateReached}`);
    if (stopReason === 'HIT_MAX_TX') {
      console.log(`⚠ WARNING: Did not reach full ${days} days - increase maxTx parameter for more data`);
    }

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whale_${days}d_${stopReason}_${results.length}rows.csv"`,
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
