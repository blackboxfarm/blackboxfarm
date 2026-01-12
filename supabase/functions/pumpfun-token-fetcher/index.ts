import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN TOKEN FETCHER
 * 
 * Purpose: Fast triage of NEW tokens only
 * Schedule: Every 30-60 seconds via cron
 * 
 * Logic:
 * 1. Fetch latest 200 tokens from Solana Tracker API
 * 2. For each token NOT already in database:
 *    - Check Mayhem Mode (one-time) - instant reject if true, NEVER store
 *    - Check Bundle Score (one-time) - instant reject if > 70, NEVER store
 *    - If passes both: Insert into pumpfun_watchlist with status 'watching'
 * 3. For tokens already in database: Skip entirely (other functions handle them)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

interface TokenData {
  token: {
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    image?: string;
  };
  pools?: Array<{
    liquidity?: { usd?: number };
    price?: { usd?: number };
    volume?: { h24?: number };
    txns?: { h24?: number };
  }>;
  events?: { createdAt?: number };
  creator?: string;
  holders?: number;
  buys?: number;
  sells?: number;
}

interface FetcherStats {
  tokensFromApi: number;
  alreadyKnown: number;
  mayhemRejected: number;
  bundleRejected: number;
  addedToWatchlist: number;
  errors: number;
  durationMs: number;
}

/**
 * Fetch latest tokens from pump.fun API directly
 * 
 * API Truth Table: For new token detection, use pump.fun (source of truth before Raydium)
 * NOT Solana Tracker (downstream, delayed)
 */
