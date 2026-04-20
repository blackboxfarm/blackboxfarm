import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('dev-behavior-scorer', async (req, logger) => {
  if (!await isFunctionEnabled('dev-behavior-scorer')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check feature flag
  const { data: flag } = await supabase
    .from('intelligence_feature_flags')
    .select('enabled')
    .eq('feature_name', 'behavioral_scoring')
    .single();

  if (!flag?.enabled) {
    logger?.info('Feature disabled via toggle');
    return new Response(JSON.stringify({ status: 'skipped', reason: 'feature_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 50;

    // Get wallets from wallet_family_members that haven't been scored recently
    const { data: wallets, error: wErr } = await supabase
      .from('wallet_family_members')
      .select('wallet_address, family_id, role, status')
      .in('role', ['seed', 'deployer', 'dev'])
      .limit(batchSize);

    if (wErr) throw wErr;
    if (!wallets?.length) {
      return new Response(JSON.stringify({ status: 'ok', scored: 0, message: 'No wallets to score' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger?.info(`Scoring ${wallets.length} dev wallets`);
    let scored = 0;

    for (const w of wallets) {
      // Get mint events for this wallet
      const { data: mintEvents } = await supabase
        .from('wallet_family_mint_events')
        .select('mint_address, event_type, created_at, confidence')
        .eq('detected_by_wallet', w.wallet_address)
        .order('created_at', { ascending: true });

      const mintCount = mintEvents?.length || 0;
      if (mintCount === 0) continue;

      // Get token lifecycle data for minted tokens
      const mintAddresses = mintEvents!.map(e => e.mint_address).filter(Boolean);
      const { data: lifecycles } = await supabase
        .from('token_lifecycle')
        .select('token_mint, first_seen_at, ath_market_cap, current_market_cap, status, creator_wallet')
        .in('token_mint', mintAddresses.slice(0, 50));

      // Calculate metrics
      let totalLifespanHours = 0;
      let lifespanCount = 0;
      let totalRetention = 0;
      let retentionCount = 0;
      let rugCount = 0;

      for (const lc of (lifecycles || [])) {
        // Lifespan: time from first_seen to now (or when it died)
        if (lc.first_seen_at) {
          const lifespanMs = Date.now() - new Date(lc.first_seen_at).getTime();
          totalLifespanHours += lifespanMs / (1000 * 60 * 60);
          lifespanCount++;
        }

        // Check for rug patterns: high ATH but near-zero current
        if (lc.ath_market_cap && lc.current_market_cap) {
          const ratio = lc.current_market_cap / lc.ath_market_cap;
          totalRetention += ratio;
          retentionCount++;
          if (ratio < 0.01 && lc.ath_market_cap > 10000) {
            rugCount++;
          }
        }

        if (lc.status === 'rugged' || lc.status === 'dead') {
          rugCount++;
        }
      }

      const avgLifespan = lifespanCount > 0 ? totalLifespanHours / lifespanCount : 0;
      const avgRetention = retentionCount > 0 ? (totalRetention / retentionCount) * 100 : 50;
      
      // Dump velocity: how fast tokens lose value (higher = worse)
      const dumpVelocity = mintCount > 0 ? (rugCount / mintCount) * 100 : 0;

      // Risk tier assignment
      let riskTier = 'unknown';
      if (mintCount >= 3 && dumpVelocity >= 70 && avgLifespan < 24) {
        riskTier = 'bad_actor';
      } else if (mintCount >= 2 && dumpVelocity >= 50) {
        riskTier = 'suspicious';
      } else if (dumpVelocity >= 30 || avgRetention < 10) {
        riskTier = 'caution';
      } else {
        riskTier = 'clean';
      }

      const evidence = {
        mint_count: mintCount,
        rug_count: rugCount,
        lifecycles_analyzed: lifecycles?.length || 0,
        avg_lifespan_hours: Math.round(avgLifespan * 10) / 10,
        avg_retention_pct: Math.round(avgRetention * 10) / 10,
        dump_velocity: Math.round(dumpVelocity * 10) / 10,
      };

      // Upsert score
      await supabase.from('dev_behavior_scores').upsert({
        wallet_address: w.wallet_address,
        mint_count: mintCount,
        avg_lifespan_hours: Math.round(avgLifespan * 10) / 10,
        supply_retention_pct: Math.round(avgRetention * 10) / 10,
        dump_velocity_score: Math.round(dumpVelocity * 10) / 10,
        risk_tier: riskTier,
        evidence,
        scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'wallet_address' });

      // Feed into reputation_mesh for bad actors
      if (riskTier === 'bad_actor' || riskTier === 'suspicious') {
        await supabase.from('reputation_mesh').upsert({
          source_id: w.wallet_address,
          source_type: 'wallet',
          linked_id: 'system',
          linked_type: 'behavior_score',
          relationship: `risk_${riskTier}`,
          confidence: riskTier === 'bad_actor' ? 90 : 65,
          discovered_via: 'dev-behavior-scorer',
          evidence,
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });

        logger?.info(`⚠️ ${w.wallet_address.slice(0, 8)} scored as ${riskTier}`, evidence);
      }

      scored++;
    }

    const summary = { status: 'ok', scored, total_wallets: wallets.length };
    logger?.info('Scoring complete', summary);
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger?.error('Fatal error', String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
