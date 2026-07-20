// Insiders Recaps Ingest — accumulative persister for daily/weekly/monthly recaps
// Runs on cron and on-demand. Idempotent: unique (recap_type, token_mint, recap_date).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

type RecapType = 'daily' | 'weekly' | 'monthly';

function classify(raw: string): RecapType | null {
  if (/DAILY RECAP/i.test(raw)) return 'daily';
  if (/WEEKLY RECAP/i.test(raw)) return 'weekly';
  if (/MONTHLY RECAP/i.test(raw)) return 'monthly';
  return null;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// Parse the recap date from message header, e.g. "DAILY RECAP - April 17",
// "WEEKLY RECAP - Week of April 12", "MONTHLY RECAP - April 2026".
// Falls back to the message timestamp for the given recap_type bucket.
function parseRecapDate(raw: string, type: RecapType, ts: string): string {
  const msgDate = new Date(ts);
  const year = msgDate.getUTCFullYear();
  const m = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s+(\d{1,2})?(?:[^0-9]{1,10}(\d{4}))?/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const day = m[2] ? parseInt(m[2], 10) : 1;
    const yr = m[3] ? parseInt(m[3], 10) : year;
    if (typeof mo === 'number') {
      const d = new Date(Date.UTC(yr, mo, day));
      // For monthly, snap to first day of month
      if (type === 'monthly') d.setUTCDate(1);
      return d.toISOString().slice(0, 10);
    }
  }
  // Fallback: for daily use the day of the message, for weekly snap to Monday, monthly to first
  const d = new Date(msgDate);
  if (type === 'weekly') {
    const day = d.getUTCDay(); // 0=Sun
    const diff = (day + 6) % 7; // days since Monday
    d.setUTCDate(d.getUTCDate() - diff);
  } else if (type === 'monthly') {
    d.setUTCDate(1);
  }
  return d.toISOString().slice(0, 10);
}

type Parsed = {
  rank: number;
  ticker: string;
  mint: string;
  entry_mcap_str: string | null;
  peak_mcap_str: string | null;
  multiplier: number;
};

function mcapToNumber(s: string | null): number | null {
  if (!s) return null;
  const t = s.replace(/[$,\s]/g, '').toLowerCase();
  const m = t.match(/^([\d.]+)([kmb])?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const u = m[2];
  if (u === 'k') n *= 1_000;
  else if (u === 'm') n *= 1_000_000;
  else if (u === 'b') n *= 1_000_000_000;
  return n;
}

function parseRecap(raw: string): Parsed[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const out: Parsed[] = [];
  let rank = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(\d+(?:\.\d+)?)x\s*\$?([A-Za-z0-9_]+)/);
    if (!m) continue;
    const multiplier = parseFloat(m[1]);
    const ticker = m[2];
    let entry_mcap_str: string | null = null;
    let peak_mcap_str: string | null = null;
    let mint: string | null = null;
    for (let j = 1; j <= 4 && i + j < lines.length; j++) {
      const l = lines[i + j];
      if (!entry_mcap_str) {
        const mc = l.match(/\$([\d.,]+\s*[kKmMbB]?)\s*=>\s*\$([\d.,]+\s*[kKmMbB]?)/);
        if (mc) { entry_mcap_str = mc[1].trim(); peak_mcap_str = mc[2].trim(); continue; }
      }
      if (!mint) {
        const ca = l.match(BASE58);
        if (ca) mint = ca[0];
      }
      if (mint && entry_mcap_str) break;
    }
    if (!mint) continue;
    rank += 1;
    out.push({ rank, ticker, mint, entry_mcap_str, peak_mcap_str, multiplier });
  }
  return out;
}

