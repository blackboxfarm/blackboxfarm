/**
 * autopsy-backlog-refresh-tickers
 *
 * Updates ONLY the symbol/name fields of existing autopsy_backlog rows that
 * are missing a ticker. Does not insert or delete rows. Pulls latest values
 * from token_lifecycle, pumpfun_watchlist and token_metadata.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Pull rows missing ticker.
  const { data: rows, error } = await supabase
    .from('autopsy_backlog')
    .select('token_mint, symbol, name')
    .or('symbol.is.null,name.is.null')
    .limit(2000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ success: true, updated: 0, scanned: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const mints = rows.map(r => r.token_mint);

  const [tlRes, pwRes, tmRes] = await Promise.all([
    supabase.from('token_lifecycle').select('token_mint, symbol, name').in('token_mint', mints),
    supabase.from('pumpfun_watchlist').select('token_mint, token_symbol').in('token_mint', mints),
    supabase.from('token_metadata').select('mint_address, symbol, name').in('mint_address', mints),
  ]);

  const tlMap = new Map((tlRes.data ?? []).map((r: any) => [r.token_mint, r]));
  const pwMap = new Map((pwRes.data ?? []).map((r: any) => [r.token_mint, r]));
  const tmMap = new Map((tmRes.data ?? []).map((r: any) => [r.mint_address, r]));

  let updated = 0;
  for (const r of rows) {
    const tl = tlMap.get(r.token_mint) as any;
    const pw = pwMap.get(r.token_mint) as any;
    const tm = tmMap.get(r.token_mint) as any;
    const newSym = (tl?.symbol || pw?.token_symbol || tm?.symbol || null) || null;
    const newName = (tl?.name || tm?.name || null) || null;
    if (!newSym && !newName) continue;
    if ((newSym ?? null) === (r.symbol ?? null) && (newName ?? null) === (r.name ?? null)) continue;
    await assertDbWrite(
      supabase.from('autopsy_backlog').update({
        symbol: newSym ?? r.symbol,
        name:   newName ?? r.name,
      }).eq('token_mint', r.token_mint),
      'autopsy_backlog', 'UPDATE',
    );
    updated++;
  }

  return new Response(JSON.stringify({ success: true, scanned: rows.length, updated }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});