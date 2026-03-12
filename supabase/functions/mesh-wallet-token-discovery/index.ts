import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { getHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Discover ALL tokens minted by a wallet, paginating through pump.fun + Helius
// Returns count + writes mesh links for each discovered token
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { walletAddress, mode } = await req.json();
    if (!walletAddress) throw new Error('walletAddress required');

    console.log(`[TokenDiscovery] Starting for ${walletAddress}, mode=${mode || 'full'}`);

    const allTokens: Array<{ mint: string; symbol: string; name: string; mcap: number; graduated: boolean }> = [];
    const errors: string[] = [];

    // ═══ STEP 1: Pump.fun user-created-coins (paginated, up to 1000) ═══
    const pumpHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      'Origin': 'https://pump.fun',
      'Referer': 'https://pump.fun/',
    };

    const endpoints = [
      'https://frontend-api-v3.pump.fun/coins/user-created-coins/',
      'https://client-api-2-74b1891ee9f9.herokuapp.com/coins/user-created-coins/',
    ];

    let pumpSuccess = false;
    for (const base of endpoints) {
      if (pumpSuccess) break;
      let offset = 0;
      const limit = 100;

      try {
        while (offset < 2000) {
          const url = `${base}${walletAddress}?limit=${limit}&offset=${offset}&includeNsfw=true`;
          const res = await fetch(url, { headers: pumpHeaders, signal: AbortSignal.timeout(10000) });

          if (!res.ok) {
            errors.push(`Pump.fun ${res.status} at offset ${offset}`);
            break;
          }

          const data = await res.json();
          if (!Array.isArray(data) || data.length === 0) break;

          for (const t of data) {
            allTokens.push({
              mint: t.mint,
              symbol: t.symbol || '???',
              name: t.name || 'Unknown',
              mcap: t.usd_market_cap || 0,
              graduated: t.complete === true,
            });
          }

          pumpSuccess = true;
          console.log(`[TokenDiscovery] Pump.fun offset=${offset}, batch=${data.length}, total=${allTokens.length}`);

          if (data.length < limit) break;
          offset += limit;
          // Rate limit
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (e) {
        errors.push(`Pump.fun error: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // ═══ STEP 2: Helius TOKEN_MINT fallback (if pump.fun failed) ═══
    if (allTokens.length === 0) {
      try {
        const heliusKey = getHeliusApiKey();
        if (heliusKey) {
          let before: string | undefined;
          let page = 0;

          while (page < 20) {
            const params: Record<string, string> = { type: 'TOKEN_MINT', limit: '100' };
            if (before) params.before = before;

            const url = getHeliusRestUrl(`/v0/addresses/${walletAddress}/transactions`, params);
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

            if (!res.ok) break;
            const txs = await res.json();
            if (!Array.isArray(txs) || txs.length === 0) break;

            for (const tx of txs) {
              for (const transfer of (tx.tokenTransfers || [])) {
                if (transfer.mint && !allTokens.find(t => t.mint === transfer.mint)) {
                  allTokens.push({
                    mint: transfer.mint,
                    symbol: '???',
                    name: 'Unknown',
                    mcap: 0,
                    graduated: false,
                  });
                }
              }
            }

            if (txs.length < 100) break;
            before = txs[txs.length - 1]?.signature;
            if (!before) break;
            page++;
            await new Promise(r => setTimeout(r, 100));
          }

          console.log(`[TokenDiscovery] Helius found ${allTokens.length} minted tokens`);
        }
      } catch (e) {
        errors.push(`Helius error: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // ═══ STEP 3: Write mesh links (wallet → token via "created") ═══
    let meshLinksAdded = 0;
    if (allTokens.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < allTokens.length; i += batchSize) {
        const batch = allTokens.slice(i, i + batchSize).map(t => ({
          source_type: 'wallet',
          source_id: walletAddress,
          linked_type: 'token',
          linked_id: t.mint,
          relationship: 'created',
          confidence: 90,
          discovered_via: 'mesh-wallet-token-discovery',
          discovered_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('reputation_mesh')
          .upsert(batch, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });

        if (!error) meshLinksAdded += batch.length;
      }

      // Also upsert to developer_tokens for stats
      const devTokenBatch = allTokens.slice(0, 500).map(t => ({
        token_mint: t.mint,
        creator_wallet: walletAddress,
        developer_id: walletAddress,
        token_symbol: t.symbol,
        is_active: t.mcap > 1000,
        outcome: t.graduated ? 'graduated' : (t.mcap > 50000 ? 'success' : (t.mcap < 100 ? 'failed' : 'unknown')),
        peak_market_cap_usd: t.mcap,
        launchpad: 'pumpfun',
      }));

      await supabase
        .from('developer_tokens')
        .upsert(devTokenBatch, { onConflict: 'token_mint' });
    }

    console.log(`[TokenDiscovery] Done: ${allTokens.length} tokens, ${meshLinksAdded} mesh links`);

    return new Response(
      JSON.stringify({
        walletAddress,
        tokensFound: allTokens.length,
        meshLinksAdded,
        tokens: allTokens.slice(0, 50).map(t => ({
          mint: t.mint,
          symbol: t.symbol,
          name: t.name,
          mcap: t.mcap,
          graduated: t.graduated,
        })),
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[TokenDiscovery] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
