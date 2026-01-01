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

// Mayhem Mode Detection Constants
const MAYHEM_MODE_PROGRAM_ID = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e';
const NORMAL_PUMPFUN_SUPPLY = 1000000000000000; // 1 billion with 6 decimals
const MAYHEM_PUMPFUN_SUPPLY = 2000000000000000; // 2 billion with 6 decimals

// Helper to create JSON responses
const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

// Comprehensive discovery log entry for learning and backtesting
interface DiscoveryLogEntry {
  token: TokenData;
  decision: 'accepted' | 'rejected' | 'error';
  rejectionReason?: string;
  volumeSol: number;
  volumeUsd: number;
  txCount: number;
  bundleScore?: number;
  riskDetails?: any;
  devIntegrityScore?: number;
  config: MonitorConfig;
  passedFilters: string[];
  failedFilters: string[];
  acceptanceReasoning?: string[];
  // New enhanced scoring fields
  isMayhemMode?: boolean;
  socialScore?: number;
  twitterScore?: number;
  websiteScore?: number;
  telegramScore?: number;
  socialDetails?: any;
  dexPaidEarly?: boolean;
  dexPaidDetails?: any;
  priceTier?: string;
  walletQualityScore?: number;
  firstBuyersAnalysis?: any;
}

// ============================================================================
// MAYHEM MODE DETECTION (HARD REJECT)
// ============================================================================

async function checkMayhemMode(tokenMint: string): Promise<{ isMayhemMode: boolean; details: any }> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
    if (!response.ok) {
      return { isMayhemMode: false, details: { error: `HTTP ${response.status}` } };
    }
    
    const data = await response.json();
    const totalSupply = data.total_supply || 0;
    const program = data.program || null;
    
    // Detect Mayhem Mode:
    // 1. Check if program field matches Mayhem Mode program ID
    // 2. Check if total_supply is 2 billion (double the normal 1 billion)
    const isMayhemMode = program === MAYHEM_MODE_PROGRAM_ID || 
                         totalSupply >= MAYHEM_PUMPFUN_SUPPLY;
    
    if (isMayhemMode) {
      console.log(`☠️ MAYHEM MODE DETECTED for ${tokenMint.slice(0, 8)} (supply: ${totalSupply}, program: ${program})`);
    }
    
    return {
      isMayhemMode,
      details: {
        program,
        totalSupply,
        isMayhemProgramId: program === MAYHEM_MODE_PROGRAM_ID,
        isDoubleSupply: totalSupply >= MAYHEM_PUMPFUN_SUPPLY,
      },
    };
  } catch (error) {
    console.error(`Error checking Mayhem Mode for ${tokenMint}:`, error);
    return { isMayhemMode: false, details: { error: String(error) } };
  }
}

// ============================================================================
// SOCIAL QUALITY SCORING
// ============================================================================

interface SocialQualityResult {
  totalScore: number;
  twitterScore: number;
  websiteScore: number;
  telegramScore: number;
  details: {
    hasTwitter: boolean;
    hasWebsite: boolean;
    hasTelegram: boolean;
    twitterUrl?: string;
    websiteUrl?: string;
    telegramUrl?: string;
    websiteTld?: string;
    telegramType?: 'channel' | 'group' | 'unknown';
    warnings: string[];
  };
}

