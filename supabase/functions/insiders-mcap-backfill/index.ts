// insiders-mcap-backfill
// FAST Mesh-first ingest. Parses Entry MC from the last N Insiders
// messages, dedupes per mint (lowest MC wins), and bulk-feeds the main
// Mesh table holders_intel_seen_tokens via upsert_mesh_entry_mcap, which
// honors the 30-min discovery-window guard so later dumps cannot lower
// Entry MC.
//
// Body (all optional): { channelId?, limit?, writeBack?, dryRun? }
// Defaults: channelId='-1003694579312', limit=100, writeBack=false.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INSIDERS_CHANNEL_ID = '-1003694579312';

/** Convert "$192k" / "$1.2M" / "$1,234,567" → number (USD). */
function parseUsdShort(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/[\s,$]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)([kKmMbB]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = m[2].toLowerCase();
  const mult = suf === 'k' ? 1_000 : suf === 'm' ? 1_000_000 : suf === 'b' ? 1_000_000_000 : 1;
  return n * mult;
}

/** Pull the call-time market cap out of a raw Insiders message body. */
export function parseEntryMcFromMessage(text: string): number | null {
  if (!text) return null;
  const candidates: number[] = [];
  // "Entry MC: $192k"
  const mEntry = text.match(/Entry\s*MC\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
  const vEntry = parseUsdShort(mEntry?.[1] ?? null);
  if (vEntry) candidates.push(vEntry);
  // "Market Cap: $192k" (ALERT body)
  const mMc = text.match(/Market\s*Cap\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
  const vMc = parseUsdShort(mMc?.[1] ?? null);
  if (vMc) candidates.push(vMc);
  // "MC: $192k" (compact)
  const mShort = text.match(/(?:^|\s)MC\s*[:=]\s*\$?([\d.,]+\s*[kKmMbB]?)/i);
  const vShort = parseUsdShort(mShort?.[1] ?? null);
  if (vShort) candidates.push(vShort);
  if (!candidates.length) return null;
  // Use the lowest value found in this single message (the entry, not the
  // current). Current MC is intentionally NOT parsed.
  return Math.min(...candidates);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const channelId: string = body.channelId || INSIDERS_CHANNEL_ID;
    const limit: number = Math.min(Math.max(Number(body.limit) || 100, 1), 1000);
    const writeBack: boolean = body.writeBack === true;
    const dryRun: boolean = body.dryRun === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: rows, error } = await supabase
      .from('telegram_channel_calls')
      .select('id, token_mint, token_symbol, token_name, market_cap_at_call, raw_message, message_timestamp')
      .eq('channel_id', channelId)
      .order('message_timestamp', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;

    // Dedupe per mint, keep LOWEST MC (best entry) within the scan window.
    const perMint = new Map<string, {
      mint: string; symbol: string | null; name: string | null;
      mc: number; observed_at: string; callIds: string[];
    }>();
    for (const r of rows || []) {
      const mint = (r as any).token_mint;
      if (!mint || mint.length < 32) continue;
      const stored = (r as any).market_cap_at_call;
      const mc = (stored != null && Number(stored) > 0)
        ? Number(stored)
        : parseEntryMcFromMessage((r as any).raw_message || '');
      if (!mc || mc <= 0) continue;
      const ts = (r as any).message_timestamp || new Date().toISOString();
      const cur = perMint.get(mint);
      if (!cur) {
        perMint.set(mint, {
          mint,
          symbol: (r as any).token_symbol ?? null,
          name: (r as any).token_name ?? null,
          mc: Number(mc),
          observed_at: ts,
          callIds: [(r as any).id],
        });
      } else {
        if (Number(mc) < cur.mc) { cur.mc = Number(mc); cur.observed_at = ts; }
        cur.callIds.push((r as any).id);
      }
    }

    const tokens = Array.from(perMint.values());
    const meshResults: Array<{ mint: string; entry: number | null; window: boolean | null; err?: string }> = [];

    if (!dryRun) {
      const CHUNK = 50;
      for (let i = 0; i < tokens.length; i += CHUNK) {
        const slice = tokens.slice(i, i + CHUNK);
        const settled = await Promise.all(slice.map(async (t) => {
          const { data, error: rpcErr } = await supabase.rpc('upsert_mesh_entry_mcap', {
            p_mint: t.mint,
            p_symbol: t.symbol,
            p_name: t.name,
            p_observed_mcap: t.mc,
            p_source: 'insiders',
            p_observed_at: t.observed_at,
          });
          if (rpcErr) return { mint: t.mint, entry: null, window: null, err: rpcErr.message };
          const row = Array.isArray(data) ? data[0] : data;
          return {
            mint: t.mint,
            entry: row?.entry_mcap_usd != null ? Number(row.entry_mcap_usd) : null,
            window: row?.within_window ?? null,
          };
        }));
        meshResults.push(...settled);
      }

      if (writeBack) {
        for (const t of tokens) {
          for (const id of t.callIds) {
            await supabase.from('telegram_channel_calls')
              .update({ market_cap_at_call: t.mc })
              .eq('id', id)
              .is('market_cap_at_call', null);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      channelId,
      scanned: rows?.length ?? 0,
      uniqueMints: tokens.length,
      meshUpserts: meshResults.length,
      sample: meshResults.slice(0, 10),
      dryRun,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[insiders-mcap-backfill] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});