async function fetchLatestPumpfunTokens(limit = 200): Promise<TokenData[]> {
  try {
    // PRIMARY: Use pump.fun API directly (source of truth)
    console.log('Fetching latest tokens from pump.fun API...');
    const pumpResponse = await fetch(
      `https://frontend-api.pump.fun/coins?sort=created_timestamp&order=DESC&limit=${limit}`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (pumpResponse.ok) {
      const pumpData = await pumpResponse.json();
      if (Array.isArray(pumpData)) {
        console.log(`Got ${pumpData.length} tokens from pump.fun API`);
        
        // Transform pump.fun format to our TokenData format
        return pumpData.map((coin: any) => ({
          token: {
            mint: coin.mint,
            name: coin.name || 'Unknown',
            symbol: coin.symbol || 'UNK',
            decimals: 6, // pump.fun tokens use 6 decimals
            image: coin.image_uri || coin.metadata?.image,
          },
          pools: coin.usd_market_cap ? [{
            liquidity: { usd: coin.usd_market_cap * 0.1 }, // Estimate
            price: { usd: coin.usd_market_cap / (coin.total_supply / 1e6) },
          }] : [],
          events: { createdAt: coin.created_timestamp },
          creator: coin.creator,
          // Include bonding curve data for state tracking
          bondingCurve: {
            virtualSolReserves: coin.virtual_sol_reserves,
            virtualTokenReserves: coin.virtual_token_reserves,
            realTokenReserves: coin.real_token_reserves,
            complete: coin.complete === true,
          }
        }));
      }
    } else {
      console.log(`pump.fun API returned ${pumpResponse.status}, falling back to Solana Tracker`);
    }
  } catch (error) {
    console.error('pump.fun API failed:', error);
  }

  // FALLBACK: Solana Tracker (if pump.fun is blocked/down)
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  try {
    console.log('Falling back to Solana Tracker API...');
    const response = await fetch(
      `https://data.solanatracker.io/tokens/latest?market=pumpfun&limit=${limit}`,
      {
        headers: {
          'x-api-key': apiKey || '',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`Solana Tracker API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching tokens from Solana Tracker:', error);
    return [];
  }
}

// Get current SOL price
async function getSolPrice(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('sol_price_cache')
      .select('price_usd')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    return data?.price_usd || 200;
  } catch {
    return 200;
  }
}

// Check for Mayhem Mode (hard reject) - ONE TIME ONLY
async function checkMayhemMode(tokenMint: string): Promise<boolean> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
    if (!response.ok) return false;
    
    const data = await response.json();
    const totalSupply = data.total_supply || 0;
    const program = data.program || null;
    
    const MAYHEM_PROGRAM_ID = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e';
    const MAYHEM_SUPPLY = 2000000000000000;
    
    return program === MAYHEM_PROGRAM_ID || totalSupply >= MAYHEM_SUPPLY;
  } catch {
    return false;
  }
}

// Bundle analysis - ONE TIME ONLY
async function analyzeTokenRisk(mint: string): Promise<{ bundleScore: number; details: any }> {
  try {
    const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
    
    const response = await fetch(
      `https://data.solanatracker.io/tokens/${mint}/holders`,
      {
        headers: {
          'x-api-key': apiKey || '',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return { bundleScore: 40, details: { error: `HTTP ${response.status}` } };
    }

    const holders = await response.json();
    
    if (!Array.isArray(holders) || holders.length === 0) {
      return { bundleScore: 30, details: { holderCount: 0 } };
    }

    const top10Holdings = holders.slice(0, 10).reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);
    const top5Holdings = holders.slice(0, 5).reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);

    let bundleScore = 0;
    if (top10Holdings > 80) bundleScore += 40;
    else if (top10Holdings > 60) bundleScore += 25;
    if (top5Holdings > 60) bundleScore += 30;
    else if (top5Holdings > 40) bundleScore += 15;

    return {
      bundleScore: Math.min(100, bundleScore),
      details: { holderCount: holders.length, top5Holdings, top10Holdings },
    };
  } catch (error) {
    return { bundleScore: 50, details: { error: String(error) } };
  }
}

// Get monitor config
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  return {
    max_bundle_score: data?.max_bundle_score ?? 70,
    is_enabled: data?.is_enabled ?? true,
  };
}

// Main fetcher logic
async function fetchAndTriageNewTokens(supabase: any): Promise<FetcherStats> {
  const startTime = Date.now();
  const stats: FetcherStats = {
    tokensFromApi: 0,
    alreadyKnown: 0,
    mayhemRejected: 0,
    bundleRejected: 0,
    addedToWatchlist: 0,
    errors: 0,
    durationMs: 0,
  };

  console.log('🔍 FETCHER: Starting new token discovery...');

  const config = await getConfig(supabase);
  if (!config.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping fetch');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Fetch latest 200 tokens
  const tokens = await fetchLatestPumpfunTokens(200);
  stats.tokensFromApi = tokens.length;
  console.log(`📡 Fetched ${tokens.length} tokens from API`);

  if (tokens.length === 0) {
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Get all mints from API response
  const apiMints = tokens.map(t => t.token?.mint).filter(Boolean) as string[];

  // Check which ones we already know about
  const { data: existingTokens } = await supabase
    .from('pumpfun_watchlist')
    .select('token_mint')
    .in('token_mint', apiMints);

  const existingMints = new Set((existingTokens || []).map((t: any) => t.token_mint));
  stats.alreadyKnown = existingMints.size;

  const solPrice = await getSolPrice(supabase);
  const now = new Date();

  // Process only NEW tokens
  for (const tokenData of tokens) {
    const mint = tokenData.token?.mint;
    if (!mint || existingMints.has(mint)) continue;

    try {
      // 1. Mayhem Mode check (one-time, hard reject)
      const isMayhem = await checkMayhemMode(mint);
      if (isMayhem) {
        console.log(`☠️ MAYHEM REJECTED: ${tokenData.token?.symbol}`);
        stats.mayhemRejected++;
        continue; // Never store, never see again
      }

      // Small delay for rate limiting
      await new Promise(r => setTimeout(r, 50));

      // 2. Bundle score check (one-time)
      const risk = await analyzeTokenRisk(mint);
      if (risk.bundleScore > config.max_bundle_score) {
        console.log(`🔴 BUNDLE REJECTED: ${tokenData.token?.symbol} (score: ${risk.bundleScore})`);
        stats.bundleRejected++;
        continue; // Never store, never see again
      }

      // 3. Token passed both checks - add to watchlist
      const pool = tokenData.pools?.[0];
      const volumeUsd = pool?.volume?.h24 || 0;
      const volumeSol = solPrice > 0 ? volumeUsd / solPrice : 0;
      const txCount = (tokenData.buys || 0) + (tokenData.sells || 0);
      const holderCount = tokenData.holders || 0;
      const priceUsd = pool?.price?.usd;
      const liquidityUsd = pool?.liquidity?.usd;
      const marketCapUsd = priceUsd ? priceUsd * 1_000_000_000 : null;

      // Generate metrics hash for staleness detection
      const metricsHash = `${holderCount}-${volumeSol.toFixed(4)}-${priceUsd?.toFixed(8) || '0'}`;

      const { error } = await supabase.from('pumpfun_watchlist').insert({
        token_mint: mint,
        token_symbol: tokenData.token?.symbol,
        token_name: tokenData.token?.name,
        first_seen_at: now.toISOString(),
        last_checked_at: now.toISOString(),
        status: 'watching',
        check_count: 1,
        holder_count: holderCount,
        holder_count_prev: 0,
        volume_sol: volumeSol,
        volume_sol_prev: 0,
        price_usd: priceUsd,
        price_ath_usd: priceUsd,
        holder_count_peak: holderCount,
        tx_count: txCount,
        market_cap_usd: marketCapUsd,
        liquidity_usd: liquidityUsd,
        bundle_score: risk.bundleScore,
        creator_wallet: tokenData.creator,
        metadata: { image: tokenData.token?.image, bundle_details: risk.details },
        // New flags - CHECKED ONCE, NEVER AGAIN
        mayhem_checked: true,
        bundle_checked: true,
        consecutive_stale_checks: 0,
        metrics_hash: metricsHash,
        last_processor: 'token-fetcher',
      });

      if (!error) {
        stats.addedToWatchlist++;
        console.log(`✅ ADDED: ${tokenData.token?.symbol} (${holderCount} holders, ${volumeSol.toFixed(2)} SOL, bundle: ${risk.bundleScore})`);
      } else {
        console.error(`Error adding ${tokenData.token?.symbol}:`, error);
        stats.errors++;
      }

    } catch (error) {
      console.error(`Error processing ${tokenData.token?.symbol}:`, error);
      stats.errors++;
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 FETCHER COMPLETE: ${stats.addedToWatchlist} added, ${stats.mayhemRejected} mayhem, ${stats.bundleRejected} bundle rejected, ${stats.alreadyKnown} already known (${stats.durationMs}ms)`);

  return stats;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'fetch';

    console.log(`🎯 pumpfun-token-fetcher action: ${action}`);

    switch (action) {
      case 'fetch': {
        const stats = await fetchAndTriageNewTokens(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        // Quick health check
        const { count: watchingCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'watching');

        return jsonResponse({
          success: true,
          status: 'healthy',
          watchingCount: watchingCount || 0,
        });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-token-fetcher:', error);
    return errorResponse(String(error), 500);
  }
});
