// alpha-lists-rebuild
// Rebuilds public.alpha_dev_wallets and public.alpha_kyc_groups from
// PREMIUM INSIDERS RECAP posts in telegram_channel_calls (last 60 days),
// mirroring the parse/resolve logic of the /insiders-recaps UI.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RecapType = 'daily' | 'weekly' | 'monthly';
type Entry = {
  mint: string;
  ticker: string;
  multiplier: number;
  entry_mc: string | null;
  peak_mc: string | null;
  recap_type: RecapType;
  recap_date: string;
};

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function classify(raw: string): RecapType | null {
  if (/DAILY RECAP/i.test(raw)) return 'daily';
  if (/WEEKLY RECAP/i.test(raw)) return 'weekly';
  if (/MONTHLY RECAP/i.test(raw)) return 'monthly';
  return null;
}

function parseRecap(raw: string, type: RecapType, ts: string): Entry[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(\d+(?:\.\d+)?)x\s*\$?([A-Za-z0-9_]+)/);
    if (!m) continue;
    const multiplier = parseFloat(m[1]);
    const ticker = m[2];
    let entry_mc: string | null = null;
    let peak_mc: string | null = null;
    let mint: string | null = null;
    for (let j = 1; j <= 4 && i + j < lines.length; j++) {
      const l = lines[i + j];
      if (!entry_mc) {
        const mc = l.match(/\$([\d.,]+\s*[kKmMbB]?)\s*=>\s*\$([\d.,]+\s*[kKmMbB]?)/);
        if (mc) { entry_mc = mc[1].trim(); peak_mc = mc[2].trim(); continue; }
      }
      if (!mint) {
        const ca = l.match(BASE58);
        if (ca) mint = ca[0];
      }
      if (mint && entry_mc) break;
    }
    if (!mint) continue;
    out.push({ mint, ticker, multiplier, entry_mc, peak_mc, recap_type: type, recap_date: ts });
  }
  return out;
}

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  const { data: calls, error } = await supabase
    .from('telegram_channel_calls')
    .select('message_id, raw_message, message_timestamp, created_at')
    .ilike('channel_name', 'insiders')
    .gte('message_timestamp', since)
    .ilike('raw_message', '%INSIDERS%RECAP%')
    .order('message_timestamp', { ascending: false })
    .limit(2000);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const seen = new Set<number>();
  const recaps: { raw: string; ts: string; type: RecapType }[] = [];
  for (const r of calls || []) {
    const type = classify(r.raw_message || '');
    if (!type) continue;
    const mid = (r.message_id as number) ?? null;
    if (mid != null && seen.has(mid)) continue;
    if (mid != null) seen.add(mid);
    recaps.push({ raw: r.raw_message!, ts: r.message_timestamp || r.created_at, type });
  }

  const all: Entry[] = [];
  for (const rc of recaps) all.push(...parseRecap(rc.raw, rc.type, rc.ts));

  // Best multiplier per mint
  const bestByMint = new Map<string, Entry>();
  for (const e of all) {
    const prev = bestByMint.get(e.mint);
    if (!prev || e.multiplier > prev.multiplier) bestByMint.set(e.mint, e);
  }
  const entries = Array.from(bestByMint.values());
  const mints = entries.map((e) => e.mint);

  // Resolve dev wallets from known cache tables
  const devMap: Record<string, string> = {};
  const sources: [string, string][] = [
    ['pumpfun_watchlist', 'creator_wallet'],
    ['scraped_tokens', 'creator_wallet'],
    ['token_lifecycle', 'creator_wallet'],
    ['developer_tokens', 'creator_wallet'],
    ['telegram_insider_token_lifecycle', 'dev_wallet'],
  ];
  for (const [tbl, col] of sources) {
    const missing = mints.filter((m) => !devMap[m]);
    if (!missing.length) break;
    for (const batch of chunk(missing, 200)) {
      const mintCol = tbl === 'telegram_insider_token_lifecycle' ? 'token_mint' : 'token_mint';
      const { data } = await (supabase as any).from(tbl).select(`${mintCol}, ${col}`).in(mintCol, batch);
      for (const r of (data as any[]) || []) {
        const m = r[mintCol];
        if (r[col] && m && !devMap[m]) devMap[m] = r[col];
      }
    }
  }

  // Resolve KYC roots
  const uniqueDevs = Array.from(new Set(Object.values(devMap)));
  const kycMap: Record<string, { root: string; label: string | null }> = {};
  for (const batch of chunk(uniqueDevs, 200)) {
    const { data } = await (supabase as any)
      .from('developer_profiles')
      .select('master_wallet_address, kyc_root_wallet, kyc_root_label')
      .in('master_wallet_address', batch);
    for (const r of (data as any[]) || []) {
      if (r?.kyc_root_wallet) kycMap[r.master_wallet_address] = { root: r.kyc_root_wallet, label: r.kyc_root_label || null };
    }
  }
  const missingKyc = uniqueDevs.filter((d) => !kycMap[d]);
  for (const batch of chunk(missingKyc, 200)) {
    const { data } = await (supabase as any)
      .from('dev_wallet_reputation')
      .select('wallet_address, trail_end_kyc_root')
      .in('wallet_address', batch);
    for (const r of (data as any[]) || []) {
      if (r?.trail_end_kyc_root) kycMap[r.wallet_address] = { root: r.trail_end_kyc_root, label: null };
    }
  }
  // Label enrichment
  const rootsNoLabel = Array.from(new Set(Object.values(kycMap).filter((v) => !v.label).map((v) => v.root)));
  const labelMap: Record<string, string> = {};
  for (const batch of chunk(rootsNoLabel, 200)) {
    const { data } = await (supabase as any)
      .from('known_cex_wallets')
      .select('wallet_address, cex_name, cex_label')
      .in('wallet_address', batch);
    for (const r of (data as any[]) || []) {
      labelMap[r.wallet_address] = r.cex_label || r.cex_name || '';
    }
  }
  for (const d of Object.keys(kycMap)) {
    const v = kycMap[d];
    if (v && !v.label && labelMap[v.root]) kycMap[d] = { ...v, label: labelMap[v.root] };
  }

  // Aggregate per dev
  type DevAgg = {
    dev_wallet: string;
    best_multiplier: number;
    best_ticker: string;
    best_mint: string;
    token_count: number;
    tickers: string[];
    mints: string[];
    sum_mult: number;
    last_seen_at: string;
    kyc_root: string | null;
    kyc_label: string | null;
  };
  const devAggs = new Map<string, DevAgg>();
  for (const e of entries) {
    const dev = devMap[e.mint];
    if (!dev) continue;
    const cur = devAggs.get(dev);
    const kyc = kycMap[dev];
    if (!cur) {
      devAggs.set(dev, {
        dev_wallet: dev,
        best_multiplier: e.multiplier,
        best_ticker: e.ticker,
        best_mint: e.mint,
        token_count: 1,
        tickers: [e.ticker],
        mints: [e.mint],
        sum_mult: e.multiplier,
        last_seen_at: e.recap_date,
        kyc_root: kyc?.root ?? null,
        kyc_label: kyc?.label ?? null,
      });
    } else {
      cur.token_count += 1;
      cur.sum_mult += e.multiplier;
      cur.tickers.push(e.ticker);
      cur.mints.push(e.mint);
      if (e.multiplier > cur.best_multiplier) {
        cur.best_multiplier = e.multiplier;
        cur.best_ticker = e.ticker;
        cur.best_mint = e.mint;
      }
      if (e.recap_date > cur.last_seen_at) cur.last_seen_at = e.recap_date;
    }
  }

  const devRows = Array.from(devAggs.values()).map((d) => ({
    dev_wallet: d.dev_wallet,
    best_multiplier: d.best_multiplier,
    best_ticker: d.best_ticker,
    best_mint: d.best_mint,
    token_count: d.token_count,
    avg_multiplier: d.sum_mult / d.token_count,
    tickers: Array.from(new Set(d.tickers)),
    mints: Array.from(new Set(d.mints)),
    kyc_root: d.kyc_root,
    kyc_label: d.kyc_label,
    last_seen_at: d.last_seen_at,
  }));

  // Aggregate per KYC root
  type KycAgg = {
    kyc_root: string;
    kyc_label: string | null;
    devs: Set<string>;
    tickers: Set<string>;
    token_count: number;
    best_multiplier: number;
    best_ticker: string;
    best_mint: string;
    sum_mult: number;
    last_seen_at: string;
  };
  const kycAggs = new Map<string, KycAgg>();
  for (const e of entries) {
    const dev = devMap[e.mint];
    if (!dev) continue;
    const k = kycMap[dev];
    if (!k) continue;
    const cur = kycAggs.get(k.root);
    if (!cur) {
      kycAggs.set(k.root, {
        kyc_root: k.root,
        kyc_label: k.label,
        devs: new Set([dev]),
        tickers: new Set([e.ticker]),
        token_count: 1,
        best_multiplier: e.multiplier,
        best_ticker: e.ticker,
        best_mint: e.mint,
        sum_mult: e.multiplier,
        last_seen_at: e.recap_date,
      });
    } else {
      cur.devs.add(dev);
      cur.tickers.add(e.ticker);
      cur.token_count += 1;
      cur.sum_mult += e.multiplier;
      if (e.multiplier > cur.best_multiplier) {
        cur.best_multiplier = e.multiplier;
        cur.best_ticker = e.ticker;
        cur.best_mint = e.mint;
      }
      if (e.recap_date > cur.last_seen_at) cur.last_seen_at = e.recap_date;
      if (!cur.kyc_label && k.label) cur.kyc_label = k.label;
    }
  }
  const kycRows = Array.from(kycAggs.values()).map((k) => ({
    kyc_root: k.kyc_root,
    kyc_label: k.kyc_label,
    distinct_dev_count: k.devs.size,
    token_count: k.token_count,
    best_multiplier: k.best_multiplier,
    best_ticker: k.best_ticker,
    best_mint: k.best_mint,
    avg_multiplier: k.sum_mult / k.token_count,
    dev_wallets: Array.from(k.devs),
    tickers: Array.from(k.tickers),
    last_seen_at: k.last_seen_at,
  }));

  // Upsert
  if (devRows.length) {
    const { error: e1 } = await supabase.from('alpha_dev_wallets').upsert(devRows, { onConflict: 'dev_wallet' });
    if (e1) console.error('[alpha-lists-rebuild] dev upsert', e1.message);
  }
  if (kycRows.length) {
    const { error: e2 } = await supabase.from('alpha_kyc_groups').upsert(kycRows, { onConflict: 'kyc_root' });
    if (e2) console.error('[alpha-lists-rebuild] kyc upsert', e2.message);
  }

  return new Response(JSON.stringify({
    ok: true,
    recaps: recaps.length,
    tokens: entries.length,
    devs_upserted: devRows.length,
    kyc_groups_upserted: kycRows.length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});