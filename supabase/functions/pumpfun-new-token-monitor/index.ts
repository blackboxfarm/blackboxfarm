import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to create JSON responses
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

interface WatchlistToken {
  id?: string;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  first_seen_at?: string;
  last_checked_at?: string;
  status: 'watching' | 'qualified' | 'dead' | 'bombed' | 'removed';
  check_count: number;
  holder_count: number;
  holder_count_prev: number;
  volume_sol: number;
  volume_sol_prev: number;
  price_usd?: number;
  price_usd_prev?: number;
  price_ath_usd?: number;
  holder_count_peak: number;
  tx_count: number;
  market_cap_usd?: number;
  liquidity_usd?: number;
  bundle_score?: number;
  social_score?: number;
  creator_wallet?: string;
  qualification_reason?: string;
  removal_reason?: string;
  qualified_at?: string;
  removed_at?: string;
  metadata?: any;
}

interface MonitorConfig {
  min_volume_sol_5m: number;
  min_transactions: number;
  max_token_age_minutes: number;
  max_bundle_score: number;
  auto_scalp_enabled: boolean;
  scalp_test_mode: boolean;
  is_enabled: boolean;
  // Watchlist config
  min_watch_time_minutes?: number; // How long before qualifying (default: 2)
  max_watch_time_minutes?: number; // Give up after this (default: 60)
  dead_holder_threshold?: number; // Remove if holders below (default: 3)
  dead_volume_threshold_sol?: number; // Remove if volume below (default: 0.01)
  qualification_holder_count?: number; // Need this many holders to qualify (default: 20)
  qualification_volume_sol?: number; // Need this much volume to qualify (default: 0.5)
  // Polling and attrition config
  polling_interval_seconds?: number; // For UI reference (default: 60)
  log_retention_hours?: number; // Delete logs older than this (default: 24)
  dead_retention_hours?: number; // Delete dead tokens older than this (default: 2)
  max_reevaluate_minutes?: number; // Only resurrect if dead within this time (default: 30)
  resurrection_holder_threshold?: number; // Resurrect if holders above this (default: 10)
  resurrection_volume_threshold_sol?: number; // Resurrect if volume above this (default: 0.1)
}

interface PollResults {
  tokensScanned: number;
  watchlistSize: number;
  newlyAdded: number;
  newlyQualified: number;
  removedDead: number;
  removedBombed: number;
  stillWatching: number;
  updated: number;
  errors: number;
  qualifiedTokens: string[];
  removedTokens: string[];
  // Re-evaluation stats
  resurrected: number;
  cleanedLogs: number;
  cleanedDeadTokens: number;
  promotedToBuyNow: number;
}