async function analyzeSocialQuality(tokenMint: string): Promise<SocialQualityResult> {
  const result: SocialQualityResult = {
    totalScore: 0,
    twitterScore: 0,
    websiteScore: 0,
    telegramScore: 0,
    details: {
      hasTwitter: false,
      hasWebsite: false,
      hasTelegram: false,
      warnings: [],
    },
  };

  try {
    // Fetch DexScreener data for social links
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (!response.ok) {
      return result;
    }

    const data = await response.json();
    const pair = data.pairs?.[0];
    if (!pair) return result;

    // Extract social links from DexScreener
    const info = pair.info || {};
    const socials = info.socials || [];
    const websites = info.websites || [];

    // Twitter Analysis (0-25 points)
    const twitterLink = socials.find((s: any) => s.type === 'twitter');
    if (twitterLink?.url) {
      result.details.hasTwitter = true;
      result.details.twitterUrl = twitterLink.url;
      
      // Basic score for having Twitter
      result.twitterScore = 10;
      
      // Check if Twitter link looks legitimate (not just token name)
      const twitterHandle = twitterLink.url.split('/').pop()?.toLowerCase();
      const tokenSymbol = pair.baseToken?.symbol?.toLowerCase();
      
      // If Twitter handle matches token exactly = suspicious (new account for token)
      if (twitterHandle === tokenSymbol) {
        result.twitterScore = 5;
        result.details.warnings.push('Twitter handle matches token name exactly');
      } else {
        result.twitterScore = 15; // Better if it's an established account
      }
    }

    // Website Analysis (0-25 points)
    const websiteLink = websites[0];
    if (websiteLink?.url) {
      result.details.hasWebsite = true;
      result.details.websiteUrl = websiteLink.url;
      
      try {
        const url = new URL(websiteLink.url);
        const tld = url.hostname.split('.').pop()?.toLowerCase();
        result.details.websiteTld = tld;
        
        // TLD scoring
        if (tld === 'com' || tld === 'io' || tld === 'org') {
          result.websiteScore = 15;
        } else if (tld === 'xyz' || tld === 'fun' || tld === 'meme') {
          result.websiteScore = 8;
          result.details.warnings.push(`Suspicious TLD: .${tld}`);
        } else {
          result.websiteScore = 10;
        }
      } catch {
        result.websiteScore = 5;
      }
    }

    // Telegram Analysis (0-25 points)
    const telegramLink = socials.find((s: any) => s.type === 'telegram');
    if (telegramLink?.url) {
      result.details.hasTelegram = true;
      result.details.telegramUrl = telegramLink.url;
      
      // Determine if it's a channel (one-way) or group (community)
      const tgUrl = telegramLink.url.toLowerCase();
      
      if (tgUrl.includes('/+') || tgUrl.includes('/joinchat')) {
        // Group invite link = good (community chat)
        result.details.telegramType = 'group';
        result.telegramScore = 20;
      } else {
        // Public channel = could be one-way (controlled narrative)
        result.details.telegramType = 'channel';
        result.telegramScore = 10;
        result.details.warnings.push('Telegram appears to be channel-only (one-way)');
      }
    }

    // Bonus for having all three
    const hasAll = result.details.hasTwitter && result.details.hasWebsite && result.details.hasTelegram;
    if (hasAll) {
      result.totalScore = result.twitterScore + result.websiteScore + result.telegramScore + 25;
    } else {
      result.totalScore = result.twitterScore + result.websiteScore + result.telegramScore;
    }

    console.log(`📱 Social Score for ${tokenMint.slice(0, 8)}: ${result.totalScore}/100 (T:${result.twitterScore} W:${result.websiteScore} TG:${result.telegramScore})`);

  } catch (error) {
    console.error(`Error analyzing social quality for ${tokenMint}:`, error);
  }

  return result;
}

// ============================================================================
// DEX PAID STATUS CHECK (Early = Red Flag)
// ============================================================================

interface DexPaidResult {
  hasPaidProfile: boolean;
  hasActiveAds: boolean;
  hasBoosts: boolean;
  boostCount: number;
  isEarlyPaidSuspicious: boolean;
  details: any;
}

async function checkEarlyDexPaid(tokenMint: string, tokenAgeMinutes: number): Promise<DexPaidResult> {
  const result: DexPaidResult = {
    hasPaidProfile: false,
    hasActiveAds: false,
    hasBoosts: false,
    boostCount: 0,
    isEarlyPaidSuspicious: false,
    details: {},
  };

  try {
    // Check DexScreener orders API
    const ordersResponse = await fetch(`https://api.dexscreener.com/orders/v1/solana/${tokenMint}`);
    if (ordersResponse.ok) {
      const orders = await ordersResponse.json();
      
      if (Array.isArray(orders)) {
        for (const order of orders) {
          if (order.type === 'tokenProfile' && order.status === 'approved') {
            result.hasPaidProfile = true;
          }
          if (order.type === 'communityTakeover' && order.status === 'approved') {
            result.hasPaidProfile = true; // CTO also counts
          }
        }
        result.details.orders = orders;
      }
    }

    // Check boosts API
    const boostsResponse = await fetch(`https://api.dexscreener.com/token-boosts/latest/v1?chainId=solana&tokenAddress=${tokenMint}`);
    if (boostsResponse.ok) {
      const boostsData = await boostsResponse.json();
      if (Array.isArray(boostsData) && boostsData.length > 0) {
        result.hasBoosts = true;
        result.boostCount = boostsData.length;
        result.details.boosts = boostsData;
      }
    }

    // Determine if early paid status is suspicious
    // If token is under 10 minutes old AND has paid features = RED FLAG
    if (tokenAgeMinutes < 10 && (result.hasPaidProfile || result.hasBoosts)) {
      result.isEarlyPaidSuspicious = true;
      console.log(`🚨 EARLY DEX PAID RED FLAG for ${tokenMint.slice(0, 8)}: Age ${tokenAgeMinutes.toFixed(1)}m, Paid: ${result.hasPaidProfile}, Boosts: ${result.boostCount}`);
    }

  } catch (error) {
    console.error(`Error checking DEX paid status for ${tokenMint}:`, error);
    result.details.error = String(error);
  }

  return result;
}

