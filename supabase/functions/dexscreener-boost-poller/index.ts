/**
 * dexscreener-boost-poller
 *
 * Polls DexScreener boost endpoints and persists per-token boost history.
 * Designed to run on a 5-minute cron.
 *
 * Endpoints used:
 *   GET https://api.dexscreener.com/token-boosts/latest/v1   (recent activations)
 *   GET https://api.dexscreener.com/token-boosts/top/v1      (current top tier)
 *
 * For each Solana token in the response we upsert one row into
 * `token_boost_history`, computing `delta_amount` against the most
 * recent prior row for that mint. delta > 0 ⇒ new boost activity that
 * downstream consumers (autopsy, dev reputation, X/TG broadcaster)
 * can react to.
 *
 * Additionally, for tokens we already track (token_lifecycle / pumpfun_watchlist
 * / autopsy_candidates), we also call /orders/v1/solana/{mint} and persist
 * paid orders into `token_paid_orders`.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { withRunLog } from '../_shared/run-logger.ts';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BoostPayload {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function normalizeBoosts(arr: any, source: 'latest' | 'top'): Array<{ mint: string; row: BoostPayload; source: 'latest' | 'top' }> {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((b: BoostPayload) => b?.chainId === 'solana' && b?.tokenAddress)
    .map((b: BoostPayload) => ({ mint: b.tokenAddress!, row: b, source }));
}

function normalizePaymentTimestamp(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const millis = n > 10_000_000_000 ? n : n * 1000;
  const date = new Date(millis);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

async function getLastTotal(mint: string): Promise<number | null> {
  const { data } = await supabase
    .from('token_boost_history')
    .select('total_amount')
    .eq('token_mint', mint)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.total_amount ?? null;
}

async function persistBoosts(entries: Array<{ mint: string; row: BoostPayload; source: 'latest' | 'top' }>) {
  let inserted = 0;
  let positiveDelta = 0;
  const capturedAt = new Date().toISOString();

  for (const { mint, row, source } of entries) {
    const total = Number(row.totalAmount ?? 0) || null;
    const amount = Number(row.amount ?? 0) || null;
    let delta: number | null = null;
    if (total != null) {
      const prior = await getLastTotal(mint);
      delta = prior == null ? total : total - prior;
      if (delta > 0) positiveDelta++;
    }

    const payload = {
      token_mint: mint,
      chain_id: 'solana',
      captured_at: capturedAt,
      boost_amount: amount,
      total_amount: total,
      delta_amount: delta,
      source,
      icon_url: row.icon ?? null,
      header_url: row.header ?? null,
      description: row.description ?? null,
      links: row.links ?? null,
      raw: row as unknown as Record<string, unknown>,
    };

    await assertDbWrite(
      supabase
        .from('token_boost_history')
        .upsert(payload, { onConflict: 'token_mint,source,captured_at', ignoreDuplicates: false })
        .select('id')
        .maybeSingle(),
      'token_boost_history',
      'UPSERT',
    );
    inserted++;
  }

  return { inserted, positiveDelta };
}

async function fetchTrackedMints(): Promise<Set<string>> {
  const set = new Set<string>();
  const tables: Array<{ table: string; col: string }> = [
    { table: 'token_lifecycle', col: 'token_mint' },
    { table: 'pumpfun_watchlist', col: 'token_mint' },
    { table: 'autopsy_candidates', col: 'token_mint' },
  ];
  for (const { table, col } of tables) {
    try {
      const { data } = await supabase.from(table).select(col).limit(2000);
      for (const r of (data ?? []) as any[]) {
        const m = r?.[col];
        if (typeof m === 'string' && m.length > 20) set.add(m);
      }
    } catch (e) {
      console.warn('[boost-poller] tracked-mint pull failed for', table, e);
    }
  }
  return set;
}

async function pollPaidOrders(mints: Set<string>) {
  let saved = 0;
  // soft cap to keep cron run under control
  const list = Array.from(mints).slice(0, 80);
  for (const mint of list) {
    let orders: any[] = [];
    try {
      const data = await fetchJson(`https://api.dexscreener.com/orders/v1/solana/${mint}`);
      orders = Array.isArray(data) ? data : (data?.orders ?? []);
    } catch (e) {
      console.warn('[boost-poller] /orders fetch failed for', mint, e);
      continue;
    }

    for (const o of orders) {
      const ts = normalizePaymentTimestamp(o?.paymentTimestamp);
      const row = {
        token_mint: mint,
        chain_id: 'solana',
        order_type: String(o?.type ?? 'unknown'),
        status: o?.status ?? null,
        amount: o?.amount != null ? Number(o.amount) : null,
        payment_timestamp: ts,
        raw: o,
      };
      await assertDbWrite(
        supabase
          .from('token_paid_orders')
          .upsert(row, { onConflict: 'token_mint,order_type,payment_timestamp', ignoreDuplicates: true })
          .select('id')
          .maybeSingle(),
        'token_paid_orders',
        'UPSERT',
      );
      saved++;
    }
    // gentle pacing — DexScreener orders endpoint is rate-limited
    await new Promise((r) => setTimeout(r, 150));
  }
  return saved;
}

Deno.serve(withRunLog('dexscreener-boost-poller', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  // 1) Pull both boost feeds in parallel
  const [latestRaw, topRaw] = await Promise.allSettled([
    fetchJson('https://api.dexscreener.com/token-boosts/latest/v1'),
    fetchJson('https://api.dexscreener.com/token-boosts/top/v1'),
  ]);

  const latest = latestRaw.status === 'fulfilled' ? normalizeBoosts(latestRaw.value, 'latest') : [];
  const top = topRaw.status === 'fulfilled' ? normalizeBoosts(topRaw.value, 'top') : [];

  // De-dupe by (mint, source) — keep the highest totalAmount per (mint,source)
  const map = new Map<string, { mint: string; row: BoostPayload; source: 'latest' | 'top' }>();
  for (const e of [...latest, ...top]) {
    const k = `${e.mint}::${e.source}`;
    const prev = map.get(k);
    if (!prev || (Number(e.row.totalAmount ?? 0) > Number(prev.row.totalAmount ?? 0))) {
      map.set(k, e);
    }
  }
  const entries = Array.from(map.values());

  const { inserted, positiveDelta } = await persistBoosts(entries);

  // 2) Pull paid orders for tokens we actually care about
  const tracked = await fetchTrackedMints();
  // Also include any mint with a positive delta we just observed
  for (const e of entries) {
    if ((e.row.totalAmount ?? 0) > 0) tracked.add(e.mint);
  }
  const ordersSaved = await pollPaidOrders(tracked);

  return new Response(
    JSON.stringify({
      ok: true,
      latest_count: latest.length,
      top_count: top.length,
      boost_rows_upserted: inserted,
      positive_delta_events: positiveDelta,
      tracked_mints: tracked.size,
      orders_saved: ordersSaved,
      elapsed_ms: Date.now() - startedAt,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));