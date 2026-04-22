// Insiders Mesh Promoter
// For every insider-channel token with peak_multiplier >= 3 AND no rug pattern,
// promotes the creator wallet into reputation_mesh as a good actor.
//
// Criteria (per user spec): >=3x ATH AND no rug.
// "No rug" = creator's risk_tier in dev_behavior_scores is NOT in
//   ('bad_actor', 'suspicious') AND no scam flag in token_lifecycle.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BAD_TIERS = new Set(['bad_actor', 'suspicious', 'rugger']);
const BAD_TRUST_LEVELS = new Set(['rugger', 'serial_rugger', 'scammer', 'blacklisted']);
const THIS_TOKEN_RUG_CAUSES = new Set(['rug_pull', 'lp_pulled', 'scam', 'rug']);

async function resolveCreator(supabase: any, mint: string): Promise<string | null> {
  const { data: lc } = await supabase
    .from('token_lifecycle')
    .select('creator_wallet')
    .eq('token_mint', mint)
    .maybeSingle();
  return lc?.creator_wallet || null;
}

interface CreatorRisk {
  riskTier: string | null;
  trustLevel: string | null;
  tokensRugged: number;
  autoBlacklisted: boolean;
  devHistoryRug: boolean;
}

async function getCreatorRisk(supabase: any, wallet: string): Promise<CreatorRisk> {
  const [{ data: bs }, { data: rep }] = await Promise.all([
    supabase.from('dev_behavior_scores').select('risk_tier').eq('wallet_address', wallet).maybeSingle(),
    supabase.from('dev_wallet_reputation').select('trust_level, tokens_rugged, auto_blacklisted').eq('wallet_address', wallet).maybeSingle(),
  ]);
  const riskTier = bs?.risk_tier || null;
  const trustLevel = rep?.trust_level || null;
  const tokensRugged = rep?.tokens_rugged || 0;
  const autoBlacklisted = !!rep?.auto_blacklisted;
  const devHistoryRug =
    (riskTier && BAD_TIERS.has(riskTier)) ||
    (trustLevel && BAD_TRUST_LEVELS.has(trustLevel)) ||
    tokensRugged > 0 ||
    autoBlacklisted;
  return { riskTier, trustLevel, tokensRugged, autoBlacklisted, devHistoryRug: !!devHistoryRug };
}

interface ThisTokenRug {
  isRug: boolean;
  deathCause: string | null;
  autopsyNotes: string | null;
  marketCap: number | null;
}

async function getThisTokenRug(supabase: any, mint: string): Promise<ThisTokenRug> {
  const { data: tl } = await supabase
    .from('token_lifecycle')
    .select('death_cause, autopsy_notes, market_cap')
    .eq('token_mint', mint)
    .maybeSingle();
  const deathCause = tl?.death_cause || null;
  const isRug = !!(deathCause && THIS_TOKEN_RUG_CAUSES.has(deathCause));
  return {
    isRug,
    deathCause,
    autopsyNotes: tl?.autopsy_notes || null,
    marketCap: tl?.market_cap ?? null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[insiders-mesh-promoter] Starting promotion pass...');

    // Get all candidates: peak >= 3 AND not yet promoted
    const { data: candidates, error } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, token_symbol, peak_multiplier, peak_market_cap, first_called_at, creator_wallet, mesh_promotion_status')
      .gte('peak_multiplier', 3)
      .order('peak_multiplier', { ascending: false });

    if (error) throw error;

    console.log(`[insiders-mesh-promoter] ${candidates?.length || 0} tokens at >=3x`);

    let promoted = 0;
    let skippedRug = 0;
    let skippedAlready = 0;
    let creatorMissing = 0;
    const errors: string[] = [];

    for (const c of candidates || []) {
      try {
        // Resolve creator if not already cached
        let creator = c.creator_wallet as string | null;
        if (!creator) {
          creator = await resolveCreator(supabase, c.token_mint);
          if (creator) {
            await supabase
              .from('telegram_insider_token_lifecycle')
              .update({ creator_wallet: creator, creator_resolved_at: new Date().toISOString() })
              .eq('id', c.id);
          }
        }

        if (!creator) {
          creatorMissing++;
          continue;
        }

        // Check risk
        const risk = await getCreatorRisk(supabase, creator);
        if (risk.isRug) {
          await supabase
            .from('telegram_insider_token_lifecycle')
            .update({
              creator_risk_tier: risk.riskTier,
              mesh_promotion_status: 'rejected_rug',
              is_rugged: true,
              rug_evidence: {
                risk_tier: risk.riskTier,
                trust_level: risk.trustLevel,
                tokens_rugged: risk.tokensRugged,
                auto_blacklisted: risk.autoBlacklisted,
              },
              mesh_promotion_reason: `Rug pattern: tier=${risk.riskTier} trust=${risk.trustLevel} rugged=${risk.tokensRugged} blacklisted=${risk.autoBlacklisted}`,
            })
            .eq('id', c.id);
          skippedRug++;
          continue;
        }

        if (c.mesh_promotion_status === 'promoted') {
          skippedAlready++;
          continue;
        }

        // Upsert into reputation_mesh — link wallet → token, relationship=good_actor
        const reason = `Insiders channel ${c.peak_multiplier}x token (${c.token_symbol || c.token_mint.slice(0, 8)}) — no rug pattern`;

        const { error: meshErr } = await supabase
          .from('reputation_mesh')
          .insert({
            source_type: 'wallet',
            source_id: creator,
            linked_type: 'token',
            linked_id: c.token_mint,
            relationship: 'good_actor_creator',
            confidence: Math.min(100, Math.round(50 + c.peak_multiplier * 5)),
            evidence: {
              source: 'insiders_lifecycle_promoter',
              token_symbol: c.token_symbol,
              peak_multiplier: c.peak_multiplier,
              peak_market_cap: c.peak_market_cap,
              first_called_at: c.first_called_at,
            },
            discovered_via: 'insiders_lifecycle_promoter',
          });

        if (meshErr && !/duplicate key/i.test(meshErr.message || '')) {
          console.error('[insiders-mesh-promoter] mesh upsert error:', meshErr);
          errors.push(`${c.token_mint}: ${meshErr.message}`);
          continue;
        }

        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            creator_risk_tier: risk.riskTier,
            mesh_promotion_status: 'promoted',
            mesh_promoted_at: new Date().toISOString(),
            mesh_promotion_reason: reason,
          })
          .eq('id', c.id);

        promoted++;
      } catch (innerErr) {
        console.error('[insiders-mesh-promoter] error for', c.token_mint, innerErr);
        errors.push(`${c.token_mint}: ${(innerErr as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        candidates: candidates?.length || 0,
        promoted,
        skipped_rug: skippedRug,
        skipped_already_promoted: skippedAlready,
        skipped_no_creator: creatorMissing,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[insiders-mesh-promoter] FATAL:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});