async function resolveDev(supabase: any, mint: string): Promise<{ wallet: string | null; source: string | null }> {
  const sources: Array<[string, string]> = [
    ['pumpfun_watchlist', 'creator_wallet'],
    ['scraped_tokens', 'creator_wallet'],
    ['token_lifecycle', 'creator_wallet'],
    ['developer_tokens', 'creator_wallet'],
  ];
  for (const [tbl, col] of sources) {
    const { data } = await supabase.from(tbl).select(`token_mint, ${col}`).eq('token_mint', mint).limit(1).maybeSingle();
    if (data?.[col]) return { wallet: data[col] as string, source: tbl };
  }
  // Fallback: creator-wallet-resolver
  try {
    const { data } = await supabase.functions.invoke('creator-wallet-resolver', {
      body: { tokenMint: mint, batchSize: 1 },
    });
    const r = data?.results?.[0];
    if (r?.ok && r.creator) return { wallet: r.creator as string, source: 'creator-wallet-resolver' };
  } catch { /* swallow */ }
  return { wallet: null, source: null };
}

async function resolveKyc(
  supabase: any,
  devWallet: string,
): Promise<{ root: string | null; label: string | null; source: string | null }> {
  // 1. developer_profiles
  const { data: dp } = await supabase
    .from('developer_profiles')
    .select('kyc_root_wallet, kyc_root_label, kyc_source_type')
    .eq('master_wallet_address', devWallet)
    .maybeSingle();
  let root = dp?.kyc_root_wallet || null;
  let label = dp?.kyc_root_label || null;
  let source = dp?.kyc_source_type || null;

  // 2. dev_wallet_reputation fallback
  if (!root) {
    const { data: dr } = await supabase
      .from('dev_wallet_reputation')
      .select('trail_end_kyc_root, trail_end_reason')
      .eq('wallet_address', devWallet)
      .maybeSingle();
    if (dr?.trail_end_kyc_root) {
      root = dr.trail_end_kyc_root;
      source = 'dev_reputation';
    }
  }

  // 3. label enrichment
  if (root && !label) {
    const { data: k } = await supabase
      .from('known_cex_wallets')
      .select('cex_name, cex_label, entity_type')
      .eq('wallet_address', root)
      .maybeSingle();
    if (k) {
      label = k.cex_label || k.cex_name || null;
      if (!source) source = k.entity_type || null;
    }
  }
  return { root, label, source };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const bodyIn = await req.json().catch(() => ({}));
  const mode = (bodyIn.mode || url.searchParams.get('mode') || 'incremental') as 'incremental' | 'backfill';
  const days = Number(bodyIn.days ?? url.searchParams.get('days') ?? (mode === 'backfill' ? 60 : 3));
  const resolveMissingDevs = bodyIn.resolveMissingDevs ?? true;

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  // 1. Pull recap messages
  const { data: msgs, error: msgErr } = await supabase
    .from('telegram_channel_calls')
    .select('message_id, raw_message, message_timestamp, created_at')
    .ilike('channel_name', 'insiders')
    .gte('message_timestamp', since)
    .ilike('raw_message', '%INSIDERS%RECAP%')
    .order('message_timestamp', { ascending: false })
    .limit(2000);
  if (msgErr) {
    return new Response(JSON.stringify({ error: msgErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. Dedupe by message_id + type
  const seen = new Set<string>();
  const recaps: Array<{ raw: string; ts: string; mid: number | null; type: RecapType; recap_date: string }> = [];
  for (const r of msgs || []) {
    const type = classify(r.raw_message || '');
    if (!type) continue;
    const ts = r.message_timestamp || r.created_at;
    const mid = (r.message_id as number) ?? null;
    const key = `${type}:${mid ?? ts}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recaps.push({ raw: r.raw_message, ts, mid, type, recap_date: parseRecapDate(r.raw_message, type, ts) });
  }

  // 3. Parse entries
  type Row = {
    recap_type: RecapType; recap_date: string; rank: number; ticker: string; token_mint: string;
    entry_mcap: number | null; peak_mcap: number | null; multiplier: number;
    source_message_id: number | null; source_message_ts: string;
  };
  const rows: Row[] = [];
  for (const rc of recaps) {
    const parsed = parseRecap(rc.raw);
    for (const p of parsed) {
      rows.push({
        recap_type: rc.type,
        recap_date: rc.recap_date,
        rank: p.rank,
        ticker: p.ticker,
        token_mint: p.mint,
        entry_mcap: mcapToNumber(p.entry_mcap_str),
        peak_mcap: mcapToNumber(p.peak_mcap_str),
        multiplier: p.multiplier,
        source_message_id: rc.mid,
        source_message_ts: rc.ts,
      });
    }
  }

  // 4. Dedupe rows in-memory on (recap_type, recap_date, token_mint), keep highest multiplier
  const bestKey = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.recap_type}|${r.recap_date}|${r.token_mint}`;
    const prev = bestKey.get(k);
    if (!prev || r.multiplier > prev.multiplier) bestKey.set(k, r);
  }
  const uniqueRows = Array.from(bestKey.values());

  // 5. Upsert to insiders_recap_entries (skip fields with null so we don't nuke resolved values)
  let inserted = 0;
  let updated = 0;
  for (const chunk of chunks(uniqueRows, 200)) {
    const { error, count } = await supabase
      .from('insiders_recap_entries')
      .upsert(chunk.map((r) => ({ ...r, last_refreshed_at: new Date().toISOString() })), {
        onConflict: 'recap_type,token_mint,recap_date',
        count: 'exact',
      });
    if (error) console.error('upsert error', error.message);
    else inserted += count || chunk.length;
  }

  // 6. Resolve dev wallets for rows still missing one
  let devsResolved = 0;
  let kycResolved = 0;
  if (resolveMissingDevs) {
    const { data: missingDev } = await supabase
      .from('insiders_recap_entries')
      .select('id, token_mint, dev_wallet')
      .is('dev_wallet', null)
      .limit(60);
    const uniqueMints = Array.from(new Set((missingDev || []).map((r: any) => r.token_mint)));
    const resolvedByMint = new Map<string, { wallet: string | null; source: string | null }>();
    for (const mint of uniqueMints) {
      resolvedByMint.set(mint, await resolveDev(supabase, mint));
    }
    for (const row of (missingDev || []) as any[]) {
      const r = resolvedByMint.get(row.token_mint);
      if (!r?.wallet) continue;
      const kyc = await resolveKyc(supabase, r.wallet);
      await supabase.from('insiders_recap_entries').update({
        dev_wallet: r.wallet,
        dev_resolution_source: r.source,
        kyc_root_wallet: kyc.root,
        kyc_root_label: kyc.label,
        kyc_source_type: kyc.source,
        last_refreshed_at: new Date().toISOString(),
      }).eq('id', row.id);
      devsResolved += 1;
      if (kyc.root) kycResolved += 1;
    }

    // 7. Also fill missing KYC where dev_wallet is known but kyc_root_wallet is null
    const { data: missingKyc } = await supabase
      .from('insiders_recap_entries')
      .select('id, dev_wallet')
      .not('dev_wallet', 'is', null)
      .is('kyc_root_wallet', null)
      .limit(120);
    for (const row of (missingKyc || []) as any[]) {
      const kyc = await resolveKyc(supabase, row.dev_wallet);
      if (!kyc.root) continue;
      await supabase.from('insiders_recap_entries').update({
        kyc_root_wallet: kyc.root,
        kyc_root_label: kyc.label,
        kyc_source_type: kyc.source,
        last_refreshed_at: new Date().toISOString(),
      }).eq('id', row.id);
      kycResolved += 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      mode,
      days,
      recap_messages: recaps.length,
      parsed_entries: rows.length,
      unique_entries: uniqueRows.length,
      upserted: inserted,
      devs_resolved: devsResolved,
      kyc_resolved: kycResolved,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

function* chunks<T>(arr: T[], n: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n);
}