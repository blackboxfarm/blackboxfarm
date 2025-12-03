import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet, days = 90 } = await req.json();
    
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

    const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
    const cutoffTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    console.log(`Fetching ${days} days of transactions for wallet: ${wallet}`);

    // RPC helper
    async function rpc(method: string, params: any[]) {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = await res.json();
      if (json.error) {
        console.error(`RPC error for ${method}:`, json.error);
        throw new Error(json.error.message || 'RPC error');
      }
      return json.result;
    }

    // Fetch all signatures within time range
    const allSigs: any[] = [];
    let before: string | undefined;
    let done = false;

    while (!done) {
      const params = before
        ? [wallet, { limit: 1000, before }]
        : [wallet, { limit: 1000 }];

      const sigs = await rpc('getSignaturesForAddress', params);
      if (!sigs || !sigs.length) break;

      for (const s of sigs) {
        if (!s.blockTime) continue;
        if (s.blockTime < cutoffTs) {
          done = true;
          break;
        }
        allSigs.push(s);
      }

      before = sigs[sigs.length - 1].signature;
      console.log(`Fetched batch: ${sigs.length}, total kept: ${allSigs.length}`);

      if (done || sigs.length < 1000) break;
    }

    allSigs.sort((a, b) => a.blockTime - b.blockTime);
    console.log(`Total signatures: ${allSigs.length}`);

    // Fetch transaction details - use getTransaction (singular) for each
    const results: any[] = [];

    for (let i = 0; i < allSigs.length; i += 50) {
      const batch = allSigs.slice(i, i + 50);
      console.log(`Fetching tx details ${i}/${allSigs.length}`);

      // Fetch in parallel batches
      const txPromises = batch.map(async (sigObj: any) => {
        try {
          const tx = await rpc('getTransaction', [sigObj.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
          return { sig: sigObj.signature, tx };
        } catch (e) {
          console.error(`Failed to fetch tx ${sigObj.signature}:`, e);
          return { sig: sigObj.signature, tx: null };
        }
      });

      const txResults = await Promise.all(txPromises);

      for (const { sig, tx } of txResults) {
        if (!tx) continue;

        const blockTime = tx.blockTime || null;
        const dt = blockTime ? new Date(blockTime * 1000).toISOString() : '';

        const meta = tx.meta || {};
        const preBalances = meta.preBalances || [];
        const postBalances = meta.postBalances || [];
        const accountKeys = tx.transaction?.message?.accountKeys || [];

        let solChangeLamports = 0;
        for (let idx = 0; idx < accountKeys.length; idx++) {
          const key = typeof accountKeys[idx] === 'string' ? accountKeys[idx] : accountKeys[idx]?.pubkey;
          if (key === wallet) {
            solChangeLamports = (postBalances[idx] || 0) - (preBalances[idx] || 0);
            break;
          }
        }
        const solChange = solChangeLamports / 1e9;

        const logs = meta.logMessages || [];
        const instructions = tx.transaction?.message?.instructions || [];
        const programs = instructions
          .map((ix: any) => {
            const key = accountKeys[ix.programIdIndex];
            return typeof key === 'string' ? key : key?.pubkey || '';
          })
          .filter(Boolean)
          .join('|');

        let label = 'OTHER';
        if (programs.toLowerCase().includes('pump')) label = 'PUMPFUN';
        if (programs.toLowerCase().includes('rayd')) label = 'RAYDIUM';

        results.push({
          datetime: dt,
          signature: sig,
          solChange: solChange.toFixed(9),
          label,
          programs,
          logSample: logs.slice(0, 3).join(' || '),
        });
      }
    }

    // Generate CSV
    const header = 'datetime,signature,sol_change,label,programs,log_sample\n';
    const lines = results.map(r =>
      [r.datetime, r.signature, r.solChange, r.label, JSON.stringify(r.programs), JSON.stringify(r.logSample)].join(',')
    );
    const csv = header + lines.join('\n');

    console.log(`Generated CSV with ${results.length} transactions`);

    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="whale_${days}d_raw.csv"`,
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
