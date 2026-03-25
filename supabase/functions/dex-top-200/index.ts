import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { scrapeDexTopPages } from "../_shared/dex-top-pages.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResolvedPair {
  tokenMint: string | null;
  symbol: string | null;
  name: string | null;
  priceUsd: string | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  fdv: number | null;
  marketCap: number | null;
  url: string | null;
}

async function batchResolvePairs(pairIds: string[]): Promise<Map<string, ResolvedPair>> {
  const resolved = new Map<string, any>();
  const batchSize = 30;

  for (let i = 0; i < pairIds.length; i += batchSize) {
    const batch = pairIds.slice(i, i + batchSize);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${batch.join(',')}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        }
      });
      if (res.ok) {
        const data = await res.json();
        const pairs = data.pairs || (data.pair ? [data.pair] : []);
        for (const p of pairs) {
          if (p.baseToken?.address) {
            resolved.set(p.pairAddress?.toLowerCase(), {
              tokenMint: p.baseToken.address || null,
              symbol: p.baseToken.symbol || null,
              name: p.baseToken.name || null,
              priceUsd: p.priceUsd || null,
              liquidityUsd: p.liquidity?.usd ?? null,
              volume24h: p.volume?.h24 ?? null,
              fdv: p.fdv ?? null,
              marketCap: p.marketCap || p.fdv || null,
              url: p.url || null,
            });
          }
        }
        console.log(`[DexTop200] Batch ${Math.floor(i/batchSize)+1}: ${pairs.length}/${batch.length}`);
      } else {
        console.error(`[DexTop200] Batch failed (${res.status}) for ${batch.length} ids`);
      }
    } catch (e) {
      console.error(`[DexTop200] Batch error:`, e);
    }
    if (i + batchSize < pairIds.length) await new Promise(r => setTimeout(r, 250));
  }
  return resolved;
}

// Classify error type for targeted alerts
function classifyError(error: string): { type: string; severity: string; emoji: string; action: string } {
  if (error.includes('FIRECRAWL_CREDITS_EXHAUSTED')) {
    return { type: 'credits_exhausted', severity: 'CRITICAL', emoji: '💳', action: 'Top up Firecrawl credits immediately — scraping is halted.' };
  }
  if (error.includes('FIRECRAWL_RATE_LIMITED')) {
    return { type: 'rate_limited', severity: 'WARNING', emoji: '⏱️', action: 'Rate limited by Firecrawl. Will auto-recover on next tick. If persistent, reduce frequency.' };
  }
  if (error.includes('FIRECRAWL_BLOCKED')) {
    return { type: 'blocked', severity: 'CRITICAL', emoji: '🚫', action: 'Possible IP/fingerprint block. Check Firecrawl dashboard and consider rotating approach.' };
  }
  if (error.includes('FIRECRAWL_SELF_THROTTLED')) {
    return { type: 'self_throttled', severity: 'WARNING', emoji: '⚠️', action: 'Internal rate limiter activated to protect credits. Will auto-resume after cooldown.' };
  }
  return { type: 'unknown', severity: 'ERROR', emoji: '❌', action: 'Investigate logs for root cause.' };
}

