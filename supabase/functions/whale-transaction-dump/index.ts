import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit helper - wait between requests
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet, days = 30, maxTx = 2000 } = await req.json();
    
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

    // Use Helius enhanced transactions API - much faster
    const API_URL = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}`;
    const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    console.log(`=== WHALE DUMP START ===`);
    console.log(`Wallet: ${wallet}`);
    console.log(`Days: ${days}, Max TX: ${maxTx}`);
    console.log(`Cutoff: ${new Date(cutoffTs * 1000).toISOString()}`);

    const results: any[] = [];
    let before: string | undefined;
    let done = false;
    let pageCount = 0;

    while (!done && results.length < maxTx) {
      pageCount++;
      const url = before ? `${API_URL}&before=${before}` : API_URL;
      
      console.log(`Page ${pageCount}: fetching... (have ${results.length} tx so far)`);

      const res = await fetch(url);
      
      if (!res.ok) {
        const errText = await res.text();
        console.error(`API error: ${res.status} - ${errText}`);
        if (res.status === 429) {
          console.log('Rate limited, waiting 2s...');
          await sleep(2000);
          continue;
        }
        throw new Error(`API error: ${res.status}`);
      }

      const txs = await res.json();
      
      if (!txs || !txs.length) {
        console.log('No more transactions');
        break;
      }

      console.log(`Page ${pageCount}: got ${txs.length} transactions`);

      for (const tx of txs) {
        const blockTime = tx.timestamp || null;
        
        // Check cutoff
        if (blockTime && blockTime < cutoffTs) {
          console.log(`Hit cutoff at ${new Date(blockTime * 1000).toISOString()}`);
          done = true;
          break;
        }

        // Check max
        if (results.length >= maxTx) {
          console.log(`Hit max tx limit: ${maxTx}`);
          done = true;
          break;
        }

        const dt = blockTime ? new Date(blockTime * 1000).toISOString() : '';
        const sig = tx.signature || '';

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

        // Get program info
        const programs = (tx.instructions || [])
          .map((ix: any) => ix.programId || '')
          .filter(Boolean)
          .join('|');

        // Determine label from type or programs
        let label = tx.type || 'OTHER';
        if (programs.toLowerCase().includes('pump') || tx.source === 'PUMP_FUN') label = 'PUMPFUN';
        if (programs.toLowerCase().includes('rayd') || tx.source === 'RAYDIUM') label = 'RAYDIUM';

        // Get description
        const description = tx.description || '';

        results.push({
          datetime: dt,
          signature: sig,
          solChange: solChange.toFixed(9),
          type: tx.type || '',
          source: tx.source || '',
          label,
          description: description.substring(0, 200),
          fee: tx.fee ? (tx.fee / 1e9).toFixed(9) : '0',
        });

        before = sig;
      }

      // Small delay between pages to avoid rate limits
      await sleep(200);
    }

    // Sort chronologically (oldest first)
    results.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    // Generate CSV
    const header = 'datetime,signature,sol_change,type,source,label,description,fee\n';
    const lines = results.map(r =>
      [
        r.datetime,
        r.signature,
        r.solChange,
        r.type,
        r.source,
        r.label,
        JSON.stringify(r.description),
        r.fee
      ].join(',')
    );
    const csv = header + lines.join('\n');

    console.log(`=== WHALE DUMP COMPLETE ===`);
    console.log(`Total transactions: ${results.length}`);
    console.log(`Pages fetched: ${pageCount}`);

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whale_${days}d_${results.length}tx.csv"`,
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
