import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertUpdate } from '../_shared/db-assert.ts';
import { getSolPrice } from '../_shared/sol-price-fetcher.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const INTENT_MULT: Record<string, number> = {
  rug_pull: 1.5,
  soft_rug: 1.35,
  abandoned: 1.2,
  accidental_failure: 1.05,
  organic_death: 1.0,
  unknown: 1.0,
};

// Map autopsy_reports.death_cause to intent multiplier when intent_classification missing
const CAUSE_TO_INTENT: Record<string, string> = {
  rug_pull: 'rug_pull',
  coordinated_rug: 'rug_pull',
  atomic_snipe_rug: 'rug_pull',
  liquidity_pulled: 'rug_pull',
  honeypot: 'rug_pull',
  mint_authority_abuse: 'rug_pull',
  wash_trade_exit: 'soft_rug',
  slow_bleed_dump: 'soft_rug',
  slow_drain: 'soft_rug',
  wallet_washer: 'soft_rug',
  dev_abandonment: 'abandoned',
  mod_abandonment: 'abandoned',
  abandoned: 'abandoned',
  failed_launch: 'accidental_failure',
  community_burnout: 'organic_death',
  hype_decay: 'organic_death',
  organic_death: 'organic_death',
};

function logScale(value: number, max: number): number {
  if (!value || value <= 0) return 0;
  const v = Math.log10(value + 1);
  const m = Math.log10(max + 1);
  return Math.max(0, Math.min(100, (v / m) * 100));
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

async function scoreOne(
  supabase: ReturnType<typeof createClient>,
  report: any,
  solPrice: number
): Promise<{ slug: string; harm_score: number; harm_headline: string }> {
  const tokenMint = report.token_mint as string;
  const slug = report.slug as string;

  // Lifecycle
  const { data: lc } = await supabase
    .from('token_lifecycle')
    .select('market_cap, ath_24h_usd, autopsy_at, intent_classification, death_cause, created_at, creator_wallet')
    .eq('token_mint', tokenMint)
    .maybeSingle();

  const ath = Number(lc?.ath_24h_usd) || 0;
  const finalMcap = Number(lc?.market_cap) || 0;

  // Holder movements
  const { data: movements } = await supabase
    .from('holder_movements')
    .select('wallet_address, action, usd_value, detected_at')
    .eq('token_mint', tokenMint)
    .limit(5000);

  let lossUsd = 0;
  const wallets = new Set<string>();
  if (movements) {
    for (const m of movements as any[]) {
      if (m.wallet_address) wallets.add(m.wallet_address);
      const v = Number(m.usd_value) || 0;
      if (m.action === 'sell') lossUsd += v;
      else if (m.action === 'buy') lossUsd -= v;
    }
  }
  lossUsd = Math.max(0, lossUsd);
  const bagholders = wallets.size;

  // Drawdown
  const drawdownPct = ath > 0 ? Math.max(0, Math.min(100, (1 - finalMcap / ath) * 100)) : (finalMcap === 0 ? 100 : 0);

  // Dev extraction (best-effort): dump_velocity_score % of ATH mcap, in USD
  let devExtractedUsd = 0;
  if (lc?.creator_wallet) {
    const { data: dev } = await supabase
      .from('dev_behavior_scores')
      .select('dump_velocity_score')
      .eq('wallet_address', lc.creator_wallet)
      .maybeSingle();
    const dv = Number(dev?.dump_velocity_score) || 0;
    if (dv > 0 && ath > 0) {
      // Heuristic: rugger walked with up to (dv/100) * 10% of ATH mcap
      devExtractedUsd = (dv / 100) * 0.1 * ath;
    }
  }

  // Speed of death (hours from launch -> autopsy)
  let deathHours = 0;
  if (lc?.created_at && lc?.autopsy_at) {
    deathHours = Math.max(
      0,
      (new Date(lc.autopsy_at).getTime() - new Date(lc.created_at).getTime()) / 3600000
    );
  }
  // Inverse speed score: <6h=100, 168h(7d)=0
  const speedScore = deathHours <= 0 ? 50 : Math.max(0, Math.min(100, 100 - (deathHours / 168) * 100));

  // Component scores (each 0-100)
  const lossComp = logScale(lossUsd, 1_000_000); // $1M → 100
  const bagComp = logScale(bagholders, 5000);    // 5000 → 100
  const drawComp = drawdownPct;
  const devComp = logScale(devExtractedUsd, 500_000);
  const speedComp = speedScore;

  // Weighted
  const base =
    lossComp * 0.35 +
    bagComp * 0.20 +
    drawComp * 0.15 +
    devComp * 0.15 +
    speedComp * 0.10;

  // Intent
  const intentRaw = (lc?.intent_classification as string) ||
    CAUSE_TO_INTENT[report.death_cause as string] ||
    CAUSE_TO_INTENT[lc?.death_cause as string] ||
    'unknown';
  const mult = INTENT_MULT[intentRaw] ?? 1.0;

  const harmScore = Math.max(0, Math.min(100, Math.round(base * mult)));

  const headlineParts: string[] = [];
  if (lossUsd > 0) headlineParts.push(`${fmtUsd(lossUsd)} vaporized`);
  if (bagholders > 0) headlineParts.push(`${bagholders.toLocaleString()} bagholders`);
  if (headlineParts.length === 0 && drawdownPct > 0) headlineParts.push(`${drawdownPct.toFixed(0)}% drawdown`);
  const headline = headlineParts.join(' · ') || 'Insufficient on-chain data';

  const breakdown = {
    loss_usd: Math.round(lossUsd),
    bagholders,
    drawdown_pct: Math.round(drawdownPct * 10) / 10,
    dev_extracted_usd: Math.round(devExtractedUsd),
    death_hours: Math.round(deathHours),
    intent: intentRaw,
    multiplier: mult,
    sol_price_used: solPrice,
    components: {
      loss: Math.round(lossComp * 0.35),
      bag: Math.round(bagComp * 0.20),
      draw: Math.round(drawComp * 0.15),
      dev: Math.round(devComp * 0.15),
      speed: Math.round(speedComp * 0.10),
    },
  };

  await assertUpdate(
    supabase
      .from('autopsy_reports')
      .update({
        harm_score: harmScore,
        harm_breakdown: breakdown,
        harm_headline: headline,
        harm_scored_at: new Date().toISOString(),
      })
      .eq('slug', slug),
    'autopsy_reports'
  );

  return { slug, harm_score: harmScore, harm_headline: headline };
}

Deno.serve(withRunLog('autopsy-harm-scorer', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = await req.json().catch(() => ({}));
  const slug = body.slug as string | undefined;
  const tokenMint = body.token_mint as string | undefined;
  const all = body.all === true;
  const limit = Math.min(Number(body.limit) || 50, 200);

  let query = supabase.from('autopsy_reports').select('slug, token_mint, death_cause');
  if (slug) query = query.eq('slug', slug);
  else if (tokenMint) query = query.eq('token_mint', tokenMint);
  else if (all) query = query.order('created_at', { ascending: false }).limit(limit);
  else {
    return new Response(JSON.stringify({ error: 'provide slug, token_mint, or all=true' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: reports, error } = await query;
  if (error) throw error;
  if (!reports || reports.length === 0) {
    return new Response(JSON.stringify({ message: 'no reports', processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const solPrice = await getSolPrice('autopsy-harm-scorer').catch(() => 0);

  const results: Array<{ slug: string; harm_score: number; harm_headline: string }> = [];
  const errors: Array<{ slug: string; error: string }> = [];
  for (const r of reports as any[]) {
    try {
      const out = await scoreOne(supabase, r, solPrice);
      results.push(out);
      await new Promise((r) => setTimeout(r, 50));
    } catch (e: any) {
      errors.push({ slug: r.slug, error: e?.message || String(e) });
    }
  }

  return new Response(
    JSON.stringify({ success: true, processed: results.length, sol_price: solPrice, results, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}));