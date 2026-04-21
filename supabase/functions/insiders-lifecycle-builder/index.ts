// Insiders Channel Lifecycle Builder
// Parses every message from the 'insiders' Telegram channel and reconstructs
// per-token lifecycle records: first call → milestones → peak multiplier.
// Idempotent: re-runnable, upserts into telegram_insider_token_lifecycle.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MilestoneEvent {
  multiplier: number;
  current_mc: number | null;
  current_mc_text: string | null;
  timestamp: string;
  message_id: number | null;
}

interface TokenAggregate {
  token_mint: string;
  token_symbol: string | null;
  first_called_at: string;
  first_call_message_id: number | null;
  entry_market_cap: number | null;
  entry_mc_text: string | null;
  raw_alert_message: string | null;
  milestones: MilestoneEvent[];
  total_messages: number;
}

// --- Parsers ---

// "Market Cap: $49k" / "$1.2M" / "$717"
function parseMcText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[, ]/g, '').match(/\$?([\d.]+)\s*([kKmMbB])?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return null;
  const suffix = (m[2] || '').toLowerCase();
  const mult = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
  return num * mult;
}

function parseAlert(raw: string): { entryMcText: string | null; entryMc: number | null } {
  const mcMatch = raw.match(/Market Cap:\s*(\$?[\d.,]+\s*[kKmMbB]?)/);
  const entryMcText = mcMatch ? mcMatch[1].trim() : null;
  return { entryMcText, entryMc: parseMcText(entryMcText) };
}

