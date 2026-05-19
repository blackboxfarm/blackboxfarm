// dev-family-track-record-rollup
// Aggregates launch history across the entire mesh-discovered "dev family"
// (siblings sharing funder/KYC root). Persists to dev_family_track_record_summary.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertUpsert } from '../_shared/db-assert.ts';
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function deriveVerdict(s: { skill: number; intent: number; luck: number; sustained: number; rugs: number; total: number; familySize: number }): { label: string; one: string } {
  const fam = s.familySize > 1 ? `Operator of ${s.familySize}-wallet cluster` : 'Single-wallet operator';
  if (s.intent <= -50) return { label: 'Serial rugger (family)', one: `${fam} — pattern of dev-driven dumps across ${s.rugs}+ tokens.` };
  if (s.intent <= -20 && s.sustained === 0) return { label: 'Fee farmer (family)', one: `${fam} — many launches, no real builds.` };
  if (s.skill >= 60 && s.intent >= 20) return { label: 'Builder cluster', one: `${fam} with ${s.sustained} sustained successes.` };
  if (s.skill >= 30 && s.luck >= 50) return { label: 'Lucky meme-flipper (family)', one: `${fam} — occasional viral wins, mostly noise.` };
  if (s.skill >= 30) return { label: 'Builder cluster (mixed)', one: `${fam} — some sustained tokens, mixed results.` };
  if (s.luck >= 50) return { label: 'Meme-spammer cluster', one: `${fam} — volume launcher, relies on luck.` };
  if (s.total < 5) return { label: 'New operator', one: `${fam} — not enough history to judge.` };
  return { label: 'Inexperienced launcher cluster', one: `${fam} — mostly low-effort launches that died fast.` };
}

