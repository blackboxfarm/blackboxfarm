// dev-token-outcome-classifier
// For every dev_token_history row with NULL cause_class, derive an outcome_class
// + cause_class. Pure deterministic rules first; AI tiebreaker for ambiguous
// cases. Pulls extra signals from public.token_lifecycle when available.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertUpdate } from '../_shared/db-assert.ts';
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Outcome = 'success_sustained' | 'success_flash' | 'mid' | 'dead_low' | 'graduated_then_died';
type Cause = 'skill_build' | 'viral_meme' | 'marketed_meme' | 'community_collapse'
  | 'inexperience_fail' | 'slow_bleed' | 'hard_rug' | 'bundle_rug' | 'dev_abandoned';

interface Signals {
  ticker: string | null;
  name: string | null;
  ath_usd: number | null;
  hours_in_top_200: number;
  graduated: boolean;
  death_cause: string | null;
  has_socials: boolean;
  intent_classification: string | null;
  pumpfun_mcap: number | null;
  age_hours: number | null;
}

function deriveOutcome(s: Signals): Outcome {
  const ath = s.ath_usd ?? s.pumpfun_mcap ?? 0;
  if (s.graduated && (s.death_cause || (s.pumpfun_mcap ?? 0) < 5000)) return 'graduated_then_died';
  if (ath >= 100_000 && s.hours_in_top_200 >= 24) return 'success_sustained';
  if (ath >= 100_000) return 'success_flash';
  if (ath >= 20_000) return 'mid';
  return 'dead_low';
}

function deriveCauseRules(s: Signals, outcome: Outcome): { cause: Cause | null; conf: number; evidence: any } {
  const ev: any = { ath: s.ath_usd, hrs_top200: s.hours_in_top_200, socials: s.has_socials, death: s.death_cause };

  // Hard rug / bleed signals come from intent_classification (already computed elsewhere).
  const intent = (s.intent_classification || '').toLowerCase();
  if (intent.includes('rug') || intent === 'hard_rug') return { cause: 'hard_rug', conf: 90, evidence: { ...ev, intent } };
  if (intent.includes('bundle')) return { cause: 'bundle_rug', conf: 85, evidence: { ...ev, intent } };
  if (intent.includes('bleed') || intent.includes('slow_drain')) return { cause: 'slow_bleed', conf: 80, evidence: { ...ev, intent } };

  // Sustained build → skill
  if (outcome === 'success_sustained' && s.has_socials) return { cause: 'skill_build', conf: 70, evidence: ev };

  // Flash hit → meme luck (vs marketed meme — needs socials at launch)
  if (outcome === 'success_flash') {
    return s.has_socials
      ? { cause: 'marketed_meme', conf: 55, evidence: ev }
      : { cause: 'viral_meme', conf: 60, evidence: ev };
  }

  // Dead low + no socials + short life → inexperience
  if (outcome === 'dead_low' && !s.has_socials && (s.age_hours ?? 0) < 6) {
    return { cause: 'inexperience_fail', conf: 65, evidence: ev };
  }

  // Dead low + had socials but dev silent → abandoned
  if (outcome === 'dead_low' && s.has_socials) {
    return { cause: 'dev_abandoned', conf: 50, evidence: ev };
  }

  // Mid that died with holders draining → community collapse
  if ((outcome === 'mid' || outcome === 'graduated_then_died') && !intent.includes('rug')) {
    return { cause: 'community_collapse', conf: 45, evidence: ev };
  }

  // Ambiguous
  return { cause: null, conf: 0, evidence: ev };
}

