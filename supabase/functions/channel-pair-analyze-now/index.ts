// On-demand version of channel-pair-analyzer; accepts pair_id + custom window
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { assertInsert } from '../_shared/db-assert.ts';
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Call {
  token_mint: string;
  token_symbol: string | null;
  message_timestamp: string;
  price_at_call: number | null;
  market_cap_at_call: number | null;
  caller_username: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json().catch(() => ({}));
    const pairId = body.pair_id as string | undefined;
    const hours = Math.min(Math.max(Number(body.hours || 1), 1), 24);
    if (!pairId) {
      return new Response(JSON.stringify({ error: 'pair_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pair, error: pErr } = await supabase
      .from('channel_comparison_pairs')
      .select('*')
      .eq('id', pairId)
      .single();
    if (pErr || !pair) throw new Error('Pair not found');

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - hours * 3600000);

    const { data: vipCalls } = await supabase
      .from('telegram_channel_calls')
      .select('token_mint, token_symbol, message_timestamp, price_at_call, market_cap_at_call, caller_username')
      .eq('channel_id', pair.vip_channel_id)
      .gte('message_timestamp', windowStart.toISOString())
      .lt('message_timestamp', windowEnd.toISOString())
      .order('message_timestamp', { ascending: true });
    const { data: pubCalls } = await supabase
      .from('telegram_channel_calls')
      .select('token_mint, token_symbol, message_timestamp, price_at_call, market_cap_at_call, caller_username')
      .eq('channel_id', pair.public_channel_id)
      .gte('message_timestamp', windowStart.toISOString())
      .lt('message_timestamp', windowEnd.toISOString())
      .order('message_timestamp', { ascending: true });

    const vip: Call[] = vipCalls || [];
    const pub: Call[] = pubCalls || [];
    const vipFirst = new Map<string, Call>();
    for (const c of vip) if (!vipFirst.has(c.token_mint)) vipFirst.set(c.token_mint, c);
    const pubFirst = new Map<string, Call>();
    for (const c of pub) if (!pubFirst.has(c.token_mint)) pubFirst.set(c.token_mint, c);

    const overlap: any[] = [];
    const leadOverlap: any[] = [];
    let leadSum = 0, leadCount = 0;
    for (const [mint, vc] of vipFirst.entries()) {
      if (pubFirst.has(mint)) {
        const pc = pubFirst.get(mint)!;
        const leadSec = Math.round(
          (new Date(pc.message_timestamp).getTime() - new Date(vc.message_timestamp).getTime()) / 1000,
        );
        overlap.push({ mint, symbol: vc.token_symbol, vip_at: vc.message_timestamp, public_at: pc.message_timestamp });
        leadOverlap.push({ mint, symbol: vc.token_symbol, lead_seconds: leadSec });
        leadSum += leadSec; leadCount++;
      }
    }
    const vipExclusives = [...vipFirst.entries()].filter(([m]) => !pubFirst.has(m))
      .map(([m, c]) => ({ mint: m, symbol: c.token_symbol, at: c.message_timestamp, mcap: c.market_cap_at_call }));
    const pubExclusives = [...pubFirst.entries()].filter(([m]) => !vipFirst.has(m))
      .map(([m, c]) => ({ mint: m, symbol: c.token_symbol, at: c.message_timestamp, mcap: c.market_cap_at_call }));

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const vipAvgMcap = avg(vip.map((c) => c.market_cap_at_call || 0).filter((x) => x > 0));
    const pubAvgMcap = avg(pub.map((c) => c.market_cap_at_call || 0).filter((x) => x > 0));
    const avgLead = leadCount ? leadSum / leadCount : null;

    const allMints = [...new Set([...vipFirst.keys(), ...pubFirst.keys()])];
    const priceMap: Record<string, number> = {};
    if (allMints.length) {
      const { data: prices } = await supabase
        .from('token_price_history')
        .select('token_mint, price_usd, captured_at')
        .in('token_mint', allMints)
        .order('captured_at', { ascending: false });
      if (prices) for (const p of prices) {
        if (!(p.token_mint in priceMap)) priceMap[p.token_mint] = p.price_usd;
      }
    }

    const computePnl = (firstMap: Map<string, Call>) => {
      const mults: number[] = [];
      let best = { symbol: '', mult: 0 };
      let worst = { symbol: '', mult: Infinity };
      for (const [mint, c] of firstMap.entries()) {
        const cur = priceMap[mint];
        if (!cur || !c.price_at_call || c.price_at_call <= 0) continue;
        const mult = cur / c.price_at_call;
        mults.push(mult);
        if (mult > best.mult) best = { symbol: c.token_symbol || mint.slice(0, 6), mult };
        if (mult < worst.mult) worst = { symbol: c.token_symbol || mint.slice(0, 6), mult };
      }
      const wins = mults.filter((m) => m >= 1.5).length;
      return {
        tracked: mults.length,
        avg_multiplier: mults.length ? mults.reduce((a, b) => a + b, 0) / mults.length : null,
        win_rate: mults.length ? wins / mults.length : null,
        best: best.mult > 0 ? best : null,
        worst: worst.mult !== Infinity ? worst : null,
      };
    };
    const vipPnl = computePnl(vipFirst);
    const pubPnl = computePnl(pubFirst);

    let aiSummary = '';
    let aiVerdict = 'insufficient_data';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (LOVABLE_API_KEY && (vip.length || pub.length)) {
      const stats = {
        pair_name: pair.pair_name,
        window_hours: hours,
        vip: { count: vip.length, avg_mcap: vipAvgMcap, pnl: vipPnl, exclusives: vipExclusives.length },
        public: { count: pub.length, avg_mcap: pubAvgMcap, pnl: pubPnl, exclusives: pubExclusives.length },
        overlap_count: overlap.length,
        avg_vip_lead_seconds: avgLead,
        sample_overlaps: leadOverlap.slice(0, 10),
      };
      try {
        const aiRes = await meteredAiFetch("channel-pair-analyze-now", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              { role: 'system', content: 'You are a crypto Telegram channel comparison analyst. Compare a VIP/paid channel vs its public counterpart. Write a concise 4-6 sentence briefing in markdown. Then on a new line, output exactly: VERDICT: <one of: vip_clearly_earlier | marginal_edge | no_edge | public_actually_earlier | insufficient_data>' },
              { role: 'user', content: `Stats:\n${JSON.stringify(stats, null, 2)}` },
            ],
          }),
        });
        const aiData = await aiRes.json();
        const text = aiData?.choices?.[0]?.message?.content || '';
        const m = text.match(/VERDICT:\s*(\w+)/i);
        if (m) aiVerdict = m[1].toLowerCase();
        aiSummary = text.replace(/VERDICT:.*$/im, '').trim();
      } catch (e) {
        console.warn('[analyze-now] AI failed:', e);
        aiSummary = 'AI summary unavailable.';
      }
    }

    const inserted = await assertInsert(
      supabase.from('channel_pair_comparison_runs').insert({
        pair_id: pair.id,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        is_manual: true,
        vip_call_count: vip.length,
        public_call_count: pub.length,
        overlap_tokens: overlap,
        vip_lead_overlap: leadOverlap,
        vip_exclusives: vipExclusives,
        public_exclusives: pubExclusives,
        vip_avg_mcap_at_call: vipAvgMcap,
        public_avg_mcap_at_call: pubAvgMcap,
        vip_avg_lead_seconds: avgLead,
        vip_pnl_summary: vipPnl,
        public_pnl_summary: pubPnl,
        ai_summary: aiSummary,
        ai_verdict: aiVerdict,
      }).select().single(),
      'channel_pair_comparison_runs',
    );

    return new Response(JSON.stringify({ ok: true, run: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[analyze-now] fatal:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
