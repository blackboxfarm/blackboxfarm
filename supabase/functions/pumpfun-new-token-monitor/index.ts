import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  token: {
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    image?: string;
    description?: string;
  };
  pools?: Array<{
    liquidity?: { usd?: number };
    price?: { usd?: number };
    volume?: { h24?: number };
    txns?: { h24?: number };
  }>;
  risk?: {
    rugged?: boolean;
    score?: number;
  };
  events?: {
    createdAt?: number;
  };
  creator?: string;
  holders?: number;
  buys?: number;
  sells?: number;
}

interface MonitorConfig {
  min_volume_sol_5m: number;
  min_transactions: number;
  max_token_age_minutes: number;
  max_bundle_score: number;
  auto_scalp_enabled: boolean;
  scalp_test_mode: boolean;
  is_enabled: boolean;
}

// Helper to create JSON responses
const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

// Fetch latest tokens from Solana Tracker API
async function fetchLatestPumpfunTokens(limit = 20): Promise<TokenData[]> {
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

// Fetch detailed token info including volume
async function fetchTokenDetails(mint: string): Promise<any> {
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  try {
    const response = await fetch(
      `https://data.solanatracker.io/tokens/${mint}`,
      {
        headers: {
          'x-api-key': apiKey || '',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching details for ${mint}:`, error);
    return null;
  }
}

// Simple bundle analysis - check first buyers
async function analyzeTokenRisk(mint: string): Promise<{ bundleScore: number; isBundled: boolean; details: any }> {
  try {
    // Use the first-buyers-utils logic to analyze
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
      return { bundleScore: 50, isBundled: false, details: { error: 'Could not fetch holders' } };
    }

    const holders = await response.json();
    
    if (!Array.isArray(holders) || holders.length === 0) {
      return { bundleScore: 30, isBundled: false, details: { holderCount: 0 } };
    }

    // Calculate concentration
    const top10Holdings = holders.slice(0, 10).reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);
    const top5Holdings = holders.slice(0, 5).reduce((sum: number, h: any) => sum + (h.percentage || 0), 0);

    // Simple bundle score based on concentration
    let bundleScore = 0;
    if (top10Holdings > 80) bundleScore += 40;
    else if (top10Holdings > 60) bundleScore += 25;
    else if (top10Holdings > 40) bundleScore += 10;

    if (top5Holdings > 60) bundleScore += 30;
    else if (top5Holdings > 40) bundleScore += 15;

    // Check for similar sized holdings (bundling indicator)
    const holdingAmounts = holders.slice(0, 10).map((h: any) => h.percentage || 0);
    const similarSizedCount = holdingAmounts.filter((a: number, i: number) => 
      holdingAmounts.some((b: number, j: number) => i !== j && Math.abs(a - b) < 0.5 && a > 1)
    ).length;
    
    if (similarSizedCount >= 4) bundleScore += 20;
    else if (similarSizedCount >= 2) bundleScore += 10;

    return {
      bundleScore: Math.min(100, bundleScore),
      isBundled: bundleScore >= 50,
      details: {
        holderCount: holders.length,
        top5Holdings,
        top10Holdings,
        similarSizedCount,
      },
    };
  } catch (error) {
    console.error(`Error analyzing risk for ${mint}:`, error);
    return { bundleScore: 50, isBundled: false, details: { error: String(error) } };
  }
}

// Check if developer is known scammer
async function checkDeveloperReputation(supabase: any, creatorWallet: string): Promise<{ isScam: boolean; integrityScore?: number }> {
  try {
    const { data } = await supabase
      .from('developer_profiles')
      .select('integrity_score, total_tokens_created, successful_tokens')
      .eq('wallet_address', creatorWallet)
      .single();

    if (!data) {
      return { isScam: false }; // Unknown dev, not flagged
    }

    // Flag as scam if very low integrity score
    if (data.integrity_score !== null && data.integrity_score < 20) {
      return { isScam: true, integrityScore: data.integrity_score };
    }

    // Flag if many tokens but none successful
    if (data.total_tokens_created > 5 && data.successful_tokens === 0) {
      return { isScam: true, integrityScore: data.integrity_score };
    }

    return { isScam: false, integrityScore: data.integrity_score };
  } catch {
    return { isScam: false };
  }
}

// Main polling function
async function pollForNewTokens(supabase: any, config: MonitorConfig) {
  console.log('📡 Starting pump.fun new token poll...');

  // Get recent candidates to avoid re-processing
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentCandidates } = await supabase
    .from('pumpfun_buy_candidates')
    .select('token_mint')
    .gte('detected_at', oneHourAgo);

  const existingMints = new Set((recentCandidates || []).map((c: any) => c.token_mint));

  // Fetch latest tokens
  const tokens = await fetchLatestPumpfunTokens(20);
  console.log(`📊 Fetched ${tokens.length} tokens from Solana Tracker`);

  const results = {
    tokensScanned: tokens.length,
    skippedExisting: 0,
    skippedLowVolume: 0,
    skippedOld: 0,
    skippedHighRisk: 0,
    candidatesAdded: 0,
    scalpApproved: 0,
    errors: 0,
  };

  const solPrice = await getSolPrice(supabase);

  for (const tokenData of tokens) {
    try {
      const mint = tokenData.token?.mint;
      if (!mint) continue;

      // Skip if already processed
      if (existingMints.has(mint)) {
        results.skippedExisting++;
        continue;
      }

      // Get detailed token info
      const details = await fetchTokenDetails(mint);
      if (!details) {
        results.errors++;
        continue;
      }

      // Check token age
      const createdAt = details.events?.createdAt || tokenData.events?.createdAt;
      if (createdAt) {
        const ageMinutes = (Date.now() - createdAt * 1000) / 60000;
        if (ageMinutes > config.max_token_age_minutes) {
          results.skippedOld++;
          continue;
        }
      }

      // Calculate volume in SOL
      const pool = details.pools?.[0] || tokenData.pools?.[0];
      const volumeUsd = pool?.volume?.h24 || 0;
      const volumeSol = solPrice > 0 ? volumeUsd / solPrice : 0;
      const txCount = (details.buys || 0) + (details.sells || 0) + (pool?.txns?.h24 || 0);

      // Volume surge filter
      if (volumeSol < config.min_volume_sol_5m) {
        results.skippedLowVolume++;
        continue;
      }

      if (txCount < config.min_transactions) {
        results.skippedLowVolume++;
        continue;
      }

      console.log(`🔍 Analyzing ${details.token?.symbol || mint.slice(0, 8)}... (Volume: ${volumeSol.toFixed(2)} SOL, Txs: ${txCount})`);

      // Risk analysis
      const riskAnalysis = await analyzeTokenRisk(mint);
      
      if (riskAnalysis.bundleScore > config.max_bundle_score) {
        results.skippedHighRisk++;
        console.log(`⚠️ Skipping ${mint.slice(0, 8)} - high bundle score: ${riskAnalysis.bundleScore}`);
        continue;
      }

      // Check developer reputation
      const creatorWallet = details.creator || tokenData.creator;
      if (creatorWallet) {
        const devCheck = await checkDeveloperReputation(supabase, creatorWallet);
        if (devCheck.isScam) {
          results.skippedHighRisk++;
          console.log(`⚠️ Skipping ${mint.slice(0, 8)} - known scam dev`);
          continue;
        }
      }

      // Calculate bonding curve percentage if available
      const marketCapUsd = pool?.price?.usd ? pool.price.usd * 1_000_000_000 : null;
      const bondingCurvePct = marketCapUsd ? Math.min(100, (marketCapUsd / 69000) * 100) : null;

      // Insert as candidate
      const candidateData = {
        token_mint: mint,
        token_name: details.token?.name || tokenData.token?.name,
        token_symbol: details.token?.symbol || tokenData.token?.symbol,
        creator_wallet: creatorWallet,
        volume_sol_5m: volumeSol,
        volume_usd_5m: volumeUsd,
        bonding_curve_pct: bondingCurvePct,
        market_cap_usd: marketCapUsd,
        holder_count: details.holders || riskAnalysis.details.holderCount || 0,
        transaction_count: txCount,
        bundle_score: riskAnalysis.bundleScore,
        is_bundled: riskAnalysis.isBundled,
        status: 'pending',
        auto_buy_enabled: config.auto_scalp_enabled,
        metadata: {
          image: details.token?.image,
          description: details.token?.description,
          riskDetails: riskAnalysis.details,
          pool: pool,
        },
      };

      const { error: insertError } = await supabase
        .from('pumpfun_buy_candidates')
        .insert(candidateData);

      if (insertError) {
        if (insertError.code === '23505') {
          // Duplicate - already exists
          results.skippedExisting++;
        } else {
          console.error(`Error inserting candidate:`, insertError);
          results.errors++;
        }
        continue;
      }

      results.candidatesAdded++;
      console.log(`✅ Added candidate: ${candidateData.token_symbol} (${mint.slice(0, 8)}...)`);

      // Auto-scalp integration if enabled
      if (config.auto_scalp_enabled) {
        try {
          const scalpResult = await runScalpValidation(supabase, mint, candidateData, config.scalp_test_mode);
          
          // Update candidate with scalp result
          await supabase
            .from('pumpfun_buy_candidates')
            .update({
              scalp_validation_result: scalpResult,
              scalp_approved: scalpResult.recommendation === 'BUY',
              status: scalpResult.recommendation === 'BUY' ? 'approved' : 'rejected',
              rejection_reason: scalpResult.recommendation !== 'BUY' ? scalpResult.hard_rejects?.join(', ') : null,
            })
            .eq('token_mint', mint);

          if (scalpResult.recommendation === 'BUY') {
            results.scalpApproved++;
            console.log(`🚀 Scalp approved: ${candidateData.token_symbol}`);
          }
        } catch (scalpError) {
          console.error('Scalp validation error:', scalpError);
        }
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      console.error('Error processing token:', error);
      results.errors++;
    }
  }

  // Update monitor stats
  await supabase
    .from('pumpfun_monitor_config')
    .update({
      last_poll_at: new Date().toISOString(),
      tokens_processed_count: supabase.sql`tokens_processed_count + ${results.tokensScanned}`,
      candidates_found_count: supabase.sql`candidates_found_count + ${results.candidatesAdded}`,
    })
    .not('id', 'is', null);

  console.log('📊 Poll results:', results);
  return results;
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
    
    return data?.price_usd || 200; // Default fallback
  } catch {
    return 200;
  }
}

// Run scalp mode validation
async function runScalpValidation(
  supabase: any,
  tokenMint: string,
  candidateData: any,
  testMode: boolean
): Promise<any> {
  try {
    // Call the scalp-mode-validator function
    const { data, error } = await supabase.functions.invoke('scalp-mode-validator', {
      body: {
        tokenMint,
        channelId: 'pumpfun-monitor',
        messageText: `New pump.fun token: ${candidateData.token_symbol}`,
        config: {
          min_bonding_curve_pct: 1,
          max_bonding_curve_pct: 80,
          scalp_buy_amount_sol: testMode ? 0 : 0.05,
          scalp_take_profit_pct: 50,
          scalp_stop_loss_pct: 35,
        },
      },
    });

    if (error) {
      console.error('Scalp validator error:', error);
      return { recommendation: 'SKIP', error: error.message };
    }

    return data || { recommendation: 'SKIP' };
  } catch (error) {
    console.error('Scalp validation failed:', error);
    return { recommendation: 'SKIP', error: String(error) };
  }
}

// Get pending candidates
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
  
  if (error) {
    throw error;
  }

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
      min_volume_sol_5m: 1.0,
      min_transactions: 10,
      max_token_age_minutes: 10,
      max_bundle_score: 70,
      auto_scalp_enabled: false,
      scalp_test_mode: true,
      is_enabled: true,
    };
  }

  return data;
}

// Update monitor config
async function updateConfig(supabase: any, updates: Partial<MonitorConfig>) {
  const { data, error } = await supabase
    .from('pumpfun_monitor_config')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .not('id', 'is', null)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// Approve a candidate manually
async function approveCandidate(supabase: any, candidateId: string, testMode: boolean) {
  const { data: candidate, error: fetchError } = await supabase
    .from('pumpfun_buy_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (fetchError || !candidate) {
    throw new Error('Candidate not found');
  }

  // Run scalp validation
  const scalpResult = await runScalpValidation(supabase, candidate.token_mint, candidate, testMode);

  const { error: updateError } = await supabase
    .from('pumpfun_buy_candidates')
    .update({
      scalp_validation_result: scalpResult,
      scalp_approved: true,
      status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (updateError) {
    throw updateError;
  }

  return { success: true, scalpResult };
}

// Reject a candidate
async function rejectCandidate(supabase: any, candidateId: string, reason: string) {
  const { error } = await supabase
    .from('pumpfun_buy_candidates')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId);

  if (error) {
    throw error;
  }

  return { success: true };
}

// Get statistics
async function getStats(supabase: any) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const [configResult, totalResult, pendingResult, approvedResult, hourlyResult] = await Promise.all([
    supabase.from('pumpfun_monitor_config').select('*').limit(1).single(),
    supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }),
    supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }).eq('scalp_approved', true),
    supabase.from('pumpfun_buy_candidates').select('id', { count: 'exact', head: true }).gte('detected_at', oneHourAgo),
  ]);

  return {
    config: configResult.data,
    totalCandidates: totalResult.count || 0,
    pendingCandidates: pendingResult.count || 0,
    approvedCandidates: approvedResult.count || 0,
    candidatesLastHour: hourlyResult.count || 0,
    lastPollAt: configResult.data?.last_poll_at,
  };
}

serve(async (req) => {
  // Handle CORS preflight
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

        const results = await pollForNewTokens(supabase, config);
        return jsonResponse({ success: true, results });
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
        const { candidateId, testMode = true } = body;
        const result = await approveCandidate(supabase, candidateId, testMode);
        return jsonResponse(result);
      }

      case 'reject': {
        const body = await req.json();
        const { candidateId, reason = 'Manually rejected' } = body;
        const result = await rejectCandidate(supabase, candidateId, reason);
        return jsonResponse(result);
      }

      case 'stats': {
        const stats = await getStats(supabase);
        return jsonResponse({ success: true, stats });
      }

      default:
        return errorResponse(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in pumpfun-new-token-monitor:', error);
    return errorResponse(String(error), 500);
  }
});
