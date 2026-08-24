// alpha-paper-monitor
// Runs every minute via cron. For each OPEN alpha_paper_trades row:
//   1. Fetch current price/mcap from DexScreener (fallback: Pump.fun)
//   2. Update peak_* if new high
//   3. If price hits target_multiplier (default 2x) → close as WIN, SMS admin
//   4. If price hits 0 / delisted / >24h with no data → mark 'dead'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';
const ADMIN_PHONE = '+12265835975';

async function fetchDex(mint: string): Promise<{ price: number | null; mcap: number | null }> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!r.ok) return { price: null, mcap: null };
    const j = await r.json();
    const pairs = j?.pairs || [];
    if (pairs.length === 0) return { price: null, mcap: null };
    // best liquidity pair
    const best = pairs.reduce((a: any, b: any) =>
      Number(a?.liquidity?.usd || 0) >= Number(b?.liquidity?.usd || 0) ? a : b);
    return {
      price: Number(best.priceUsd) || null,
      mcap: Number(best.marketCap ?? best.fdv ?? null) || null,
    };
  } catch { return { price: null, mcap: null }; }
}

async function fetchPump(mint: string): Promise<{ price: number | null; mcap: number | null }> {
  try {
    const r = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!r.ok) return { price: null, mcap: null };
    const j = await r.json();
    return { price: null, mcap: Number(j?.usd_market_cap) || null };
  } catch { return { price: null, mcap: null }; }
}

async function sendSms(body: string): Promise<void> {
  if (Deno.env.get('SMS_GLOBAL_KILL') !== 'false') {
    console.warn('[SMS KILL] alpha-paper-monitor SMS suppressed. Set SMS_GLOBAL_KILL=false to re-enable.');
    return;
  }
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) return;
  try {
    await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: ADMIN_PHONE, From: TWILIO_FROM, Body: body.slice(0, 1600) }),
    });
  } catch {}
}