// ============================================================================
// PRICE TIER DETERMINATION
// ============================================================================

function determinePriceTier(priceUsd: number | null | undefined): string | null {
  if (!priceUsd || priceUsd <= 0) return null;
  
  if (priceUsd < 0.00001) return 'ultra_low';
  if (priceUsd < 0.0001) return 'low';
  if (priceUsd < 0.001) return 'medium';
  return 'high';
}

// Log a discovery decision to the database with FULL reasoning
async function logDiscovery(supabase: any, entry: DiscoveryLogEntry) {
  try {
    const { 
      token, decision, rejectionReason, volumeSol, volumeUsd, txCount, 
      bundleScore, riskDetails, devIntegrityScore, config, passedFilters, failedFilters, 
      acceptanceReasoning,
      // New enhanced fields
      isMayhemMode, socialScore, twitterScore, websiteScore, telegramScore,
      socialDetails, dexPaidEarly, dexPaidDetails, priceTier, walletQualityScore, firstBuyersAnalysis
    } = entry;
    
    const pool = token.pools?.[0];
    const createdAt = token.events?.createdAt;
    const ageMinutes = createdAt ? (Date.now() - createdAt * 1000) / 60000 : null;
    const priceUsd = pool?.price?.usd;
    const liquidityUsd = pool?.liquidity?.usd;
    const marketCapUsd = priceUsd ? priceUsd * 1_000_000_000 : null;
    const bondingCurvePct = marketCapUsd ? Math.min(100, (marketCapUsd / 69000) * 100) : null;
    const buysCount = token.buys || 0;
    const sellsCount = token.sells || 0;
    const buySellRatio = sellsCount > 0 ? buysCount / sellsCount : buysCount > 0 ? 999 : 0;

    // Build score breakdown for understanding decisions
    const scoreBreakdown = {
      volumeScore: volumeSol >= config.min_volume_sol_5m ? 100 : (volumeSol / config.min_volume_sol_5m) * 100,
      txScore: txCount >= config.min_transactions ? 100 : (txCount / config.min_transactions) * 100,
      ageScore: ageMinutes && ageMinutes <= config.max_token_age_minutes ? 100 : 0,
      bundleScore: bundleScore !== undefined ? Math.max(0, 100 - bundleScore) : null,
      buySellRatioScore: buySellRatio >= 1 ? Math.min(100, buySellRatio * 20) : buySellRatio * 100,
      holderScore: Math.min(100, (token.holders || 0) * 5),
      socialScore: socialScore || null,
    };

    await supabase.from('pumpfun_discovery_logs').insert({
      token_mint: token.token?.mint,
      token_symbol: token.token?.symbol,
      token_name: token.token?.name,
      decision,
      rejection_reason: rejectionReason,
      volume_sol: volumeSol,
      volume_usd: volumeUsd,
      tx_count: txCount,
      bundle_score: bundleScore,
      holder_count: token.holders,
      age_minutes: ageMinutes,
      // Detailed columns
      price_usd: priceUsd,
      market_cap_usd: marketCapUsd,
      liquidity_usd: liquidityUsd,
      bonding_curve_pct: bondingCurvePct,
      top5_holder_pct: riskDetails?.top5Holdings,
      top10_holder_pct: riskDetails?.top10Holdings,
      similar_holdings_count: riskDetails?.similarSizedCount,
      creator_wallet: token.creator,
      creator_integrity_score: devIntegrityScore,
      buys_count: buysCount,
      sells_count: sellsCount,
      buy_sell_ratio: buySellRatio,
      passed_filters: passedFilters,
      failed_filters: failedFilters,
      score_breakdown: scoreBreakdown,
      acceptance_reasoning: decision === 'accepted' ? {
        reasons: acceptanceReasoning || [],
        summary: `Token passed ${passedFilters.length} filters with volume ${volumeSol.toFixed(3)} SOL, ${txCount} txs, bundle score ${bundleScore || 'N/A'}`,
      } : null,
      config_snapshot: {
        min_volume_sol_5m: config.min_volume_sol_5m,
        min_transactions: config.min_transactions,
        max_token_age_minutes: config.max_token_age_minutes,
        max_bundle_score: config.max_bundle_score,
      },
      metadata: {
        image: token.token?.image,
        description: token.token?.description,
        pool: pool,
        riskDetails,
      },
      // NEW: Enhanced scoring fields
      is_mayhem_mode: isMayhemMode || false,
      social_score: socialScore,
      twitter_score: twitterScore,
      website_score: websiteScore,
      telegram_score: telegramScore,
      social_details: socialDetails,
      dex_paid_early: dexPaidEarly || false,
      dex_paid_details: dexPaidDetails,
      price_tier: priceTier,
      wallet_quality_score: walletQualityScore,
      first_buyers_analysis: firstBuyersAnalysis,
    });
  } catch (error) {
    console.error('Failed to log discovery:', error);
  }
}

