import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  let body: any = {};
  try { body = await req.json(); } catch {}
  const mints: string[] = Array.isArray(body.mints) ? body.mints.filter((m: any) => typeof m === 'string') : [];
  const resolve: boolean = body.resolve !== false;
  if (mints.length === 0) {
    return new Response(JSON.stringify({ error: 'mints[] required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const map = new Map<string, string | null>();
  for (const m of mints) map.set(m, null);

  // Pull known creator_wallets from all sources in parallel
  const chunks = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i=0;i<a.length;i+=n) o.push(a.slice(i,i+n)); return o; };
  const batches = chunks(mints, 200);

  const sources: [string, string, string][] = [
    ['pumpfun_watchlist', 'token_mint', 'creator_wallet'],
    ['scraped_tokens', 'token_mint', 'creator_wallet'],
    ['token_lifecycle', 'token_mint', 'creator_wallet'],
    ['developer_tokens', 'token_mint', 'creator_wallet'],
  ];

  for (const [tbl, keyCol, valCol] of sources) {
    for (const batch of batches) {
      const missing = batch.filter((m) => !map.get(m));
      if (missing.length === 0) continue;
      const { data } = await supabase.from(tbl).select(`${keyCol}, ${valCol}`).in(keyCol, missing);
      for (const r of (data as any[]) || []) {
        const k = r[keyCol]; const v = r[valCol];
        if (v && !map.get(k)) map.set(k, v);
      }
    }
  }

  let resolved = 0;
  const errors: string[] = [];
  if (resolve) {
    const unresolved = mints.filter((m) => !map.get(m));
    // Cap resolver calls to keep response under function timeout
    const cap = Math.min(unresolved.length, 120);
    for (let i = 0; i < cap; i++) {
      const mint = unresolved[i];
      try {
        const r = await resolveTokenCreator(mint, supabase, errors);
        if (r.creatorWallet) {
          map.set(mint, r.creatorWallet);
          resolved++;
          // Best-effort persist to scraped_tokens so next call is instant
          const isPump = mint.endsWith('pump');
          if (!isPump) {
            await supabase.from('scraped_tokens')
              .upsert({ token_mint: mint, creator_wallet: r.creatorWallet }, { onConflict: 'token_mint' });
          }
        }
      } catch (e) { errors.push(`${mint}: ${(e as Error).message}`); }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const out: Record<string, string | null> = {};
  for (const [k, v] of map) out[k] = v;
  const known = Object.values(out).filter(Boolean).length;
  return new Response(JSON.stringify({ total: mints.length, known, resolved, errors: errors.slice(0, 5), devs: out }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});