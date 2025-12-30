import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// RugCheck configuration thresholds
const RUGCHECK_CONFIG = {
  maxNormalisedScore: 50,
  criticalRisks: [
    'Freeze Authority still enabled',
    'Mint Authority still enabled',
    'Copycat token',
  ],
  warningRisks: [
    'Low amount of LP Providers',
    'High holder concentration',
    'Low Liquidity',
  ],
};

// Rate limiting: 1 request per second
const RATE_LIMIT_MS = 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const { limit = 50, includeProcessed = false, dryRun = false } = body;

    console.log(`[rugcheck-backfill] Starting backfill. Limit: ${limit}, includeProcessed: ${includeProcessed}, dryRun: ${dryRun}`);

    // Fetch positions that need RugCheck data
    let query = supabase
      .from('telegram_fantasy_positions')
      .select('id, token_mint, token_symbol, status, entry_price_usd, current_price_usd, realized_pnl_percent, rugcheck_normalised')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeProcessed) {
      query = query.is('rugcheck_normalised', null);
    }

    const { data: positions, error } = await query;

    if (error) {
      console.error('[rugcheck-backfill] Error fetching positions:', error);
      throw error;
    }

    console.log(`[rugcheck-backfill] Found ${positions?.length || 0} positions to process`);

    const results = {
      processed: 0,
      updated: 0,
      failed: 0,
      wouldHaveSkipped: 0,
      badCalls: [] as any[],
      goodCalls: [] as any[],
      errors: [] as string[]
    };

    for (const pos of positions || []) {
      try {
        console.log(`[rugcheck-backfill] Processing ${pos.token_symbol || pos.token_mint?.slice(0, 8)}...`);

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));

        // Call RugCheck API
        const response = await fetch(
          `https://api.rugcheck.xyz/v1/tokens/${pos.token_mint}/report/summary`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'BlindApeAlpha/1.0'
            }
          }
        );

        if (!response.ok) {
          console.warn(`[rugcheck-backfill] RugCheck API returned ${response.status} for ${pos.token_mint}`);
          results.failed++;
          results.errors.push(`${pos.token_symbol}: API ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        const normalisedScore = data.score_normalised || 0;
        const rugged = data.rugged || false;
        const risks = data.risks || [];

        // Determine if this would have been skipped
        let wouldSkip = false;
        let skipReason = null;

        if (rugged) {
          wouldSkip = true;
          skipReason = 'Token was already rugged';
        } else if (normalisedScore > RUGCHECK_CONFIG.maxNormalisedScore) {
          wouldSkip = true;
          skipReason = `Score too high: ${normalisedScore}/100`;
        } else {
          for (const risk of risks) {
            const riskName = risk.name || risk.description || '';
            for (const critical of RUGCHECK_CONFIG.criticalRisks) {
              if (riskName.toLowerCase().includes(critical.toLowerCase())) {
                wouldSkip = true;
                skipReason = `Critical risk: ${riskName}`;
                break;
              }
            }
            if (wouldSkip) break;
          }
        }

        const outcome = {
          token: pos.token_symbol || pos.token_mint?.slice(0, 8),
          tokenMint: pos.token_mint,
          status: pos.status,
          rugcheckScore: normalisedScore,
          rugged,
          risks: risks.slice(0, 3).map((r: any) => r.name || r.description),
          wouldHaveSkipped: wouldSkip,
          skipReason,
          realizedPnlPercent: pos.realized_pnl_percent,
          currentVsEntry: pos.current_price_usd && pos.entry_price_usd 
            ? ((pos.current_price_usd / pos.entry_price_usd - 1) * 100).toFixed(1) + '%'
            : null
        };

        if (wouldSkip) {
          results.wouldHaveSkipped++;
          results.badCalls.push(outcome);
        } else {
          results.goodCalls.push(outcome);
        }

        // Update the position with RugCheck data (unless dry run)
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('telegram_fantasy_positions')
            .update({
              rugcheck_score: data.score || null,
              rugcheck_normalised: normalisedScore,
              rugcheck_risks: risks,
              rugcheck_passed: !wouldSkip,
              rugcheck_checked_at: new Date().toISOString(),
              skip_reason: wouldSkip ? skipReason : null
            })
            .eq('id', pos.id);

          if (updateError) {
            console.error(`[rugcheck-backfill] Update failed for ${pos.token_mint}:`, updateError);
            results.errors.push(`${pos.token_symbol}: Update failed`);
          } else {
            results.updated++;
          }
        }

        results.processed++;

      } catch (posError: any) {
        console.error(`[rugcheck-backfill] Error processing ${pos.token_mint}:`, posError);
        results.failed++;
        results.errors.push(`${pos.token_symbol}: ${posError.message}`);
      }
    }

    // Sort bad calls by realized P&L to see which ones hurt the most
    results.badCalls.sort((a, b) => (a.realizedPnlPercent || 0) - (b.realizedPnlPercent || 0));

    console.log(`[rugcheck-backfill] Complete. Processed: ${results.processed}, Updated: ${results.updated}, Would've skipped: ${results.wouldHaveSkipped}`);

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      summary: {
        totalProcessed: results.processed,
        updated: results.updated,
        failed: results.failed,
        wouldHaveSkipped: results.wouldHaveSkipped,
        passedRugcheck: results.goodCalls.length
      },
      badCalls: results.badCalls,
      goodCalls: results.goodCalls.slice(0, 10), // Just show first 10 good ones
      errors: results.errors.slice(0, 10) // Just show first 10 errors
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[rugcheck-backfill] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
