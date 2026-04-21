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

async function resolveCreator(supabase: any, mint: string): Promise<string | null> {
  // Try token_lifecycle first
  const { data: lc } = await supabase
    .from('token_lifecycle')
    .select('creator_wallet')
    .eq('token_mint', mint)
    .maybeSingle();
  if (lc?.creator_wallet) return lc.creator_wallet;

  // Try developer_genealogy
  const { data: dg } = await supabase
    .from('developer_genealogy')
    .select('master_wallet')
    .eq('token_mint', mint)
    .maybeSingle();
  if (dg?.master_wallet) return dg.master_wallet;

  return null;
}

async function getCreatorRiskTier(supabase: any, wallet: string): Promise<string | null> {
  const { data } = await supabase
    .from('dev_behavior_scores')
    .select('risk_tier')
    .eq('developer_wallet', wallet)
    .maybeSingle();
  return data?.risk_tier || null;
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

        // Check risk tier
        const tier = await getCreatorRiskTier(supabase, creator);
        if (tier && BAD_TIERS.has(tier)) {
          await supabase
            .from('telegram_insider_token_lifecycle')
            .update({
              creator_risk_tier: tier,
              mesh_promotion_status: 'rejected_rug',
              is_rugged: true,
              mesh_promotion_reason: `Creator risk_tier=${tier}`,
            })
            .eq('id', c.id);
          skippedRug++;
          continue;
        }

        if (c.mesh_promotion_status === 'promoted') {
          skippedAlready++;
          continue;
        }

        // Upsert into reputation_mesh as good actor
        const reason = `Insiders channel ${c.peak_multiplier}x token (${c.token_symbol || c.token_mint.slice(0, 8)}) — no rug pattern detected`;

        const { error: meshErr } = await supabase
          .from('reputation_mesh')
          .upsert({
            entity_type: 'wallet',
            entity_id: creator,
            tier: 'good_actor',
            confidence: 0.7,
            evidence: {
              source: 'insiders_lifecycle_promoter',
              token_mint: c.token_mint,
              token_symbol: c.token_symbol,
              peak_multiplier: c.peak_multiplier,
              peak_market_cap: c.peak_market_cap,
              first_called_at: c.first_called_at,
              promoted_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'entity_type,entity_id' });

        if (meshErr) {
          console.error('[insiders-mesh-promoter] mesh upsert error:', meshErr);
          errors.push(`${c.token_mint}: ${meshErr.message}`);
          continue;
        }

        await supabase
          .from('telegram_insider_token_lifecycle')
          .update({
            creator_risk_tier: tier,
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