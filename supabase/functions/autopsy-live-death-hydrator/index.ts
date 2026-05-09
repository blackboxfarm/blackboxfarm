/**
 * autopsy-live-death-hydrator
 *
 * Silently repairs Live Death Watch rows that still have placeholder mint data.
 * Uses DexScreener first, then Helius metadata. Every DB write is asserted.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';

import { enableHeliusTracking } from "../_shared/helius-fetch-interceptor.ts";
enableHeliusTracking("autopsy-live-death-hydrator");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DexResolved = {
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  pairAddress: string | null;
  dexId: string | null;
  imageUrl: string | null;
};

function cleanSymbol(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || ['unknown', 'unk', 'token'].includes(v.toLowerCase())) return null;
  return v;
}

function cleanName(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || ['unknown', 'unknown token', 'token'].includes(v.toLowerCase())) return null;
  return v;
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchDexScreener(mint: string): Promise<DexResolved | null> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'HoldersIntel/1.0' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  const pair = pairs
    .filter((p: any) => (p?.baseToken?.address ?? '').toString() === mint || p?.baseToken?.symbol)
    .sort((a: any, b: any) => (num(b?.liquidity?.usd) ?? 0) - (num(a?.liquidity?.usd) ?? 0))[0];
  if (!pair) return null;

  return {
    symbol: cleanSymbol(pair?.baseToken?.symbol),
    name: cleanName(pair?.baseToken?.name),
    priceUsd: num(pair?.priceUsd),
    marketCap: num(pair?.marketCap),
    fdv: num(pair?.fdv),
    liquidityUsd: num(pair?.liquidity?.usd),
    volume24h: num(pair?.volume?.h24),
    pairAddress: typeof pair?.pairAddress === 'string' ? pair.pairAddress : null,
    dexId: typeof pair?.dexId === 'string' ? pair.dexId : null,
    imageUrl: typeof pair?.info?.imageUrl === 'string' ? pair.info.imageUrl : null,
  };
}

async function fetchHelius(mint: string): Promise<{ symbol: string | null; name: string | null; imageUrl: string | null } | null> {
  const apiKey = Deno.env.get('HELIUS_API_KEY') || Deno.env.get('HELIOS_API_KEY');
  if (!apiKey) return null;

  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'autopsy-live-death-hydrator',
      method: 'getAsset',
      params: { id: mint },
    }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    symbol: cleanSymbol(data?.result?.content?.metadata?.symbol),
    name: cleanName(data?.result?.content?.metadata?.name),
    imageUrl: typeof data?.result?.content?.links?.image === 'string' ? data.result.content.links.image : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    let mints = Array.isArray(body?.tokenMints) ? body.tokenMints : [];
    mints = mints.filter((m: unknown) => typeof m === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)).slice(0, 40);

    if (mints.length === 0) {
      const { data, error } = await supabase
        .from('v_live_death_watch')
        .select('token_mint')
        .or('symbol.is.null,name.is.null')
        .order('dollar_wipeout', { ascending: false })
        .limit(40);
      if (error) throw error;
      mints = (data ?? []).map((r: any) => r.token_mint);
    }

    let updated = 0;
    const resolved: Array<{ mint: string; symbol: string | null; name: string | null }> = [];

    for (const mint of [...new Set(mints)]) {
      const dex = await fetchDexScreener(mint).catch(() => null);
      const helius = (!dex?.symbol || !dex?.name) ? await fetchHelius(mint).catch(() => null) : null;
      const symbol = dex?.symbol ?? helius?.symbol ?? null;
      const name = dex?.name ?? helius?.name ?? symbol;
      const imageUrl = dex?.imageUrl ?? helius?.imageUrl ?? null;

      if (!symbol && !name && !dex?.marketCap && !dex?.liquidityUsd && !dex?.volume24h) continue;

      const now = new Date().toISOString();
      const lifecyclePayload = {
          token_mint: mint,
          ...(symbol ? { symbol } : {}),
          ...(name ? { name } : {}),
          ...(dex?.priceUsd != null ? { price_usd: dex.priceUsd } : {}),
          ...(dex?.marketCap != null ? { market_cap: dex.marketCap } : {}),
          ...(dex?.fdv != null ? { fdv: dex.fdv } : {}),
          ...(dex?.liquidityUsd != null ? { liquidity_usd: dex.liquidityUsd } : {}),
          ...(dex?.volume24h != null ? { volume_24h: dex.volume24h } : {}),
          ...(dex?.pairAddress ? { pair_address: dex.pairAddress } : {}),
          ...(dex?.dexId ? { dex_id: dex.dexId } : {}),
          ...(imageUrl ? { image_url: imageUrl } : {}),
          last_fetched_at: now,
          updated_at: now,
      };

      const { data: existingLifecycle, error: existingErr } = await supabase
        .from('token_lifecycle')
        .select('token_mint')
        .eq('token_mint', mint)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existingLifecycle) {
        await assertDbWrite(
          supabase.from('token_lifecycle').update(lifecyclePayload).eq('token_mint', mint),
          'token_lifecycle',
          'UPDATE live death metadata hydrate',
        );
      } else {
        await assertDbWrite(
          supabase.from('token_lifecycle').insert({
            ...lifecyclePayload,
            first_seen_at: now,
            last_seen_at: now,
            current_status: 'active',
          }),
          'token_lifecycle',
          'INSERT live death metadata hydrate',
        );
      }

      if (symbol || name) {
        await assertDbWrite(
          supabase.from('token_metadata').upsert({
            mint_address: mint,
            symbol,
            name,
            ...(imageUrl ? { logo_uri: imageUrl } : {}),
            verified: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'mint_address' }),
          'token_metadata',
          'UPSERT live death metadata cache',
        );

        await assertDbWrite(
          supabase.from('autopsy_backlog').update({ symbol, name }).eq('token_mint', mint),
          'autopsy_backlog',
          'UPDATE matching backlog metadata',
        );
      }

      updated++;
      resolved.push({ mint, symbol, name });
    }

    return new Response(JSON.stringify({ success: true, scanned: mints.length, updated, resolved }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