async function aiInterpret(payload: any): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) return null;
  try {
    const res = await meteredAiFetch("dev-family-track-record-rollup", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are a forensic crypto analyst. Write 2-3 sentences (max 90 words) summarising a multi-wallet dev-family track record. Neutral, evidence-based, cite specific counts and KYC root if present. No hype, no slang.' },
          { role: 'user', content: `Dev-family track record JSON:\n${JSON.stringify(payload)}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}

Deno.serve(withRunLog('dev-family-track-record-rollup', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const dev_wallet: string | undefined = body.dev_wallet?.trim();
  if (!dev_wallet || dev_wallet.length < 32) {
    return new Response(JSON.stringify({ error: 'dev_wallet required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1. Resolve mesh family via mesh-shared-funders.
  const { data: meshRes, error: meshErr } = await supabase.functions.invoke('mesh-shared-funders', { body: { wallet: dev_wallet } });
  if (meshErr) throw meshErr;

  const sharedFunders: any[] = meshRes?.shared_funders ?? [];
  const kycRoot = meshRes?.kyc_terminus ?? null;

  // Family = self + every distinct sibling_creator across all funders, capped.
  const family = new Set<string>([dev_wallet]);
  for (const f of sharedFunders) {
    for (const s of (f.sibling_creators ?? [])) {
      family.add(s);
      if (family.size >= 26) break;
    }
    if (family.size >= 26) break;
  }
  const familyWallets = [...family];
  const familySize = familyWallets.length;

  // 2. Aggregate token launches across the family from primary tables.
  const [{ data: lcRows }, { data: pfRows }, { data: histRows }, { data: tlRows }] = await Promise.all([
    supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, token_symbol, creator_wallet, peak_multiplier, peak_market_cap_usd')
      .in('creator_wallet', familyWallets),
    supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, creator_wallet')
      .in('creator_wallet', familyWallets),
    supabase
      .from('dev_token_history')
      .select('token_mint, ticker, dev_wallet, outcome_class, cause_class, pumpfun_market_cap_usd')
      .in('dev_wallet', familyWallets),
    supabase
      .from('token_lifecycle')
      .select('token_mint, creator_wallet, ath_24h_usd, market_cap')
      .in('creator_wallet', familyWallets),
  ]);

  // Dedupe known launches by token_mint.
  type Launch = { token_mint: string; ticker: string | null; dev_wallet: string; outcome?: string | null; cause?: string | null; ath_usd: number };
  const launches = new Map<string, Launch>();

  for (const r of lcRows || []) {
    if (!r.token_mint) continue;
    launches.set(r.token_mint, {
      token_mint: r.token_mint,
      ticker: r.token_symbol,
      dev_wallet: r.creator_wallet,
      outcome: null,
      cause: null,
      ath_usd: Number(r.peak_market_cap_usd ?? 0),
    });
  }
  for (const r of pfRows || []) {
    if (!r.token_mint || launches.has(r.token_mint)) continue;
    launches.set(r.token_mint, {
      token_mint: r.token_mint, ticker: r.token_symbol, dev_wallet: r.creator_wallet,
      outcome: null, cause: null, ath_usd: 0,
    });
  }
  for (const r of tlRows || []) {
    if (!r.token_mint) continue;
    const existing = launches.get(r.token_mint);
    const ath = Number(r.ath_24h_usd ?? r.market_cap ?? 0);
    if (existing) {
      if (ath > existing.ath_usd) existing.ath_usd = ath;
    } else {
      launches.set(r.token_mint, {
        token_mint: r.token_mint, ticker: null, dev_wallet: r.creator_wallet,
        outcome: null, cause: null, ath_usd: ath,
      });
    }
  }
  // Overlay classifier verdicts where present
  for (const r of histRows || []) {
    if (!r.token_mint) continue;
    const existing = launches.get(r.token_mint);
    const ath = Number(r.pumpfun_market_cap_usd ?? 0);
    if (existing) {
      existing.outcome = r.outcome_class ?? existing.outcome;
      existing.cause = r.cause_class ?? existing.cause;
      if (r.ticker) existing.ticker = r.ticker;
      if (ath > existing.ath_usd) existing.ath_usd = ath;
    } else {
      launches.set(r.token_mint, {
        token_mint: r.token_mint, ticker: r.ticker, dev_wallet: r.dev_wallet,
        outcome: r.outcome_class, cause: r.cause_class, ath_usd: ath,
      });
    }
  }

  const all = [...launches.values()];
  const total = all.length;
  const classified = all.filter(l => l.cause).length;

  const byOutcome: Record<string, number> = {};
  const byCause: Record<string, number> = {};
  for (const l of all) {
    if (l.outcome) byOutcome[l.outcome] = (byOutcome[l.outcome] ?? 0) + 1;
    if (l.cause) byCause[l.cause] = (byCause[l.cause] ?? 0) + 1;
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

  // Indices — same math as per-wallet rollup.
  const denom = Math.max(classified, 1);
  const skill_index = classified === 0 ? 0
    : clamp(Math.round(((skill_builds * 1.0 + sustained * 0.8 + marketed_memes * 0.4) / denom) * 100), 0, 100);
  const luck_index = classified === 0 ? 0
    : clamp(Math.round(((viral_memes + flash * 0.5) / denom) * 100), 0, 100);
  const negatives = hard_rugs * 1.0 + bundle_rugs * 0.9 + slow_bleeds * 0.7;
  const positives = skill_builds * 1.0 + sustained * 0.8 + marketed_memes * 0.4;
  const intent_index = classified === 0 ? 0
    : clamp(Math.round(((positives - negatives) / denom) * 100), -100, 100);

  const verdict = deriveVerdict({
    skill: skill_index, intent: intent_index, luck: luck_index,
    sustained, rugs: hard_rugs + bundle_rugs, total, familySize,
  });

  const best = [...all].sort((a, b) => b.ath_usd - a.ath_usd)[0];

  const summaryPayload = {
    dev_wallet, family_size: familySize, family_wallets: familyWallets,
    kyc_root_label: kycRoot?.cex_name ?? null,
    total, classified, byOutcome, byCause,
    skill_index, intent_index, luck_index,
    verdict_label: verdict.label,
    best_token: best ? { ticker: best.ticker, mint: best.token_mint, ath: best.ath_usd } : null,
  };
  const ai = await aiInterpret(summaryPayload);

  await assertUpsert(
    supabase.from('dev_family_track_record_summary').upsert({
      dev_wallet,
      family_size: familySize,
      family_wallets: familyWallets,
      kyc_root_wallet: kycRoot?.wallet ?? null,
      kyc_root_label: kycRoot?.cex_name ?? null,
      total_tokens: total,
      sustained_hits: sustained,
      flash_hits: flash,
      viral_memes, marketed_memes,
      inexperience_fails, dev_abandoneds,
      slow_bleeds, hard_rugs, bundle_rugs,
      community_collapses, skill_builds,
      skill_index, intent_index, luck_index,
      verdict_label: verdict.label,
      verdict_one_liner: verdict.one,
      ai_interpretation: ai,
      best_token_mint: best?.token_mint ?? null,
      best_token_ticker: best?.ticker ?? null,
      best_token_ath_usd: best ? (best.ath_usd || null) : null,
      by_outcome: byOutcome,
      by_cause: byCause,
      last_recomputed_at: new Date().toISOString(),
    }, { onConflict: 'dev_wallet' }),
    'dev_family_track_record_summary',
  );

  return new Response(
    JSON.stringify({ ok: true, ...summaryPayload, ai_interpretation: ai }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));