// Fetch latest tokens from Solana Tracker API
async function fetchLatestPumpfunTokens(limit = 50): Promise<TokenData[]> {
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  try {
    // Fetch more tokens to have better filtering
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

// Simple bundle analysis using only holder data from token list response
async function analyzeTokenRisk(mint: string): Promise<{ bundleScore: number; isBundled: boolean; walletQualityScore: number; details: any }> {
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

    if (response.status === 429) {
      console.warn(`⏳ Rate limited on holders for ${mint.slice(0, 8)}`);
      return { bundleScore: 40, isBundled: false, walletQualityScore: 50, details: { error: 'Rate limited' } };
    }

    if (!response.ok) {
      return { bundleScore: 40, isBundled: false, walletQualityScore: 50, details: { error: `HTTP ${response.status}` } };
    }

    const holders = await response.json();
    
    if (!Array.isArray(holders) || holders.length === 0) {
      return { bundleScore: 30, isBundled: false, walletQualityScore: 30, details: { holderCount: 0 } };
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

    // Wallet Quality Score (0-100): Higher = better (less suspicious)
    let walletQualityScore = 100;
    
    // Penalize for concentrated holdings
    if (top5Holdings > 60) walletQualityScore -= 30;
    else if (top5Holdings > 40) walletQualityScore -= 15;
    
    // Penalize for similar sized holdings (wash trading indicator)
    walletQualityScore -= similarSizedCount * 10;
    
    // Low holder count is suspicious
    if (holders.length < 10) walletQualityScore -= 20;
    else if (holders.length < 25) walletQualityScore -= 10;
    
    walletQualityScore = Math.max(0, Math.min(100, walletQualityScore));

    return {
      bundleScore: Math.min(100, bundleScore),
      isBundled: bundleScore >= 50,
      walletQualityScore,
      details: {
        holderCount: holders.length,
        top5Holdings,
        top10Holdings,
        similarSizedCount,
      },
    };
  } catch (error) {
    console.error(`Error analyzing risk for ${mint}:`, error);
    return { bundleScore: 50, isBundled: false, walletQualityScore: 50, details: { error: String(error) } };
  }
}

// Check if developer is known scammer
async function checkDeveloperReputation(supabase: any, creatorWallet: string): Promise<{ isScam: boolean; integrityScore?: number }> {
  try {
    const { data } = await supabase
      .from('developer_profiles')
      .select('integrity_score, total_tokens_created, successful_tokens')
      .eq('master_wallet_address', creatorWallet)
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

// Main polling function - ENHANCED with new quality checks
async function pollForNewTokens(supabase: any, config: MonitorConfig) {
  console.log('📡 Starting pump.fun new token poll (ENHANCED)...');

  // Get recent candidates to avoid re-processing
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentCandidates } = await supabase
    .from('pumpfun_buy_candidates')
    .select('token_mint')
    .gte('detected_at', oneHourAgo);

  const existingMints = new Set((recentCandidates || []).map((c: any) => c.token_mint));

  // Fetch latest tokens
  const tokens = await fetchLatestPumpfunTokens(50);
  console.log(`📊 Fetched ${tokens.length} tokens from Solana Tracker`);

  if (tokens.length === 0) {
    console.log('❌ No tokens fetched - API may be down');
    return {
      tokensScanned: 0,
      skippedExisting: 0,
      skippedLowVolume: 0,
      skippedOld: 0,
      skippedHighRisk: 0,
      skippedMayhemMode: 0,
      skippedEarlyDexPaid: 0,
      candidatesAdded: 0,
      scalpApproved: 0,
      errors: 0,
    };
  }

  const results = {
    tokensScanned: tokens.length,
    skippedExisting: 0,
    skippedLowVolume: 0,
    skippedOld: 0,
    skippedHighRisk: 0,
    skippedMayhemMode: 0,
    skippedEarlyDexPaid: 0,
    candidatesAdded: 0,
    scalpApproved: 0,
    errors: 0,
  };

  const solPrice = await getSolPrice(supabase);
  const promisingTokens: Array<{ 
    token: TokenData; 
    volumeSol: number; 
    volumeUsd: number; 
    txCount: number; 
    passedFilters: string[];
    ageMinutes: number | null;
    priceTier: string | null;
  }> = [];

  // PHASE 1: Quick filter using data we already have (NO extra API calls)
  console.log('🔍 Phase 1: Quick filtering...');
  for (const tokenData of tokens) {
    try {
      const mint = tokenData.token?.mint;
      if (!mint) continue;

      const pool = tokenData.pools?.[0];
      const volumeUsd = pool?.volume?.h24 || 0;
      const volumeSol = solPrice > 0 ? volumeUsd / solPrice : 0;
      const txCount = (tokenData.buys || 0) + (tokenData.sells || 0) + (pool?.txns?.h24 || 0);
      const priceUsd = pool?.price?.usd;
      const priceTier = determinePriceTier(priceUsd);
      const passedFilters: string[] = [];
      const failedFilters: string[] = [];
      
      // Calculate age
      const createdAt = tokenData.events?.createdAt;
      const ageMinutes = createdAt ? (Date.now() - createdAt * 1000) / 60000 : null;

      // Skip if already processed
      if (existingMints.has(mint)) {
        results.skippedExisting++;
        failedFilters.push('existing_candidate');
        await logDiscovery(supabase, {
          token: tokenData, decision: 'rejected', rejectionReason: 'existing',
          volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
          priceTier,
        });
        continue;
      }
      passedFilters.push('not_existing');

      // Check token age
      if (createdAt) {
        if (ageMinutes && ageMinutes > config.max_token_age_minutes) {
          results.skippedOld++;
          failedFilters.push(`age_too_old_${ageMinutes.toFixed(0)}m`);
          console.log(`⏰ ${tokenData.token?.symbol || mint.slice(0, 8)}: Too old (${ageMinutes.toFixed(0)} min)`);
          await logDiscovery(supabase, {
            token: tokenData, decision: 'rejected', rejectionReason: 'too_old',
            volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
            priceTier,
          });
          continue;
        }
        passedFilters.push(`age_ok_${ageMinutes?.toFixed(0)}m`);
      } else {
        passedFilters.push('age_unknown');
      }

      // Volume filter
      if (volumeSol < config.min_volume_sol_5m) {
        results.skippedLowVolume++;
        failedFilters.push(`volume_${volumeSol.toFixed(3)}_SOL_below_${config.min_volume_sol_5m}`);
        console.log(`📉 ${tokenData.token?.symbol || mint.slice(0, 8)}: Low volume (${volumeSol.toFixed(3)} SOL)`);
        await logDiscovery(supabase, {
          token: tokenData, decision: 'rejected', rejectionReason: 'low_volume',
          volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
          priceTier,
        });
        continue;
      }
      passedFilters.push(`volume_${volumeSol.toFixed(2)}_SOL`);

      // Transaction filter
      if (txCount < config.min_transactions) {
        results.skippedLowVolume++;
        failedFilters.push(`txs_${txCount}_below_${config.min_transactions}`);
        console.log(`📉 ${tokenData.token?.symbol || mint.slice(0, 8)}: Low txs (${txCount})`);
        await logDiscovery(supabase, {
          token: tokenData, decision: 'rejected', rejectionReason: 'low_transactions',
          volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
          priceTier,
        });
        continue;
      }
      passedFilters.push(`txs_${txCount}`);

      // This token passed quick filters - add to promising list
      console.log(`✅ ${tokenData.token?.symbol || mint.slice(0, 8)}: Passed quick filters (Vol: ${volumeSol.toFixed(2)} SOL, Txs: ${txCount})`);
      promisingTokens.push({ token: tokenData, volumeSol, volumeUsd, txCount, passedFilters, ageMinutes, priceTier });
    } catch (error) {
      console.error('Error in quick filter:', error);
      results.errors++;
    }
  }

  console.log(`🎯 Phase 1 complete: ${promisingTokens.length} promising tokens from ${tokens.length} scanned`);

  // PHASE 2: Deep analysis only for promising tokens (with API calls)
  if (promisingTokens.length > 0) {
    console.log('🔬 Phase 2: Deep analysis with enhanced checks...');
    
    for (const { token: tokenData, volumeSol, volumeUsd, txCount, passedFilters, ageMinutes, priceTier } of promisingTokens) {
      const mint = tokenData.token?.mint!;
      const failedFilters: string[] = [];
      let devIntegrityScore: number | undefined;
      
      try {
        // Small delay between API calls
        await new Promise(r => setTimeout(r, 300));

        // ============================================================
        // CRITICAL CHECK #1: MAYHEM MODE (HARD REJECT - NO EXCEPTIONS)
        // ============================================================
        const mayhemCheck = await checkMayhemMode(mint);
        
        if (mayhemCheck.isMayhemMode) {
          results.skippedMayhemMode++;
          failedFilters.push('MAYHEM_MODE_DETECTED');
          console.log(`☠️ ${tokenData.token?.symbol || mint.slice(0, 8)}: MAYHEM MODE - HARD REJECT`);
          await logDiscovery(supabase, {
            token: tokenData, decision: 'rejected', rejectionReason: 'mayhem_mode',
            volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
            isMayhemMode: true,
            priceTier,
          });
          continue;
        }
        passedFilters.push('not_mayhem_mode');

        // ============================================================
        // CHECK #2: EARLY DEX PAID STATUS (Red Flag for young tokens)
        // ============================================================
        const dexPaidCheck = await checkEarlyDexPaid(mint, ageMinutes || 0);
        
        if (dexPaidCheck.isEarlyPaidSuspicious) {
          results.skippedEarlyDexPaid++;
          failedFilters.push('EARLY_DEX_PAID_SUSPICIOUS');
          console.log(`🚨 ${tokenData.token?.symbol || mint.slice(0, 8)}: Early DEX paid - suspicious`);
          await logDiscovery(supabase, {
            token: tokenData, decision: 'rejected', rejectionReason: 'early_dex_paid_suspicious',
            volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
            dexPaidEarly: true,
            dexPaidDetails: dexPaidCheck,
            priceTier,
          });
          continue;
        }
        if (dexPaidCheck.hasPaidProfile || dexPaidCheck.hasBoosts) {
          passedFilters.push(`dex_paid_ok_age_${ageMinutes?.toFixed(0)}m`);
        } else {
          passedFilters.push('no_dex_paid');
        }

        // Small delay
        await new Promise(r => setTimeout(r, 200));

        // ============================================================
        // CHECK #3: SOCIAL QUALITY SCORING
        // ============================================================
        const socialQuality = await analyzeSocialQuality(mint);
        passedFilters.push(`social_score_${socialQuality.totalScore}`);

        // Small delay
        await new Promise(r => setTimeout(r, 200));

        // ============================================================
        // CHECK #4: BUNDLE/RISK ANALYSIS (with wallet quality)
        // ============================================================
        const riskAnalysis = await analyzeTokenRisk(mint);
        
        if (riskAnalysis.bundleScore > config.max_bundle_score) {
          results.skippedHighRisk++;
          failedFilters.push(`bundle_score_${riskAnalysis.bundleScore}_above_${config.max_bundle_score}`);
          console.log(`⚠️ ${tokenData.token?.symbol || mint.slice(0, 8)}: High bundle score (${riskAnalysis.bundleScore})`);
          await logDiscovery(supabase, {
            token: tokenData, decision: 'rejected', rejectionReason: 'high_bundle_score',
            volumeSol, volumeUsd, txCount, bundleScore: riskAnalysis.bundleScore,
            riskDetails: riskAnalysis.details, config, passedFilters, failedFilters,
            socialScore: socialQuality.totalScore,
            twitterScore: socialQuality.twitterScore,
            websiteScore: socialQuality.websiteScore,
            telegramScore: socialQuality.telegramScore,
            socialDetails: socialQuality.details,
            dexPaidEarly: false,
            dexPaidDetails: dexPaidCheck,
            priceTier,
            walletQualityScore: riskAnalysis.walletQualityScore,
          });
          continue;
        }
        passedFilters.push(`bundle_score_${riskAnalysis.bundleScore}`);
        passedFilters.push(`wallet_quality_${riskAnalysis.walletQualityScore}`);

        // ============================================================
        // CHECK #5: DEVELOPER REPUTATION
        // ============================================================
        const creatorWallet = tokenData.creator;
        if (creatorWallet) {
          const devCheck = await checkDeveloperReputation(supabase, creatorWallet);
          devIntegrityScore = devCheck.integrityScore;
          if (devCheck.isScam) {
            results.skippedHighRisk++;
            failedFilters.push(`scam_dev_integrity_${devCheck.integrityScore}`);
            console.log(`⚠️ ${tokenData.token?.symbol || mint.slice(0, 8)}: Scam dev flagged`);
            await logDiscovery(supabase, {
              token: tokenData, decision: 'rejected', rejectionReason: 'scam_developer',
              volumeSol, volumeUsd, txCount, bundleScore: riskAnalysis.bundleScore,
              riskDetails: riskAnalysis.details, devIntegrityScore, config, passedFilters, failedFilters,
              socialScore: socialQuality.totalScore,
              twitterScore: socialQuality.twitterScore,
              websiteScore: socialQuality.websiteScore,
              telegramScore: socialQuality.telegramScore,
              socialDetails: socialQuality.details,
              dexPaidEarly: false,
              dexPaidDetails: dexPaidCheck,
              priceTier,
              walletQualityScore: riskAnalysis.walletQualityScore,
            });
            continue;
          }
          if (devIntegrityScore !== undefined) {
            passedFilters.push(`dev_integrity_${devIntegrityScore}`);
          } else {
            passedFilters.push('dev_unknown');
          }
        }

        // Calculate bonding curve percentage if available
        const pool = tokenData.pools?.[0];
        const marketCapUsd = pool?.price?.usd ? pool.price.usd * 1_000_000_000 : null;
        const bondingCurvePct = marketCapUsd ? Math.min(100, (marketCapUsd / 69000) * 100) : null;

        // Build acceptance reasoning
        const acceptanceReasoning = [
          `Volume: ${volumeSol.toFixed(3)} SOL (min: ${config.min_volume_sol_5m})`,
          `Transactions: ${txCount} (min: ${config.min_transactions})`,
          `Bundle Score: ${riskAnalysis.bundleScore} (max: ${config.max_bundle_score})`,
          `Wallet Quality: ${riskAnalysis.walletQualityScore}/100`,
          `Social Score: ${socialQuality.totalScore}/100`,
          `Holders: ${tokenData.holders || riskAnalysis.details.holderCount || 'unknown'}`,
          `Top5 Holdings: ${riskAnalysis.details.top5Holdings?.toFixed(1) || 'N/A'}%`,
          `Top10 Holdings: ${riskAnalysis.details.top10Holdings?.toFixed(1) || 'N/A'}%`,
          `Buy/Sell Ratio: ${tokenData.buys || 0}/${tokenData.sells || 0}`,
          `Price Tier: ${priceTier || 'unknown'}`,
          bondingCurvePct ? `Bonding Curve: ${bondingCurvePct.toFixed(1)}%` : null,
          marketCapUsd ? `Market Cap: $${marketCapUsd.toFixed(0)}` : null,
          devIntegrityScore !== undefined ? `Dev Integrity: ${devIntegrityScore}` : 'Dev: Unknown',
        ].filter(Boolean) as string[];

        // Insert as candidate
        const candidateData = {
          token_mint: mint,
          token_name: tokenData.token?.name,
          token_symbol: tokenData.token?.symbol,
          creator_wallet: creatorWallet,
          volume_sol_5m: volumeSol,
          volume_usd_5m: volumeUsd,
          bonding_curve_pct: bondingCurvePct,
          market_cap_usd: marketCapUsd,
          holder_count: tokenData.holders || riskAnalysis.details.holderCount || 0,
          transaction_count: txCount,
          bundle_score: riskAnalysis.bundleScore,
          is_bundled: riskAnalysis.isBundled,
          status: 'pending',
          auto_buy_enabled: config.auto_scalp_enabled,
          metadata: {
            image: tokenData.token?.image,
            description: tokenData.token?.description,
            riskDetails: riskAnalysis.details,
            pool: pool,
            socialQuality: socialQuality,
            dexPaidCheck: dexPaidCheck,
            priceTier: priceTier,
          },
        };

        const { error: insertError } = await supabase
          .from('pumpfun_buy_candidates')
          .insert(candidateData);

        if (insertError) {
          if (insertError.code === '23505') {
            results.skippedExisting++;
            failedFilters.push('duplicate_insert');
            await logDiscovery(supabase, {
              token: tokenData, decision: 'rejected', rejectionReason: 'duplicate',
              volumeSol, volumeUsd, txCount, bundleScore: riskAnalysis.bundleScore,
              riskDetails: riskAnalysis.details, config, passedFilters, failedFilters,
              socialScore: socialQuality.totalScore,
              twitterScore: socialQuality.twitterScore,
              websiteScore: socialQuality.websiteScore,
              telegramScore: socialQuality.telegramScore,
              socialDetails: socialQuality.details,
              dexPaidEarly: false,
              dexPaidDetails: dexPaidCheck,
              priceTier,
              walletQualityScore: riskAnalysis.walletQualityScore,
            });
          } else {
            console.error(`Error inserting candidate:`, insertError);
            results.errors++;
            failedFilters.push(`insert_error_${insertError.code}`);
            await logDiscovery(supabase, {
              token: tokenData, decision: 'error', rejectionReason: 'insert_failed',
              volumeSol, volumeUsd, txCount, bundleScore: riskAnalysis.bundleScore,
              riskDetails: riskAnalysis.details, config, passedFilters, failedFilters,
              socialScore: socialQuality.totalScore,
              priceTier,
              walletQualityScore: riskAnalysis.walletQualityScore,
            });
          }
          continue;
        }

        // 🎉 TOKEN ACCEPTED - Log with full reasoning
        passedFilters.push('inserted_as_candidate');
        results.candidatesAdded++;
        console.log(`🚀 Added candidate: ${candidateData.token_symbol} (${mint.slice(0, 8)}...) - Social: ${socialQuality.totalScore}, Wallet: ${riskAnalysis.walletQualityScore}`);
        await logDiscovery(supabase, {
          token: tokenData, decision: 'accepted',
          volumeSol, volumeUsd, txCount, bundleScore: riskAnalysis.bundleScore,
          riskDetails: riskAnalysis.details, devIntegrityScore, config, passedFilters, failedFilters,
          acceptanceReasoning,
          socialScore: socialQuality.totalScore,
          twitterScore: socialQuality.twitterScore,
          websiteScore: socialQuality.websiteScore,
          telegramScore: socialQuality.telegramScore,
          socialDetails: socialQuality.details,
          dexPaidEarly: false,
          dexPaidDetails: dexPaidCheck,
          priceTier,
          walletQualityScore: riskAnalysis.walletQualityScore,
        });

        // Auto-scalp integration if enabled
        if (config.auto_scalp_enabled) {
          try {
            const scalpResult = await runScalpValidation(supabase, mint, candidateData, config.scalp_test_mode);
            
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
              console.log(`🎯 Scalp approved: ${candidateData.token_symbol}`);
            }
          } catch (scalpError) {
            console.error('Scalp validation error:', scalpError);
          }
        }
      } catch (error) {
        console.error('Error processing token:', error);
        results.errors++;
        failedFilters.push(`processing_error`);
        await logDiscovery(supabase, {
          token: tokenData, decision: 'error', rejectionReason: 'processing_failed',
          volumeSol, volumeUsd, txCount, config, passedFilters, failedFilters,
          priceTier,
        });
      }
    }
  }

  // Update monitor stats
  const { data: currentConfig } = await supabase
    .from('pumpfun_monitor_config')
    .select('id, tokens_processed_count, candidates_found_count')
    .limit(1)
    .single();

  if (currentConfig) {
    await supabase
      .from('pumpfun_monitor_config')
      .update({
        last_poll_at: new Date().toISOString(),
        tokens_processed_count: (currentConfig.tokens_processed_count || 0) + results.tokensScanned,
        candidates_found_count: (currentConfig.candidates_found_count || 0) + results.candidatesAdded,
      })
      .eq('id', currentConfig.id);
  }

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
    
    return data?.price_usd || 200;
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

// Get discovery logs
async function getDiscoveryLogs(supabase: any, limit = 100) {
  const { data, error } = await supabase
    .from('pumpfun_discovery_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
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
      min_volume_sol_5m: 0.1,
      min_transactions: 5,
      max_token_age_minutes: 30,
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

      case 'discovery_logs': {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const logs = await getDiscoveryLogs(supabase, limit);
        return jsonResponse({ success: true, logs });
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
