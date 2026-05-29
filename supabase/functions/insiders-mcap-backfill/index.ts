// insiders-mcap-backfill
// Parses market_cap_at_call out of every telegram_channel_calls.raw_message
// for the Insiders channel (or any channel), writes the parsed number back
// to market_cap_at_call, then re-runs lock_entry_mcap for every touched
// mint so the lowest-ever Entry MC is propagated into the lifecycle row
// and holders_intel_seen_tokens.entry_mcap_usd.
//
// This is the canonical "I missed a token earlier, now it just re-appeared,
// compute the X factor instantly" fixer. Idempotent — safe to cron.
//
// Body params (all optional):
//   { channelId?: string, limit?: number, onlyNull?: boolean,
//     relock?: boolean, dryRun?: boolean }
// Defaults: channelId = '-1003694579312' (insiders), limit = 500,
// onlyNull = true, relock = true, dryRun = false.

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
    const limit: number = Math.min(Math.max(Number(body.limit) || 500, 1), 5000);
    const onlyNull: boolean = body.onlyNull !== false;
    const relock: boolean = body.relock !== false;
    const dryRun: boolean = body.dryRun === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pull most-recent rows that need parsing.
    let query = supabase
      .from('telegram_channel_calls')
      .select('id, token_mint, token_symbol, market_cap_at_call, raw_message, message_id, message_timestamp')
      .eq('channel_id', channelId)
      .or('raw_message.ilike.%Entry MC%,raw_message.ilike.%Market Cap%,raw_message.ilike.%MC:%')
      .order('message_timestamp', { ascending: false })
      .limit(limit);
    if (onlyNull) query = query.is('market_cap_at_call', null);
    const { data: rows, error } = await query;
    if (error) throw error;

    const updates: Array<{ id: string; mint: string; symbol: string | null; mc: number }> = [];
    let skippedNoMc = 0;
    for (const r of rows || []) {
      const mc = parseEntryMcFromMessage((r as any).raw_message || '');
      if (!mc || mc <= 0) { skippedNoMc++; continue; }
      updates.push({
        id: (r as any).id,
        mint: (r as any).token_mint,
        symbol: (r as any).token_symbol,
        mc,
      });
    }

    let written = 0;
    if (!dryRun) {
      for (const u of updates) {
        const { error: upErr } = await supabase
          .from('telegram_channel_calls')
          .update({ market_cap_at_call: u.mc })
          .eq('id', u.id);
        if (upErr) {
          console.warn('[insiders-mcap-backfill] update failed', u.id, upErr.message);
          continue;
        }
        written++;
      }
    }

    // Re-lock entry MC for every touched mint (deduped).
    const mints = Array.from(new Set(updates.map(u => u.mint)));
    const lockResults: Array<{ mint: string; locked: number | null; err?: string }> = [];
    if (relock && !dryRun) {
      for (const mint of mints) {
        const sym = updates.find(u => u.mint === mint)?.symbol ?? null;
        const { data: locked, error: rpcErr } = await supabase.rpc('lock_entry_mcap', {
          p_mint: mint,
          p_symbol: sym,
          p_observed: null,
        });
        if (rpcErr) {
          lockResults.push({ mint, locked: null, err: rpcErr.message });
        } else {
          lockResults.push({ mint, locked: Number(locked) || null });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      channelId,
      scanned: rows?.length ?? 0,
      parsed: updates.length,
      skippedNoMc,
      written,
      mintsLocked: lockResults.length,
      sample: updates.slice(0, 5),
      lockSample: lockResults.slice(0, 10),
      dryRun,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[insiders-mcap-backfill] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});