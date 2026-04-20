import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DeathCause = 'rug_pull' | 'slow_drain' | 'abandoned' | 'liquidity_pulled' | 'organic_death' | 'unknown';

interface AutopsyResult {
  token_mint: string;
  death_cause: DeathCause;
  death_confidence: number;
  autopsy_notes: string;
}

function diagnose(token: any, devScore: any, holders: any[]): AutopsyResult {
  const mint = token.token_mint;
  let cause: DeathCause = 'unknown';
  let confidence = 30;
  const notes: string[] = [];

  const mcap = token.market_cap || 0;
  const liquidity = token.liquidity_usd || 0;
  const ageHours = token.created_at
    ? (Date.now() - new Date(token.created_at).getTime()) / 3600000
    : 0;

  // ── Check dev behavior scores ──
  if (devScore) {
    const dumpVelocity = devScore.dump_velocity_score || 0;
    const lpPullScore = devScore.lp_pull_score || 0;
    const riskTier = devScore.risk_tier || '';

    // Rug pull: dev dumped fast + high dump velocity
    if (dumpVelocity > 80 && ageHours < 48) {
      cause = 'rug_pull';
      confidence = Math.min(95, 60 + dumpVelocity * 0.3);
      notes.push(`Dump velocity: ${dumpVelocity}/100`);
      notes.push(`Token died within ${ageHours.toFixed(0)}hrs`);
    }
    // Slow drain: gradual sell-off
    else if (dumpVelocity > 40 && dumpVelocity <= 80 && ageHours > 48) {
      cause = 'slow_drain';
      confidence = Math.min(85, 50 + dumpVelocity * 0.4);
      notes.push(`Gradual dump over ${ageHours.toFixed(0)}hrs`);
      notes.push(`Dump velocity: ${dumpVelocity}/100`);
    }
    // LP pulled
    else if (lpPullScore > 70) {
      cause = 'liquidity_pulled';
      confidence = Math.min(90, 55 + lpPullScore * 0.4);
      notes.push(`LP pull score: ${lpPullScore}/100`);
    }
    // Bad actor label
    else if (riskTier === 'bad_actor') {
      cause = cause === 'unknown' ? 'rug_pull' : cause;
      confidence = Math.max(confidence, 70);
      notes.push(`Dev risk tier: ${riskTier}`);
    }
  }

  // ── Check for abandoned (no dev activity) ──
  if (cause === 'unknown' && ageHours > 168) { // >1 week old
    // If no dev behavior data at all, likely abandoned
    if (!devScore) {
      cause = 'abandoned';
      confidence = 50;
      notes.push('No dev activity data found');
      notes.push(`Token age: ${(ageHours / 24).toFixed(0)} days`);
    }
  }

  // ── Organic death: low mcap but no malice signals ──
  if (cause === 'unknown' && mcap < 1000 && liquidity < 500) {
    cause = 'organic_death';
    confidence = 40;
    notes.push(`Mcap: $${mcap.toFixed(0)}, Liquidity: $${liquidity.toFixed(0)}`);
    notes.push('No malicious dev patterns detected');
  }

  // Add context
  if (mcap > 0) notes.push(`Final mcap: $${mcap.toFixed(0)}`);
  if (liquidity > 0) notes.push(`Final liquidity: $${liquidity.toFixed(0)}`);

  return {
    token_mint: mint,
    death_cause: cause,
    death_confidence: confidence,
    autopsy_notes: notes.join(' | '),
  };
}

Deno.serve(withRunLog('token-autopsy', async (req) => {
  if (!await isFunctionEnabled('token-autopsy')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 20, 50);

    // Find dead/dying tokens not yet autopsied
    const { data: tokens, error: queryErr } = await supabase
      .from('token_lifecycle')
      .select('token_mint, market_cap, liquidity_usd, current_status, created_at')
      .is('autopsy_at', null)
      .or('market_cap.lt.1000,liquidity_usd.lt.500')
      .not('token_mint', 'is', null)
      .limit(batchSize);

    if (queryErr) throw queryErr;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens to autopsy', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[token-autopsy] Processing ${tokens.length} tokens`);

    const results: AutopsyResult[] = [];

    for (const token of tokens) {
      try {
        // Get creator wallet for this token
        const { data: watchEntry } = await supabase
          .from('pumpfun_watchlist')
          .select('creator_wallet')
          .eq('token_mint', token.token_mint)
          .maybeSingle();

        let devScore = null;
        if (watchEntry?.creator_wallet) {
          const { data: score } = await supabase
            .from('dev_behavior_scores')
            .select('*')
            .eq('wallet_address', watchEntry.creator_wallet)
            .maybeSingle();
          devScore = score;
        }

        // Get holder movements (simplified — just count)
        const { data: holders } = await supabase
          .from('holder_movements')
          .select('wallet_address, movement_type')
          .eq('token_mint', token.token_mint)
          .limit(50);

        const result = diagnose(token, devScore, holders || []);
        results.push(result);

        // Write back to token_lifecycle
        await supabase
          .from('token_lifecycle')
          .update({
            death_cause: result.death_cause,
            death_confidence: result.death_confidence,
            autopsy_at: new Date().toISOString(),
            autopsy_notes: result.autopsy_notes,
          })
          .eq('token_mint', token.token_mint);

      } catch (err) {
        console.error(`[token-autopsy] Error processing ${token.token_mint}:`, err);
      }
    }

    const summary = {
      processed: results.length,
      rug_pulls: results.filter(r => r.death_cause === 'rug_pull').length,
      slow_drains: results.filter(r => r.death_cause === 'slow_drain').length,
      abandoned: results.filter(r => r.death_cause === 'abandoned').length,
      liquidity_pulled: results.filter(r => r.death_cause === 'liquidity_pulled').length,
      organic: results.filter(r => r.death_cause === 'organic_death').length,
      unknown: results.filter(r => r.death_cause === 'unknown').length,
    };

    console.log(`[token-autopsy] Complete:`, summary);

    return new Response(JSON.stringify({ success: true, ...summary, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[token-autopsy] Fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