async function aiTiebreak(rows: Array<{ id: string; ticker: string | null; signals: Signals; outcome: Outcome }>): Promise<Map<string, { cause: Cause; conf: number }>> {
  const out = new Map<string, { cause: Cause; conf: number }>();
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY || rows.length === 0) return out;

  const items = rows.map(r => ({ id: r.id, ticker: r.ticker, outcome: r.outcome, ...r.signals }));
  const sys = `You classify the CAUSE of a Solana memecoin's outcome based on lifecycle signals.
Return one cause per token from this enum: skill_build, viral_meme, marketed_meme, community_collapse, inexperience_fail, slow_bleed, hard_rug, bundle_rug, dev_abandoned.
Be conservative; prefer community_collapse or dev_abandoned over rug labels unless intent_classification clearly says rug.`;

  const res = await meteredAiFetch("dev-token-outcome-classifier", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Classify each token. Tokens:\n${JSON.stringify(items)}` },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'classify_tokens',
          description: 'Return cause + confidence for each token id.',
          parameters: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    cause: { type: 'string', enum: ['skill_build','viral_meme','marketed_meme','community_collapse','inexperience_fail','slow_bleed','hard_rug','bundle_rug','dev_abandoned'] },
                    confidence: { type: 'number' },
                  },
                  required: ['id','cause','confidence'],
                },
              },
            },
            required: ['results'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'classify_tokens' } },
    }),
  });

  if (!res.ok) {
    console.warn('[outcome-classifier] AI tiebreak failed:', res.status, await res.text().catch(() => ''));
    return out;
  }
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return out;
  try {
    const parsed = JSON.parse(args);
    for (const r of parsed.results || []) {
      out.set(r.id, { cause: r.cause, conf: Math.min(100, Math.max(0, Math.round(r.confidence ?? 50))) });
    }
  } catch (e) {
    console.warn('[outcome-classifier] AI parse failed:', e);
  }
  return out;
}

Deno.serve(withRunLog('dev-token-outcome-classifier', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const dev_wallet: string | undefined = body.dev_wallet?.trim();
  const useAI: boolean = body.useAI !== false;

  if (!dev_wallet) {
    return new Response(JSON.stringify({ error: 'dev_wallet required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pull all rows for this dev (re-classify all so updated signals reflow).
  const { data: rows, error } = await supabase
    .from('dev_token_history')
    .select('id, token_mint, ticker, name, pumpfun_market_cap_usd, pumpfun_complete, created_at_chain')
    .eq('dev_wallet', dev_wallet);
  if (error) throw error;
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, classified: 0, message: 'no rows' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const mints = rows.map(r => r.token_mint);
  const { data: lcRows } = await supabase
    .from('token_lifecycle')
    .select('token_mint, ath_alltime_usd, total_hours_in_top_200, death_cause, intent_classification, twitter_url, telegram_url, website_url, first_seen_at, last_seen_at')
    .in('token_mint', mints);
  const lcMap = new Map<string, any>();
  for (const lc of lcRows || []) lcMap.set(lc.token_mint, lc);

  const ambiguous: Array<{ id: string; ticker: string | null; signals: Signals; outcome: Outcome }> = [];
  const rulesResults: Array<{ id: string; outcome: Outcome; cause: Cause; conf: number; evidence: any }> = [];

  for (const r of rows) {
    const lc = lcMap.get(r.token_mint) || {};
    const ageH = r.created_at_chain
      ? (Date.now() - new Date(r.created_at_chain).getTime()) / 3_600_000
      : null;
    const sig: Signals = {
      ticker: r.ticker,
      name: r.name,
      ath_usd: lc.ath_alltime_usd ?? null,
      hours_in_top_200: Number(lc.total_hours_in_top_200) || 0,
      graduated: r.pumpfun_complete === true,
      death_cause: lc.death_cause ?? null,
      has_socials: Boolean(lc.twitter_url || lc.telegram_url || lc.website_url),
      intent_classification: lc.intent_classification ?? null,
      pumpfun_mcap: Number(r.pumpfun_market_cap_usd) || null,
      age_hours: ageH,
    };
    const outcome = deriveOutcome(sig);
    const ruled = deriveCauseRules(sig, outcome);
    if (ruled.cause) {
      rulesResults.push({ id: r.id, outcome, cause: ruled.cause, conf: ruled.conf, evidence: ruled.evidence });
    } else {
      ambiguous.push({ id: r.id, ticker: r.ticker, signals: sig, outcome });
    }
  }

  // AI tiebreak for ambiguous (capped at 50 per call to keep prompt sane)
  const aiMap = new Map<string, { cause: Cause; conf: number }>();
  if (useAI && ambiguous.length > 0) {
    for (let i = 0; i < ambiguous.length; i += 50) {
      const batch = ambiguous.slice(i, i + 50);
      const got = await aiTiebreak(batch);
      for (const [k, v] of got) aiMap.set(k, v);
    }
  }

  let classified = 0;
  let aiUsed = 0;
  for (const r of rulesResults) {
    await assertUpdate(
      supabase.from('dev_token_history').update({
        outcome_class: r.outcome,
        cause_class: r.cause,
        cause_confidence: r.conf,
        cause_evidence: r.evidence,
        classified_at: new Date().toISOString(),
        ai_used: false,
      }).eq('id', r.id),
      'dev_token_history',
    );
    classified++;
  }
  for (const a of ambiguous) {
    const ai = aiMap.get(a.id);
    const cause = ai?.cause ?? 'community_collapse';
    const conf = ai?.conf ?? 30;
    await assertUpdate(
      supabase.from('dev_token_history').update({
        outcome_class: a.outcome,
        cause_class: cause,
        cause_confidence: conf,
        cause_evidence: { ...a.signals, ai_tiebreak: !!ai },
        classified_at: new Date().toISOString(),
        ai_used: !!ai,
      }).eq('id', a.id),
      'dev_token_history',
    );
    classified++;
    if (ai) aiUsed++;
  }

  return new Response(
    JSON.stringify({ ok: true, dev_wallet, classified, ambiguous: ambiguous.length, ai_used: aiUsed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