function fmtMoney(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Number(n).toFixed(2)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Config knobs (stop loss)
  const { data: cfg } = await supabase.from('alpha_config').select('stop_loss_pct, live_sell_enabled').eq('id', 1).maybeSingle();
  const stopLossPct = Number(cfg?.stop_loss_pct ?? 0.70); // 70% drop
  const stopMult = 1 - stopLossPct; // e.g. 0.30
  const liveSellEnabled = cfg?.live_sell_enabled !== false;

  async function triggerLiveSell(trade: any, reason: 'target_hit' | 'stop_loss'): Promise<void> {
    if (!liveSellEnabled) return;
    if (!trade.flip_position_id || trade.live_buy_status !== 'executed') return;
    if (trade.live_sell_status && trade.live_sell_status !== 'failed') return;
    try {
      const { data: execRes, error: execErr } = await supabase.functions.invoke('flipit-execute', {
        body: {
          action: 'sell',
          positionId: trade.flip_position_id,
          tokenMint: trade.mint,
          slippageBps: 3000,
          priorityFeeMode: 'custom',
          priorityFeeMicroLamports: 300000,
          jitoTipLamports: 300000,
          source: `alpha-paper-monitor:${reason}`,
        },
      });
      const status = execErr ? 'failed' : execRes?.error ? 'failed' : 'executed';
      const sig = execRes?.signature || execRes?.sellTxSignature || execRes?.tx || null;
      const err = execErr?.message || (execRes?.error ? String(execRes.error).slice(0, 500) : null);
      await supabase.from('alpha_paper_trades').update({
        live_sell_status: status,
        live_sell_signature: sig,
        live_sell_error: err,
        live_sell_at: status === 'executed' ? new Date().toISOString() : null,
      }).eq('id', trade.id);
    } catch (e: any) {
      await supabase.from('alpha_paper_trades').update({
        live_sell_status: 'failed',
        live_sell_error: (e?.message || String(e)).slice(0, 500),
      }).eq('id', trade.id);
    }
  }

  const { data: trades, error } = await supabase
    .from('alpha_paper_trades')
    .select('id, mint, ticker, entry_market_cap, entry_price_usd, size_usd, target_multiplier, peak_multiplier, created_at, check_count, flip_position_id, live_buy_status, live_sell_status')
    .eq('status', 'open')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: any[] = [];
  const now = new Date();

  // Sweep in short bursts to approximate 15s cadence within this 1-minute invocation.
  // 4 passes × ~15s = one full minute; each pass hits every open trade.
  const PASSES = 4;
  for (let pass = 0; pass < PASSES; pass++) {
    for (const t of trades || []) {
      // Skip if already closed in a prior pass this run
      const { data: cur } = await supabase.from('alpha_paper_trades')
        .select('status, flip_position_id, live_buy_status, live_sell_status').eq('id', t.id).maybeSingle();
      if (!cur || cur.status !== 'open') continue;

      let live = await fetchDex(t.mint);
      if (!live.price && !live.mcap) live = await fetchPump(t.mint);

      const entryMc = Number(t.entry_market_cap || 0);
      const entryPx = Number(t.entry_price_usd || 0);
      const target = Number(t.target_multiplier || 2);

      // Compute current multiplier — prefer price, fallback mcap
      let curMult: number | null = null;
      if (live.price && entryPx > 0) curMult = live.price / entryPx;
      else if (live.mcap && entryMc > 0) curMult = live.mcap / entryMc;

      const update: any = {
        last_checked_at: new Date().toISOString(),
        check_count: (t.check_count || 0) + 1,
      };

      if (curMult !== null) {
        const prevPeak = Number(t.peak_multiplier || 0);
        if (curMult > prevPeak) {
          update.peak_multiplier = curMult;
          update.peak_price_usd = live.price;
          update.peak_market_cap = live.mcap;
          update.peak_at = new Date().toISOString();
        }

        // WIN — hit 2x target
        if (curMult >= target) {
          update.status = 'closed';
          update.exit_reason = 'target_hit';
          update.exit_price_usd = live.price;
          update.exit_market_cap = live.mcap;
          update.exit_multiplier = curMult;
          update.exit_at = new Date().toISOString();
          update.pnl_usd = Number((Number(t.size_usd || 0) * (curMult - 1)).toFixed(2));

          await supabase.from('alpha_paper_trades').update(update).eq('id', t.id);

          await triggerLiveSell({ ...t, ...cur }, 'target_hit');

          const tk = t.ticker ? `$${t.ticker}` : t.mint.slice(0, 6);
          await sendSms(
            `🎯 PAPER SELL ${tk} @ ${curMult.toFixed(2)}x\n` +
            `Entry MC: ${fmtMoney(entryMc)}\n` +
            `Exit MC:  ${fmtMoney(live.mcap)}\n` +
            `P&L: +$${update.pnl_usd} on $${t.size_usd}\n` +
            `Dex: https://dexscreener.com/solana/${t.mint}`
          );
          results.push({ id: t.id, mint: t.mint, action: 'sold', mult: curMult });
          continue;
        }

        // STOP LOSS — hard cut at -70% (Rule 2)
        if (curMult <= stopMult) {
          update.status = 'closed';
          update.exit_reason = 'stop_loss';
          update.exit_price_usd = live.price;
          update.exit_market_cap = live.mcap;
          update.exit_multiplier = curMult;
          update.exit_at = new Date().toISOString();
          update.pnl_usd = Number((Number(t.size_usd || 0) * (curMult - 1)).toFixed(2));

          await supabase.from('alpha_paper_trades').update(update).eq('id', t.id);

          await triggerLiveSell({ ...t, ...cur }, 'stop_loss');

          const tk = t.ticker ? `$${t.ticker}` : t.mint.slice(0, 6);
          const dropPct = ((1 - curMult) * 100).toFixed(0);
          await sendSms(
            `🛑 STOP LOSS ${tk} -${dropPct}%\n` +
            `Entry MC: ${fmtMoney(entryMc)}\n` +
            `Exit MC:  ${fmtMoney(live.mcap)}\n` +
            `P&L: $${update.pnl_usd} on $${t.size_usd}\n` +
            `Dex: https://dexscreener.com/solana/${t.mint}`
          );
          results.push({ id: t.id, mint: t.mint, action: 'stop_loss', mult: curMult });
          continue;
        }
      } else {
        // No live data — mark dead if trade is >24h old
        const ageMs = now.getTime() - new Date(t.created_at).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) {
          update.status = 'closed';
          update.exit_reason = 'no_price_data_24h';
          update.exit_at = new Date().toISOString();
          update.pnl_usd = -Number(t.size_usd || 0);
        }
      }

      await supabase.from('alpha_paper_trades').update(update).eq('id', t.id);
      results.push({ id: t.id, mint: t.mint, mult: curMult, status: update.status || 'open' });
    }

    if (pass < PASSES - 1) {
      await new Promise((r) => setTimeout(r, 15000));
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked: trades?.length || 0, passes: PASSES, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});