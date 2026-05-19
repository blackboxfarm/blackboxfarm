// dev-track-record-rollup
// Compute counts, indices, verdict label, and AI interpretation paragraph
// for a dev wallet from its dev_token_history rows.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertUpsert } from '../_shared/db-assert.ts';
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function deriveVerdict(s: { skill: number; intent: number; luck: number; sustained: number; rugs: number; total: number }): { label: string; one: string } {
  if (s.intent <= -50) return { label: 'Serial rugger', one: `Pattern of dev-driven dumps across ${s.rugs}+ tokens.` };
  if (s.intent <= -20 && s.sustained === 0) return { label: 'Fee farmer', one: 'Lots of launches, no real builds.' };
  if (s.skill >= 60 && s.intent >= 20) return { label: 'Builder with hits', one: `${s.sustained} sustained successes, low rug history.` };
  if (s.skill >= 30 && s.luck >= 50) return { label: 'Lucky meme-flipper', one: 'Occasional viral wins, mostly noise.' };
  if (s.skill >= 30) return { label: 'Builder with misses', one: 'Some sustained tokens, mixed results.' };
  if (s.luck >= 50) return { label: 'Meme-spammer', one: 'Volume launcher; relies on luck not skill.' };
  if (s.total < 5) return { label: 'New dev', one: 'Not enough history to judge.' };
  return { label: 'Inexperienced launcher', one: 'Mostly low-effort launches that died fast.' };
}

async function aiInterpret(payload: any): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return null;
  try {
    const res = await meteredAiFetch("dev-track-record-rollup", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are a forensic crypto analyst. Write 2-3 sentences (max 80 words), neutral, evidence-based, summarising a dev wallet\'s track record. No hype, no slang. Cite specific counts.' },
          { role: 'user', content: `Dev track record JSON:\n${JSON.stringify(payload)}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}

Deno.serve(withRunLog('dev-track-record-rollup', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const dev_wallet: string | undefined = body.dev_wallet?.trim();
  if (!dev_wallet) {
    return new Response(JSON.stringify({ error: 'dev_wallet required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: rows, error } = await supabase
    .from('dev_token_history')
    .select('outcome_class, cause_class, ticker, token_mint, pumpfun_market_cap_usd')
    .eq('dev_wallet', dev_wallet);
  if (error) throw error;

  const all = rows || [];
  const total = all.length;
  const classified = all.filter(r => r.cause_class).length;

  const byOutcome: Record<string, number> = {};
  const byCause: Record<string, number> = {};
  for (const r of all) {
    if (r.outcome_class) byOutcome[r.outcome_class] = (byOutcome[r.outcome_class] ?? 0) + 1;
    if (r.cause_class) byCause[r.cause_class] = (byCause[r.cause_class] ?? 0) + 1;
  }

  const sustained = byOutcome['success_sustained'] ?? 0;
  const flash = byOutcome['success_flash'] ?? 0;
  const hard_rugs = byCause['hard_rug'] ?? 0;
  const slow_bleeds = byCause['slow_bleed'] ?? 0;
  const bundle_rugs = byCause['bundle_rug'] ?? 0;
  const community_collapses = byCause['community_collapse'] ?? 0;
  const inexperience_fails = byCause['inexperience_fail'] ?? 0;
  const dev_abandoneds = byCause['dev_abandoned'] ?? 0;
  const viral_memes = byCause['viral_meme'] ?? 0;
  const marketed_memes = byCause['marketed_meme'] ?? 0;
  const skill_builds = byCause['skill_build'] ?? 0;

  // Indices
  const skill_index = total === 0 ? 0
    : clamp(Math.round(((skill_builds * 1.0 + sustained * 0.8 + marketed_memes * 0.4) / total) * 100), 0, 100);
  const luck_index = total === 0 ? 0
    : clamp(Math.round(((viral_memes + flash * 0.5) / total) * 100), 0, 100);
  const negatives = hard_rugs * 1.0 + bundle_rugs * 0.9 + slow_bleeds * 0.7;
  const positives = skill_builds * 1.0 + sustained * 0.8 + marketed_memes * 0.4;
  const intent_index = total === 0 ? 0
    : clamp(Math.round(((positives - negatives) / total) * 100), -100, 100);

  const verdict = deriveVerdict({
    skill: skill_index, intent: intent_index, luck: luck_index,
    sustained, rugs: hard_rugs + bundle_rugs, total,
  });

  // Best token (highest pumpfun mcap snapshot — proxy for ATH)
  const best = [...all].sort((a, b) => Number(b.pumpfun_market_cap_usd ?? 0) - Number(a.pumpfun_market_cap_usd ?? 0))[0];

  const summaryPayload = {
    dev_wallet, total, classified, byOutcome, byCause,
    skill_index, intent_index, luck_index,
    verdict_label: verdict.label,
    best_token: best ? { ticker: best.ticker, mcap: best.pumpfun_market_cap_usd } : null,
  };
  const ai = await aiInterpret(summaryPayload);

  await assertUpsert(
    supabase.from('dev_track_record_summary').upsert({
      dev_wallet,
      total_tokens: total,
      classified_tokens: classified,
      by_outcome: byOutcome,
      by_cause: byCause,
      sustained_hits: sustained,
      flash_hits: flash,
      hard_rugs, slow_bleeds, bundle_rugs,
      community_collapses, inexperience_fails, dev_abandoneds,
      viral_memes, marketed_memes, skill_builds,
      skill_index, intent_index, luck_index,
      verdict_label: verdict.label,
      verdict_one_liner: verdict.one,
      ai_interpretation: ai,
      best_token_mint: best?.token_mint ?? null,
      best_token_ticker: best?.ticker ?? null,
      best_token_ath_usd: best ? Number(best.pumpfun_market_cap_usd) || null : null,
      last_classified_at: new Date().toISOString(),
      last_recomputed_at: new Date().toISOString(),
    }, { onConflict: 'dev_wallet' }),
    'dev_track_record_summary',
  );

  return new Response(
    JSON.stringify({ ok: true, ...summaryPayload, ai_interpretation: ai }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