// Fetch latest tokens from Solana Tracker API
async function fetchLatestPumpfunTokens(limit = 200): Promise<TokenData[]> {
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  try {
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
    console.error('Error fetching tokens:', error);
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

// Simple bundle analysis
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

// Check for Mayhem Mode (hard reject)
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

// ============================================================================
// WATCHLIST POLLING - THE NEW CONTINUOUS MONITORING APPROACH
// ============================================================================

async function pollWithWatchlist(supabase: any, config: MonitorConfig, pollRunId?: string): Promise<PollResults> {
  console.log('📡 Starting WATCHLIST-based poll...');
  
  const results: PollResults = {
    tokensScanned: 0,
    watchlistSize: 0,
    newlyAdded: 0,
    newlyQualified: 0,
    removedDead: 0,
    removedBombed: 0,
    stillWatching: 0,
    updated: 0,
    errors: 0,
    qualifiedTokens: [],
    removedTokens: [],
    resurrected: 0,
    cleanedLogs: 0,
    cleanedDeadTokens: 0,
    promotedToBuyNow: 0,
  };

  // Config defaults
  const minWatchTime = config.min_watch_time_minutes ?? 2;
  const maxWatchTime = config.max_watch_time_minutes ?? 60;
  const deadHolderThreshold = config.dead_holder_threshold ?? 3;
  const deadVolumeThreshold = config.dead_volume_threshold_sol ?? 0.01;
  const qualifyHolders = config.qualification_holder_count ?? 20;
  const qualifyVolume = config.qualification_volume_sol ?? 0.5;
  // Re-evaluation and attrition config
  const logRetentionHours = config.log_retention_hours ?? 24;
  const deadRetentionHours = config.dead_retention_hours ?? 2;
  const maxReevaluateMinutes = config.max_reevaluate_minutes ?? 30;
  const resurrectionHolders = config.resurrection_holder_threshold ?? 10;
  const resurrectionVolume = config.resurrection_volume_threshold_sol ?? 0.1;

  const solPrice = await getSolPrice(supabase);

  // STEP 1: Fetch latest 200 tokens from API
  const tokens = await fetchLatestPumpfunTokens(200);
  results.tokensScanned = tokens.length;
  console.log(`📊 Fetched ${tokens.length} tokens from API`);

  if (tokens.length === 0) {
    return results;
  }

  // STEP 2: Get current watchlist
  const { data: currentWatchlist } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['watching', 'qualified']);
  
  const watchlistMap = new Map<string, WatchlistToken>();
  (currentWatchlist || []).forEach((t: WatchlistToken) => watchlistMap.set(t.token_mint, t));

  const now = new Date();
  const tokenMintsFromApi = new Set<string>();

  // STEP 3: Process each token from API
  for (const tokenData of tokens) {
    try {
      const mint = tokenData.token?.mint;
      if (!mint) continue;
      
      tokenMintsFromApi.add(mint);
      
      const pool = tokenData.pools?.[0];
      const volumeUsd = pool?.volume?.h24 || 0;
      const volumeSol = solPrice > 0 ? volumeUsd / solPrice : 0;
      const txCount = (tokenData.buys || 0) + (tokenData.sells || 0);
      const holderCount = tokenData.holders || 0;
      const priceUsd = pool?.price?.usd;
      const liquidityUsd = pool?.liquidity?.usd;
      const marketCapUsd = priceUsd ? priceUsd * 1_000_000_000 : null;

      const existing = watchlistMap.get(mint);

      if (existing) {
        // UPDATE existing watchlist entry
        const holderDelta = holderCount - (existing.holder_count || 0);
        const volumeDelta = volumeSol - (existing.volume_sol || 0);
        
        const updates: Partial<WatchlistToken> = {
          last_checked_at: now.toISOString(),
          check_count: (existing.check_count || 0) + 1,
          // Shift current to prev
          holder_count_prev: existing.holder_count,
          volume_sol_prev: existing.volume_sol,
          price_usd_prev: existing.price_usd,
          // Set new current
          holder_count: holderCount,
          volume_sol: volumeSol,
          tx_count: txCount,
          price_usd: priceUsd,
          market_cap_usd: marketCapUsd,
          liquidity_usd: liquidityUsd,
          // Track peaks
          holder_count_peak: Math.max(existing.holder_count_peak || 0, holderCount),
          price_ath_usd: Math.max(existing.price_ath_usd || 0, priceUsd || 0),
        };

        // Check for qualification (only if currently 'watching')
        if (existing.status === 'watching') {
          const watchingMinutes = (now.getTime() - new Date(existing.first_seen_at!).getTime()) / 60000;
          
          // QUALIFICATION CHECK
          if (watchingMinutes >= minWatchTime && 
              holderCount >= qualifyHolders && 
              volumeSol >= qualifyVolume &&
              (existing.bundle_score === null || existing.bundle_score <= config.max_bundle_score)) {
            
            updates.status = 'qualified';
            updates.qualified_at = now.toISOString();
            updates.qualification_reason = `Holders: ${holderCount} (Δ+${holderDelta}), Volume: ${volumeSol.toFixed(2)} SOL, Watched: ${watchingMinutes.toFixed(0)}m`;
            
            results.newlyQualified++;
            results.qualifiedTokens.push(`${tokenData.token?.symbol || mint.slice(0, 8)} (${holderCount} holders, ${volumeSol.toFixed(2)} SOL)`);
            console.log(`🎉 QUALIFIED: ${tokenData.token?.symbol} - ${updates.qualification_reason}`);
            
            // Also add to buy candidates
            await supabase.from('pumpfun_buy_candidates').upsert({
              token_mint: mint,
              token_name: tokenData.token?.name,
              token_symbol: tokenData.token?.symbol,
              creator_wallet: tokenData.creator,
              volume_sol_5m: volumeSol,
              volume_usd_5m: volumeUsd,
              holder_count: holderCount,
              transaction_count: txCount,
              bundle_score: existing.bundle_score,
              status: 'pending',
              detected_at: now.toISOString(),
              metadata: { watchlist_qualification: updates.qualification_reason },
            }, { onConflict: 'token_mint' });
          }
          
          // DEAD CHECK - token has been watching too long with no activity
          if (watchingMinutes > maxWatchTime && holderCount < deadHolderThreshold && volumeSol < deadVolumeThreshold) {
            updates.status = 'dead';
            updates.removed_at = now.toISOString();
            updates.removal_reason = `No activity for ${watchingMinutes.toFixed(0)}m, only ${holderCount} holders`;
            
            results.removedDead++;
            results.removedTokens.push(`${tokenData.token?.symbol || mint.slice(0, 8)} (dead - ${holderCount} holders)`);
            console.log(`💀 DEAD: ${tokenData.token?.symbol} - ${updates.removal_reason}`);
          }
        }
        
        // BOMBED CHECK - qualified token that crashed
        if (existing.status === 'qualified' && existing.price_ath_usd && priceUsd) {
          const dropPct = ((existing.price_ath_usd - priceUsd) / existing.price_ath_usd) * 100;
          if (dropPct >= 90) {
            updates.status = 'bombed';
            updates.removed_at = now.toISOString();
            updates.removal_reason = `Price dropped ${dropPct.toFixed(0)}% from ATH`;
            
            results.removedBombed++;
            results.removedTokens.push(`${tokenData.token?.symbol || mint.slice(0, 8)} (bombed -${dropPct.toFixed(0)}%)`);
            console.log(`💥 BOMBED: ${tokenData.token?.symbol} - ${updates.removal_reason}`);
          }
        }

        await supabase
          .from('pumpfun_watchlist')
          .update(updates)
          .eq('token_mint', mint);
        
        results.updated++;
        
      } else {
        // NEW token - add to watchlist
        // Quick Mayhem Mode check
        const isMayhem = await checkMayhemMode(mint);
        if (isMayhem) {
          console.log(`☠️ Skipping Mayhem Mode token: ${tokenData.token?.symbol}`);
          continue;
        }

        // Get bundle score for new tokens
        let bundleScore = null;
        try {
          await new Promise(r => setTimeout(r, 100)); // Rate limit
          const risk = await analyzeTokenRisk(mint);
          bundleScore = risk.bundleScore;
        } catch { /* ignore */ }

        // Skip if bundle score too high
        if (bundleScore !== null && bundleScore > config.max_bundle_score) {
          console.log(`⚠️ Skipping high bundle: ${tokenData.token?.symbol} (${bundleScore})`);
          continue;
        }

        const newEntry: Partial<WatchlistToken> = {
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
          bundle_score: bundleScore,
          creator_wallet: tokenData.creator,
          metadata: { image: tokenData.token?.image },
        };

        const { error } = await supabase.from('pumpfun_watchlist').insert(newEntry);
        
        if (!error) {
          results.newlyAdded++;
          console.log(`➕ Added to watchlist: ${tokenData.token?.symbol} (${holderCount} holders, ${volumeSol.toFixed(2)} SOL)`);
        }
      }
    } catch (error) {
      console.error('Error processing token:', error);
      results.errors++;
    }
  }

  // STEP 4: Re-evaluate recently dead/bombed tokens for resurrection
  const reevaluateCutoff = new Date(now.getTime() - maxReevaluateMinutes * 60 * 1000).toISOString();
  const { data: recentlyDead } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['dead', 'bombed'])
    .eq('permanent_reject', false)
    .gte('removed_at', reevaluateCutoff)
    .limit(50);

  for (const deadToken of (recentlyDead || [])) {
    // Check if this token appeared in the latest API response with good metrics
    const apiToken = tokens.find(t => t.token?.mint === deadToken.token_mint);
    if (apiToken) {
      const pool = apiToken.pools?.[0];
      const volumeUsd = pool?.volume?.h24 || 0;
      const volumeSol = solPrice > 0 ? volumeUsd / solPrice : 0;
      const holderCount = apiToken.holders || 0;
      
      // Resurrection check: metrics now good enough?
      if (holderCount >= resurrectionHolders || volumeSol >= resurrectionVolume) {
        await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'watching',
            removed_at: null,
            removal_reason: null,
            last_checked_at: now.toISOString(),
            holder_count: holderCount,
            volume_sol: volumeSol,
            metadata: { ...deadToken.metadata, resurrected_at: now.toISOString() },
          })
          .eq('id', deadToken.id);
        
        results.resurrected++;
        console.log(`🔄 RESURRECTED: ${deadToken.token_symbol} (now ${holderCount} holders, ${volumeSol.toFixed(2)} SOL)`);
      }
    }
  }

  // STEP 5: Promote high-performing qualified tokens to buy_now
  const { data: qualifiedTokens } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .limit(50);

  for (const token of (qualifiedTokens || [])) {
    // Promote to buy_now if exceptional metrics (3x the qualification threshold)
    if (token.holder_count >= qualifyHolders * 3 && token.volume_sol >= qualifyVolume * 3) {
      await supabase
        .from('pumpfun_watchlist')
        .update({
          status: 'buy_now',
          last_checked_at: now.toISOString(),
          qualification_reason: `PROMOTED: ${token.holder_count} holders, ${token.volume_sol.toFixed(2)} SOL (3x threshold)`,
        })
        .eq('id', token.id);
      
      results.promotedToBuyNow++;
      console.log(`🚀 PROMOTED TO BUY_NOW: ${token.token_symbol}`);
    }
  }

  // STEP 6: Attrition - cleanup old logs and permanently dead tokens
  // Delete old discovery logs
  const logCutoff = new Date(now.getTime() - logRetentionHours * 60 * 60 * 1000).toISOString();
  const { count: deletedLogs } = await supabase
    .from('pumpfun_discovery_logs')
    .delete()
    .lt('created_at', logCutoff)
    .select('id', { count: 'exact', head: true });
  results.cleanedLogs = deletedLogs || 0;
  if (results.cleanedLogs > 0) {
    console.log(`🧹 Cleaned ${results.cleanedLogs} old discovery logs`);
  }

  // Permanently delete old dead/bombed tokens (or mark as permanent_reject)
  const deadCutoff = new Date(now.getTime() - deadRetentionHours * 60 * 60 * 1000).toISOString();
  const { count: permanentlyRejected } = await supabase
    .from('pumpfun_watchlist')
    .update({ permanent_reject: true })
    .in('status', ['dead', 'bombed'])
    .lt('removed_at', deadCutoff)
    .eq('permanent_reject', false)
    .select('id', { count: 'exact', head: true });
  results.cleanedDeadTokens = permanentlyRejected || 0;
  if (results.cleanedDeadTokens > 0) {
    console.log(`🗑️ Marked ${results.cleanedDeadTokens} tokens as permanently rejected`);
  }

  // STEP 7: Count final stats
  const { count: watchingCount } = await supabase
    .from('pumpfun_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'watching');
  
  const { count: qualifiedCount } = await supabase
    .from('pumpfun_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'qualified');

  const { count: buyNowCount } = await supabase
    .from('pumpfun_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'buy_now');

  results.watchlistSize = (watchingCount || 0) + (qualifiedCount || 0) + (buyNowCount || 0);
  results.stillWatching = watchingCount || 0;

  // Update poll run record
  if (pollRunId) {
    await supabase.from('pumpfun_poll_runs').update({
      finished_at: now.toISOString(),
      status: 'success',
      results,
      tokens_scanned: results.tokensScanned,
      candidates_added: results.newlyQualified,
    }).eq('id', pollRunId);
  }

  console.log('📊 POLL RESULTS:', JSON.stringify(results, null, 2));
  return results;
}

// Get watchlist entries
async function getWatchlist(supabase: any, status?: string, limit = 100, sortBy = 'last_checked_at') {
  let query = supabase
    .from('pumpfun_watchlist')
    .select('*')
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Get watchlist stats
async function getWatchlistStats(supabase: any) {
  const [watching, qualified, dead, bombed] = await Promise.all([
    supabase.from('pumpfun_watchlist').select('id', { count: 'exact', head: true }).eq('status', 'watching'),
    supabase.from('pumpfun_watchlist').select('id', { count: 'exact', head: true }).eq('status', 'qualified'),
    supabase.from('pumpfun_watchlist').select('id', { count: 'exact', head: true }).eq('status', 'dead'),
    supabase.from('pumpfun_watchlist').select('id', { count: 'exact', head: true }).eq('status', 'bombed'),
  ]);

  // Get recent qualifications
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentQualified } = await supabase
    .from('pumpfun_watchlist')
    .select('token_symbol, token_mint, holder_count, volume_sol, qualified_at')
    .eq('status', 'qualified')
    .gte('qualified_at', oneHourAgo)
    .order('qualified_at', { ascending: false })
    .limit(10);

  return {
    watching: watching.count || 0,
    qualified: qualified.count || 0,
    dead: dead.count || 0,
    bombed: bombed.count || 0,
    total: (watching.count || 0) + (qualified.count || 0) + (dead.count || 0) + (bombed.count || 0),
    recentQualified: recentQualified || [],
  };
}

// Remove token from watchlist
async function removeFromWatchlist(supabase: any, tokenMint: string, reason: string) {
  const { error } = await supabase
    .from('pumpfun_watchlist')
    .update({
      status: 'removed',
      removed_at: new Date().toISOString(),
      removal_reason: reason,
    })
    .eq('token_mint', tokenMint);

  if (error) throw error;
  return { success: true };
}

// Get candidates (keep for backward compatibility)
async function getCandidates(supabase: any, status?: string, limit = 50) {
  let query = supabase
    .from('pumpfun_buy_candidates')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Get monitor config
async function getConfig(supabase: any): Promise<MonitorConfig> {
  const { data, error } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .single();

  if (error || !data) {
    return {
      min_volume_sol_5m: 0.1,
      min_transactions: 5,
      max_token_age_minutes: 60,
      max_bundle_score: 70,
      auto_scalp_enabled: false,
      scalp_test_mode: true,
      is_enabled: true,
    };
  }

  return data;
}

// Update config
async function updateConfig(supabase: any, updates: Partial<MonitorConfig>) {
  const { data, error } = await supabase
    .from('pumpfun_monitor_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .not('id', 'is', null)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Approve candidate
async function approveCandidate(supabase: any, candidateId: string) {
  const { error } = await supabase
    .from('pumpfun_buy_candidates')
    .update({
      status: 'approved',
      scalp_approved: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (error) throw error;
  return { success: true };
}

// Reject candidate
async function rejectCandidate(supabase: any, candidateId: string, reason: string) {
  const { error } = await supabase
    .from('pumpfun_buy_candidates')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (error) throw error;
  return { success: true };
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
    const action = url.searchParams.get('action') || 'poll';

    console.log(`🎯 pumpfun-new-token-monitor action: ${action}`);

    switch (action) {
      case 'poll': {
        const config = await getConfig(supabase);
        
        if (!config.is_enabled) {
          return jsonResponse({ success: false, message: 'Monitor is disabled' });
        }

        // Create poll run record
        const pollRunId = crypto.randomUUID();
        const pollStartedAt = new Date();
        
        await supabase.from('pumpfun_poll_runs').insert({
          id: pollRunId,
          started_at: pollStartedAt.toISOString(),
          status: 'running',
        });

        try {
          const results = await pollWithWatchlist(supabase, config, pollRunId);
          
          const pollFinishedAt = new Date();
          await supabase.from('pumpfun_poll_runs').update({
            finished_at: pollFinishedAt.toISOString(),
            duration_ms: pollFinishedAt.getTime() - pollStartedAt.getTime(),
            status: 'success',
            results,
          }).eq('id', pollRunId);

          return jsonResponse({ 
            success: true, 
            results, 
            pollRunId,
            durationMs: pollFinishedAt.getTime() - pollStartedAt.getTime(),
          });
        } catch (pollError) {
          await supabase.from('pumpfun_poll_runs').update({
            finished_at: new Date().toISOString(),
            status: 'error',
            error_message: String(pollError),
          }).eq('id', pollRunId);
          
          throw pollError;
        }
      }

      case 'watchlist': {
        const status = url.searchParams.get('status') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const sortBy = url.searchParams.get('sort') || 'last_checked_at';
        const watchlist = await getWatchlist(supabase, status, limit, sortBy);
        return jsonResponse({ success: true, watchlist });
      }

      case 'watchlist_stats': {
        const stats = await getWatchlistStats(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'remove_from_watchlist': {
        const body = await req.json();
        const { tokenMint, reason = 'Manually removed' } = body;
        const result = await removeFromWatchlist(supabase, tokenMint, reason);
        return jsonResponse(result);
      }

      case 'candidates': {
        const status = url.searchParams.get('status') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const candidates = await getCandidates(supabase, status, limit);
        return jsonResponse({ success: true, candidates });
      }

      case 'config': {
        if (req.method === 'POST') {
          const body = await req.json();
          const updated = await updateConfig(supabase, body);
          return jsonResponse({ success: true, config: updated });
        } else {
          const config = await getConfig(supabase);
          return jsonResponse({ success: true, config });
        }
      }

      case 'approve': {
        const body = await req.json();
        const result = await approveCandidate(supabase, body.candidateId);
        return jsonResponse(result);
      }

      case 'reject': {
        const body = await req.json();
        const result = await rejectCandidate(supabase, body.candidateId, body.reason || 'Manually rejected');
        return jsonResponse(result);
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-new-token-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