// Log scrape health to DB and fire admin alert on failure
async function logScrapeHealth(
  supabase: any,
  health: any,
  elapsed: number,
  resolvedCount: number,
  totalCount: number,
  error?: string
) {
  const isHealthy = health.page1_ok && health.page2_ok && health.total_parsed >= 150;
  const isPartial = (health.page1_ok || health.page2_ok) && health.total_parsed > 0 && health.total_parsed < 150;
  const isFailed = !health.page1_ok && !health.page2_ok;

  const status = isFailed ? 'failed' : isPartial ? 'partial' : 'healthy';

  // Log to edge_function_runs
  try {
    await supabase.from('edge_function_runs').insert({
      function_name: 'dex-top-200',
      status: isFailed ? 'error' : 'success',
      duration_ms: elapsed,
      metadata: {
        scrape_status: status,
        page1_ok: health.page1_ok,
        page2_ok: health.page2_ok,
        page1_count: health.page1_count,
        page2_count: health.page2_count,
        page1_error: health.page1_error,
        page2_error: health.page2_error,
        total_parsed: health.total_parsed,
        resolved: resolvedCount,
        retry_used: health.retry_used,
        error: error || null,
      },
    });
  } catch (e) {
    console.error('[DexTop200] Failed to log run:', e);
  }

  // Detect specific Firecrawl error types from page errors
  const allErrors = [health.page1_error, health.page2_error, error].filter(Boolean);
  const firecrawlIssue = allErrors.map(e => classifyError(e!)).find(c => c.type !== 'unknown');

  // Fire admin alert on failure or partial
  if (isFailed || isPartial) {
    const classification = firecrawlIssue || { type: 'scrape_failure', severity: isFailed ? 'CRITICAL' : 'WARNING', emoji: isFailed ? '🔴' : '🟡', action: 'Check DexScreener page structure for changes.' };

    const details = [
      `Page 1: ${health.page1_ok ? `✅ ${health.page1_count} tokens` : `❌ ${health.page1_error}`}`,
      `Page 2: ${health.page2_ok ? `✅ ${health.page2_count} tokens` : `❌ ${health.page2_error}`}`,
      `Total parsed: ${health.total_parsed}`,
      health.retry_used ? '⚠️ Retry was used (possible intermittent block)' : '',
      `\n🔧 Action: ${classification.action}`,
      error ? `Error: ${error}` : '',
    ].filter(Boolean).join('\n');

    try {
      await supabase.from('admin_notifications').insert({
        notification_type: firecrawlIssue ? `firecrawl_${firecrawlIssue.type}` : 'scrape_health',
        title: `${classification.emoji} ${classification.severity}: DexScreener Scrape ${isFailed ? 'FAILED' : 'Partial'} — ${classification.type}`,
        message: details,
        metadata: {
          scrape_status: status,
          error_type: classification.type,
          health,
          elapsed_ms: elapsed,
        },
      });
      console.log(`[DexTop200] Admin alert fired: ${classification.type} (${status})`);
    } catch (e) {
      console.error('[DexTop200] Failed to create admin alert:', e);
    }

    // Check consecutive failures
    try {
      const { data: recentRuns } = await supabase
        .from('edge_function_runs')
        .select('status, metadata')
        .eq('function_name', 'dex-top-200')
        .order('created_at', { ascending: false })
        .limit(5);

      const consecutiveFailures = recentRuns?.filter(
        (r: any) => r.status === 'error' || r.metadata?.scrape_status === 'failed'
      ).length || 0;

      if (consecutiveFailures >= 3) {
        await supabase.from('admin_notifications').insert({
          notification_type: 'scrape_escalation',
          title: `🚨 ESCALATION: DexScreener scrape failing ${consecutiveFailures}x in a row`,
          message: `${consecutiveFailures} consecutive failures detected.\n\nError types:\n${recentRuns?.slice(0, 3).map((r: any) => r.metadata?.error_type || r.metadata?.page1_error || 'unknown').join('\n')}\n\nManual investigation required.`,
          metadata: { consecutive_failures: consecutiveFailures },
        });
        console.error(`[DexTop200] 🚨 ESCALATION: ${consecutiveFailures} consecutive failures`);
      }
    } catch (e) {
      console.error('[DexTop200] Failed to check consecutive failures:', e);
    }
  }
}

