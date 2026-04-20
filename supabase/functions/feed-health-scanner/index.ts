import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Hourly Feed Health Scanner
 * 
 * Picks feed tokens that are missing recent health snapshots and triggers
 * bagless-holders-report for each to fill the Litmus Strip bars.
 * 
 * Designed to run every hour via pg_cron.
 * Processes tokens in priority order:
 *   1. Top 200 tokens (freshness_tier = 1)
 *   2. Recently posted tokens (freshness_tier = 2-3)
 *   3. Older feed tokens (freshness_tier 4-5)
 * 
 * Budget: ~15 tokens per run × 24 runs/day = ~360 tokens/day
 * Helius cost: ~5-10 credits per token = ~1,800-3,600 credits/day (~55k-110k/month)
 */
Deno.serve(withRunLog('feed-health-scanner', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders }
  if (!await isFunctionEnabled('feed-health-scanner')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 15, 30);
    const maxAgeMins = body.maxAgeMins || 60; // Skip tokens scanned within this many minutes

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Get feed tokens ordered by priority (top 200 first, then recent posts)
    const { data: feedTokens, error: feedErr } = await supabase
      .from('live_feed_curated')
      .select('token_mint, symbol, freshness_tier, last_top_200_rank')
      .order('freshness_tier', { ascending: true })
      .order('last_top_200_rank', { ascending: true, nullsFirst: false })
      .limit(200);

    if (feedErr) throw feedErr;
    if (!feedTokens || feedTokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No feed tokens found', scanned: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Find which tokens already have a recent snapshot (within maxAgeMins)
    const since = new Date(Date.now() - maxAgeMins * 60 * 1000).toISOString();
    const mints = feedTokens.map(t => t.token_mint);

    const { data: recentSnapshots } = await supabase
      .from('token_health_snapshots')
      .select('token_mint')
      .in('token_mint', mints.slice(0, 100)) // Check first 100
      .gte('snapshot_hour', since);

    const recentSet = new Set((recentSnapshots || []).map(s => s.token_mint));

    // Also check second batch if needed
    if (mints.length > 100) {
      const { data: recentSnapshots2 } = await supabase
        .from('token_health_snapshots')
        .select('token_mint')
        .in('token_mint', mints.slice(100, 200))
        .gte('snapshot_hour', since);
      
      (recentSnapshots2 || []).forEach(s => recentSet.add(s.token_mint));
    }

    // Step 3: Filter to tokens that need scanning
    const needsScan = feedTokens.filter(t => !recentSet.has(t.token_mint));
    const batch = needsScan.slice(0, batchSize);

    console.log(`[feed-health-scanner] Feed: ${feedTokens.length} tokens, ${recentSet.size} already scanned recently, ${needsScan.length} need scanning, processing ${batch.length}`);

    let scanned = 0;
    let failed = 0;
    const results: { mint: string; symbol: string; status: string }[] = [];

    // Step 4: Call bagless-holders-report for each token
    for (const token of batch) {
      try {
        console.log(`[feed-health-scanner] Scanning ${token.symbol || token.token_mint.slice(0, 8)} (tier ${token.freshness_tier}, rank ${token.last_top_200_rank || 'n/a'})...`);

        const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
          body: { tokenMint: token.token_mint, source: 'feed_health_scanner' },
        });

        if (error) {
          console.warn(`[feed-health-scanner] Failed ${token.symbol}: ${error.message}`);
          results.push({ mint: token.token_mint, symbol: token.symbol || '?', status: `error: ${error.message}` });
          failed++;
        } else {
          scanned++;
          results.push({ mint: token.token_mint, symbol: token.symbol || '?', status: 'ok' });
        }

        // Small delay between calls to avoid hammering Helius
        if (batch.indexOf(token) < batch.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        console.error(`[feed-health-scanner] Error scanning ${token.symbol}: ${e.message}`);
        results.push({ mint: token.token_mint, symbol: token.symbol || '?', status: `exception: ${e.message}` });
        failed++;
      }
    }

    const summary = {
      feedTokens: feedTokens.length,
      alreadyRecent: recentSet.size,
      needsScan: needsScan.length,
      batchSize: batch.length,
      scanned,
      failed,
      results,
    };

    console.log(`[feed-health-scanner] Done: ${scanned} scanned, ${failed} failed`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[feed-health-scanner] Fatal: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