function parseMilestone(raw: string): { multiplier: number | null; currentMcText: string | null; currentMc: number | null; entryMcText: string | null; entryMc: number | null } {
  const xMatch = raw.match(/MILESTONE:?\s*([\d.]+)\s*X/i);
  const entryMatch = raw.match(/Entry MC:\s*(\$?[\d.,]+\s*[kKmMbB]?)/i);
  const currentMatch = raw.match(/Current MC:\s*(\$?[\d.,]+\s*[kKmMbB]?)/i);
  return {
    multiplier: xMatch ? parseFloat(xMatch[1]) : null,
    currentMcText: currentMatch ? currentMatch[1].trim() : null,
    currentMc: currentMatch ? parseMcText(currentMatch[1]) : null,
    entryMcText: entryMatch ? entryMatch[1].trim() : null,
    entryMc: entryMatch ? parseMcText(entryMatch[1]) : null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[insiders-lifecycle-builder] Starting build...');

    // Pull every insiders message in chronological order.
    // Page through to bypass 1000-row limit.
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('telegram_channel_calls')
        .select('id, message_id, token_mint, token_symbol, raw_message, message_timestamp, created_at')
        .ilike('channel_name', 'insiders')
        .not('token_mint', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    console.log(`[insiders-lifecycle-builder] Loaded ${allRows.length} messages`);

    // Aggregate by token_mint
    const byToken = new Map<string, TokenAggregate>();

    for (const row of allRows) {
      const mint = row.token_mint as string;
      if (!mint) continue;

      const ts = (row.message_timestamp || row.created_at) as string;
      const raw = (row.raw_message || '') as string;
      const isMilestone = /MILESTONE/i.test(raw);

      let agg = byToken.get(mint);
      if (!agg) {
        agg = {
          token_mint: mint,
          token_symbol: row.token_symbol || null,
          first_called_at: ts,
          first_call_message_id: row.message_id || null,
          entry_market_cap: null,
          entry_mc_text: null,
          raw_alert_message: null,
          milestones: [],
          total_messages: 0,
        };
        byToken.set(mint, agg);
      }

      agg.total_messages++;

      if (isMilestone) {
        const m = parseMilestone(raw);
        if (m.multiplier !== null) {
          agg.milestones.push({
            multiplier: m.multiplier,
            current_mc: m.currentMc,
            current_mc_text: m.currentMcText,
            timestamp: ts,
            message_id: row.message_id || null,
          });
        }
        // If we never had an entry MC from an ALERT, take it from first milestone
        if (!agg.entry_market_cap && m.entryMc) {
          agg.entry_market_cap = m.entryMc;
          agg.entry_mc_text = m.entryMcText;
        }
        // Use symbol from milestone if missing
        if (!agg.token_symbol && row.token_symbol) agg.token_symbol = row.token_symbol;
      } else {
        // ALERT message — use first one we see for this mint
        if (!agg.raw_alert_message) {
          agg.raw_alert_message = raw;
          const a = parseAlert(raw);
          if (a.entryMc) {
            agg.entry_market_cap = a.entryMc;
            agg.entry_mc_text = a.entryMcText;
          }
          // Earliest timestamp (alerts come first chronologically)
          if (new Date(ts) < new Date(agg.first_called_at)) {
            agg.first_called_at = ts;
            agg.first_call_message_id = row.message_id || null;
          }
        }
      }
    }

    console.log(`[insiders-lifecycle-builder] Aggregated into ${byToken.size} unique tokens`);

    // Build upsert rows
    const upsertRows = Array.from(byToken.values()).map((agg) => {
      // Sort milestones chronologically and find peak
      agg.milestones.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      let peak = 1;
      let peakMc: number | null = null;
      let peakAt: string | null = null;
      for (const m of agg.milestones) {
        if (m.multiplier > peak) {
          peak = m.multiplier;
          peakMc = m.current_mc;
          peakAt = m.timestamp;
        }
      }
      // If no milestones, peak stays 1 with no peakMc
      const lastMilestoneAt = agg.milestones.length > 0
        ? agg.milestones[agg.milestones.length - 1].timestamp
        : null;
      const lifespanMin = lastMilestoneAt
        ? Math.round((new Date(lastMilestoneAt).getTime() - new Date(agg.first_called_at).getTime()) / 60000)
        : null;

      return {
        token_mint: agg.token_mint,
        token_symbol: agg.token_symbol,
        channel_name: 'insiders',
        first_called_at: agg.first_called_at,
        first_call_message_id: agg.first_call_message_id,
        entry_market_cap: agg.entry_market_cap,
        entry_mc_text: agg.entry_mc_text,
        peak_multiplier: peak,
        peak_market_cap: peakMc,
        peak_reached_at: peakAt,
        milestone_count: agg.milestones.length,
        milestone_timeline: agg.milestones,
        last_milestone_at: lastMilestoneAt,
        lifespan_minutes: lifespanMin,
        total_messages: agg.total_messages,
        raw_alert_message: agg.raw_alert_message,
        built_at: new Date().toISOString(),
      };
    });

    // Upsert in chunks of 200 to avoid request size limits
    const CHUNK = 200;
    let upserted = 0;
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('telegram_insider_token_lifecycle')
        .upsert(chunk, { onConflict: 'token_mint' });
      if (error) {
        console.error('[insiders-lifecycle-builder] Upsert error:', error);
        throw error;
      }
      upserted += chunk.length;
    }

    // Compute summary stats
    const stats = {
      total_tokens: upsertRows.length,
      reached_2x: upsertRows.filter(r => r.peak_multiplier >= 2).length,
      reached_3x: upsertRows.filter(r => r.peak_multiplier >= 3).length,
      reached_5x: upsertRows.filter(r => r.peak_multiplier >= 5).length,
      reached_10x: upsertRows.filter(r => r.peak_multiplier >= 10).length,
      reached_15x: upsertRows.filter(r => r.peak_multiplier >= 15).length,
      reached_50x: upsertRows.filter(r => r.peak_multiplier >= 50).length,
      total_milestones_recorded: upsertRows.reduce((s, r) => s + r.milestone_count, 0),
    };

    console.log('[insiders-lifecycle-builder] Done.', stats);

    return new Response(
      JSON.stringify({
        success: true,
        messages_processed: allRows.length,
        tokens_upserted: upserted,
        stats,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[insiders-lifecycle-builder] FATAL:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});