// Auto-queue "New" tokens into holders_intel_post_queue (capped at 20 per tick)
async function autoQueueNewTokens(supabase: any, finalTokens: any[]): Promise<number> {
  const MAX_QUEUE_PER_TICK = 20;

  // Only tokens with resolved mints
  const withMints = finalTokens.filter(t => t.tokenMint);
  if (withMints.length === 0) return 0;

  const mints = withMints.map(t => t.tokenMint);

  try {
    // Check what's already in queue or seen
    const [queueRes, seenRes] = await Promise.all([
      supabase.from('holders_intel_post_queue').select('token_mint').in('token_mint', mints),
      supabase.from('holders_intel_seen_tokens').select('token_mint').in('token_mint', mints),
    ]);

    const alreadyQueued = new Set((queueRes.data || []).map((r: any) => r.token_mint));
    const alreadySeen = new Set((seenRes.data || []).map((r: any) => r.token_mint));

    // Filter to truly new tokens, sorted by rank (lowest rank = highest priority)
    const newTokens = withMints
      .filter(t => !alreadyQueued.has(t.tokenMint) && !alreadySeen.has(t.tokenMint))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_QUEUE_PER_TICK);

    if (newTokens.length === 0) {
      console.log('[DexTop200] No new tokens to queue');
      return 0;
    }

    const rows = newTokens.map(t => ({
      token_mint: t.tokenMint,
      symbol: t.symbol || null,
      name: t.name || null,
      market_cap: t.marketCap || t.fdv || null,
      trigger_source: 'dex_top_200',
      trigger_comment: `🔥 DexScreener Trending #${t.rank}`,
      scheduled_at: new Date().toISOString(),
      status: 'pending',
    }));

    const { error } = await supabase.from('holders_intel_post_queue').insert(rows);
    if (error) {
      console.error('[DexTop200] Queue insert error:', error.message);
      return 0;
    }

    console.log(`[DexTop200] ✅ Auto-queued ${newTokens.length} new tokens for posting`);
    return newTokens.length;
  } catch (e) {
    console.error('[DexTop200] Auto-queue error:', e);
    return 0;
  }
}

Deno.serve(withRunLog('dex-top-200', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const startTime = Date.now();
    const { pairs: rankedPairs, health } = await scrapeDexTopPages();

    // If total failure, log and return error
    if (rankedPairs.length === 0) {
      const elapsed = Date.now() - startTime;
      await logScrapeHealth(supabase, health, elapsed, 0, 0, 'Zero tokens parsed from both pages');
      return new Response(JSON.stringify({
        success: false,
        error: 'Scrape returned 0 tokens — possible block or page change',
        health,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resolved = await batchResolvePairs([...new Set(rankedPairs.map((pair) => pair.pairId))]);

    const finalTokens = rankedPairs.map((entry) => {
      const detail = resolved.get(entry.pairId.toLowerCase());
      return {
        rank: entry.rank,
        pairId: entry.pairId,
        tokenMint: detail?.tokenMint || null,
        symbol: detail?.symbol || entry.fallbackSymbol || null,
        name: detail?.name || entry.fallbackName || null,
        priceUsd: detail?.priceUsd || null,
        liquidityUsd: detail?.liquidityUsd || null,
        volume24h: detail?.volume24h || null,
        fdv: detail?.fdv || null,
        marketCap: detail?.marketCap || null,
        url: detail?.url || entry.url,
      };
    });

    const elapsed = Date.now() - startTime;
    const resolvedCount = finalTokens.filter((token) => !!token.tokenMint).length;

    // Log health (async, don't block response)
    logScrapeHealth(supabase, health, elapsed, resolvedCount, finalTokens.length).catch(() => {});

    // Auto-queue new tokens into the posting pipeline
    const queuedCount = await autoQueueNewTokens(supabase, finalTokens);

    console.log(`[DexTop200] ✅ Done in ${elapsed}ms: ${finalTokens.length} ranked, ${resolvedCount} resolved, ${queuedCount} queued`);

    return new Response(JSON.stringify({
      success: true,
      source: 'dexscreener-pages',
      timestamp: Math.floor(Date.now() / 1000),
      elapsed_ms: elapsed,
      total: finalTokens.length,
      resolved: resolvedCount,
      auto_queued: queuedCount,
      health,
      tokens: finalTokens,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const elapsed = Date.now() - Date.now();
    console.error('[DexTop200] Error:', error);

    // Log the catastrophic failure
    await logScrapeHealth(supabase, {
      page1_ok: false, page2_ok: false,
      page1_count: 0, page2_count: 0,
      page1_error: error instanceof Error ? error.message : String(error),
      page2_error: null,
      total_parsed: 0, retry_used: false,
    }, 0, 0, 0, error instanceof Error ? error.message : String(error));

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

