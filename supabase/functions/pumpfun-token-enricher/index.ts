import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { heliusFetch, canMakeHeliusCall } from "../_shared/helius-rate-limiter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;

// Standard pump.fun supply: 1 billion tokens with 6 decimals
const STANDARD_PUMPFUN_SUPPLY = 1_000_000_000_000_000;
const SUPPLY_TOLERANCE = 0.01; // 1% tolerance

// Bump bot detection thresholds
const BUMP_BOT_CONFIG = {
  micro_tx_threshold_sol: 0.01, // Transactions below this are considered micro
  micro_tx_ratio_warning: 0.4, // 40% micro-tx = warning
  micro_tx_ratio_reject: 0.6, // 60% micro-tx = soft reject
  min_txs_for_detection: 10, // Need at least 10 txs to detect
};

// Stagnation detection thresholds
const STAGNATION_CONFIG = {
  max_age_mins_for_low_mcap: 15, // Token > 15 mins old with low metrics = stagnant
  min_mcap_usd: 5000, // $5K minimum mcap to not be considered stagnant
  min_bonding_pct: 3, // 3% minimum bonding curve progress
  max_age_for_pruning_mins: 30, // Tokens > 30 mins old with no progress = prune
};

interface WatchlistToken {
  id: string;
  token_mint: string;
  token_symbol: string;
  status: string;
  holder_count: number | null;
  bundle_score: number | null;
  bonding_curve_pct: number | null;
  market_cap_sol: number | null;
  has_image: boolean | null;
  socials_count: number | null;
  image_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  website_url: string | null;
  // Caching fields
  mint_authority_revoked: boolean | null;
  freeze_authority_revoked: boolean | null;
  authority_checked_at: string | null;
  bundled_buy_count: number | null;
  bundle_checked_at: string | null;
}

interface AuthorityCheck {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  supplyValid: boolean;
  totalSupply: number;
  details: string;
}

interface RugCheckRisk {
  name: string;
  value: string;
  description: string;
  score: number;
  level: 'danger' | 'warn' | 'info' | 'good';
}

interface RugCheckResult {
  score: number;
  normalised: number;
  risks: RugCheckRisk[];
  passed: boolean;
  hasCriticalRisk: boolean;
  criticalRiskNames: string[];
  error?: string;
}

interface HolderAnalysis {
  bundleScore: number;
  holderCount: number;
  top5Percent: number;
  maxSingleWalletPct: number;
  giniCoefficient: number;
  linkedWalletCount: number;
  bundledBuyCount: number;
  freshWalletPct: number;
  suspiciousWalletPct: number;
  insiderActivityDetected: boolean;
  details: any;
}

// Calculate Gini coefficient for wealth distribution (0 = perfect equality, 1 = total inequality)
function calculateGiniCoefficient(holdings: number[]): number {
  if (!holdings || holdings.length === 0) return 0;
  
  const sorted = [...holdings].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((sum, val) => sum + val, 0);
  
  if (total === 0) return 0;
  
  let cumulativeSum = 0;
  let giniSum = 0;
  
  for (let i = 0; i < n; i++) {
    cumulativeSum += sorted[i];
    giniSum += (2 * (i + 1) - n - 1) * sorted[i];
  }
  
  return giniSum / (n * total);
}

// Detect linked wallets via funding pattern analysis
function detectLinkedWallets(holders: any[]): { linkedCount: number; clusters: string[][] } {
  const clusters: string[][] = [];
  
  // Group wallets by similar balance amounts (within 5% tolerance)
  const balanceGroups: Map<string, string[]> = new Map();
  
  for (const holder of holders) {
    const balance = holder.amount || 0;
    if (balance === 0) continue;
    
    // Round to nearest 5% bucket
    const bucketKey = Math.round(balance / (balance * 0.05)) * (balance * 0.05);
    const key = bucketKey.toFixed(0);
    
    if (!balanceGroups.has(key)) {
      balanceGroups.set(key, []);
    }
    balanceGroups.get(key)!.push(holder.address || holder.owner);
  }
  
  // Clusters with 3+ wallets with identical-ish balances are suspicious
  let linkedCount = 0;
  for (const [, wallets] of balanceGroups) {
    if (wallets.length >= 3) {
      clusters.push(wallets);
      linkedCount += wallets.length;
    }
  }
  
  return { linkedCount, clusters };
}

// Detect bundled buys (multiple buys in same block/slot)
// OPTIMIZED: Uses cache from database to reduce Helius API calls
async function detectBundledBuys(
  mint: string, 
  existingBundleCount?: number,
  bundleCheckedAt?: string | null
): Promise<{ bundledCount: number; details: any; fromCache: boolean }> {
  // Check if we have a recent cache (within 1 hour)
  if (bundleCheckedAt && existingBundleCount !== undefined) {
    const cacheAge = Date.now() - new Date(bundleCheckedAt).getTime();
    const ONE_HOUR = 60 * 60 * 1000;
    
    if (cacheAge < ONE_HOUR) {
      console.log(`   📦 Bundle check cached (${Math.round(cacheAge / 60000)}m ago): ${existingBundleCount} bundled buys`);
      return { bundledCount: existingBundleCount, details: { cached: true }, fromCache: true };
    }
  }
  
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusKey) {
    return { bundledCount: existingBundleCount || 0, details: { error: 'No Helius key' }, fromCache: false };
  }
  
  // Check rate limit before making call
  const canCall = await canMakeHeliusCall();
  if (!canCall) {
    console.log(`   ⏳ Helius rate limited, using cached bundle count: ${existingBundleCount || 0}`);
    return { bundledCount: existingBundleCount || 0, details: { rateLimited: true }, fromCache: true };
  }
  
  try {
    // Fetch recent transactions for the token using rate-limited wrapper
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${heliusKey}&limit=50`;
    const response = await heliusFetch(url, { method: 'GET' }, {
      functionName: 'pumpfun-token-enricher',
      endpoint: 'transactions',
      method: 'getTransactions',
      requestParams: { mint, limit: 50 }
    });
    
    if (!response) {
      // Rate limited by wrapper
      return { bundledCount: existingBundleCount || 0, details: { rateLimited: true }, fromCache: true };
    }
    
    if (!response.ok) {
      // If rate limited, use cached value if available
      if (response.status === 429 && existingBundleCount !== undefined) {
        console.log(`   ⚠️ Helius rate limited, using cached bundle count: ${existingBundleCount}`);
        return { bundledCount: existingBundleCount, details: { rateLimited: true }, fromCache: true };
      }
      return { bundledCount: existingBundleCount || 0, details: { error: `API error: ${response.status}` }, fromCache: false };
    }
    
    const txs = await response.json();
    
    // Group transactions by slot (block)
    const slotGroups: Map<number, any[]> = new Map();
    
    for (const tx of txs) {
      const slot = tx.slot;
      if (!slotGroups.has(slot)) {
        slotGroups.set(slot, []);
      }
      slotGroups.get(slot)!.push(tx);
    }
    
    // Count slots with multiple buys (likely bundled)
    let bundledCount = 0;
    const bundledSlots: number[] = [];
    
    for (const [slot, txGroup] of slotGroups) {
      // Multiple transactions in same slot from different signers = bundled
      const uniqueSigners = new Set(txGroup.map((t: any) => t.feePayer));
      if (txGroup.length >= 2 && uniqueSigners.size >= 2) {
        bundledCount++;
        bundledSlots.push(slot);
      }
    }
    
    return { 
      bundledCount, 
      details: { 
        totalTxs: txs.length, 
        slotsAnalyzed: slotGroups.size,
        bundledSlots 
      },
      fromCache: false
    };
  } catch (error) {
    console.error(`Error detecting bundled buys for ${mint}:`, error);
    return { bundledCount: existingBundleCount || 0, details: { error: String(error) }, fromCache: false };
  }
}

// Detect bump bot activity (micro-transactions used to simulate activity)
async function detectBumpBotActivity(
  mint: string
): Promise<{ detected: boolean; microTxCount: number; microTxRatio: number; details: any }> {
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusKey) {
    return { detected: false, microTxCount: 0, microTxRatio: 0, details: { error: 'No Helius key' } };
  }
  
  // Check rate limit before making call
  const canCall = await canMakeHeliusCall();
  if (!canCall) {
    console.log(`   ⏳ Helius rate limited, skipping bump bot detection`);
    return { detected: false, microTxCount: 0, microTxRatio: 0, details: { rateLimited: true } };
  }
  
  try {
    // Fetch recent transactions using rate-limited wrapper
    const url = `https://api.helius.xyz/v0/addresses/${mint}/transactions?api-key=${heliusKey}&limit=50`;
    const response = await heliusFetch(url, { method: 'GET' }, {
      functionName: 'pumpfun-token-enricher',
      endpoint: 'transactions',
      method: 'getTransactions-bumpbot',
      requestParams: { mint, limit: 50, purpose: 'bump_bot_detection' }
    });
    
    if (!response) {
      return { detected: false, microTxCount: 0, microTxRatio: 0, details: { rateLimited: true } };
    }
    
    if (!response.ok) {
      console.log(`   ⚠️ Helius API error for bump bot detection: ${response.status}`);
      return { detected: false, microTxCount: 0, microTxRatio: 0, details: { error: `API error: ${response.status}` } };
    }
    
    const txs = await response.json();
    
    if (!Array.isArray(txs) || txs.length < BUMP_BOT_CONFIG.min_txs_for_detection) {
      return { detected: false, microTxCount: 0, microTxRatio: 0, details: { reason: 'Not enough txs for detection', txCount: txs?.length || 0 } };
    }
    
    // Count micro-transactions (tiny SOL amounts)
    let microTxCount = 0;
    let totalSwapTxs = 0;
    
    for (const tx of txs) {
      // Look for swap-like transactions
      const nativeTransfers = tx.nativeTransfers || [];
      const tokenTransfers = tx.tokenTransfers || [];
      
      // If this looks like a token swap/buy/sell
      if (tokenTransfers.length > 0) {
        totalSwapTxs++;
        
        // Check SOL amount - sum of native transfers
        const totalSolMoved = nativeTransfers.reduce((sum: number, t: any) => {
          return sum + Math.abs(t.amount || 0);
        }, 0) / 1e9; // Convert lamports to SOL
        
        // Micro-transaction if SOL moved is very small
        if (totalSolMoved < BUMP_BOT_CONFIG.micro_tx_threshold_sol && totalSolMoved > 0) {
          microTxCount++;
        }
      }
    }
    
    const microTxRatio = totalSwapTxs > 0 ? microTxCount / totalSwapTxs : 0;
    const detected = microTxRatio >= BUMP_BOT_CONFIG.micro_tx_ratio_warning;
    
    console.log(`   🤖 Bump Bot Check: ${microTxCount}/${totalSwapTxs} micro-txs (${(microTxRatio * 100).toFixed(1)}%) - ${detected ? '⚠️ DETECTED' : 'Clean'}`);
    
    return {
      detected,
      microTxCount,
      microTxRatio,
      details: {
        totalTxsAnalyzed: txs.length,
        totalSwapTxs,
        microTxThreshold: BUMP_BOT_CONFIG.micro_tx_threshold_sol,
      }
    };
  } catch (error) {
    console.error(`Error detecting bump bot for ${mint}:`, error);
    return { detected: false, microTxCount: 0, microTxRatio: 0, details: { error: String(error) } };
  }
}

// Analyze fresh wallets using HEURISTICS ONLY (no Helius calls)
// OPTIMIZED: Removed Helius API calls, uses balance patterns instead
function analyzeFreshWallets(holders: any[]): { freshPct: number; suspiciousPct: number } {
  // Sample up to 20 wallets for heuristic analysis
  const sample = holders.slice(0, 20);
  let freshCount = 0;
  let suspiciousCount = 0;
  
  for (const holder of sample) {
    const balance = holder.amount || 0;
    const pctOwned = holder.pct || 0;
    const address = holder.address || holder.owner || '';
    
    // HEURISTIC 1: Very precise round-number holdings are suspicious
    // Fresh wallets often buy exact amounts like 1,000,000 or 10,000,000
    if (balance > 0) {
      const isRoundNumber = balance % 1000000 === 0;
      const isVeryRound = balance % 10000000 === 0;
      
      if (isVeryRound) {
        suspiciousCount++;
        freshCount++;
      } else if (isRoundNumber && pctOwned > 1) {
        freshCount++;
      }
    }
    
    // HEURISTIC 2: Small percentage holders with very specific amounts
    // Bots often hold identical or near-identical amounts
    if (pctOwned > 0 && pctOwned < 0.5) {
      // Check for suspiciously precise percentages (like exactly 0.1%)
      const pctString = pctOwned.toFixed(4);
      if (pctString.endsWith('0000') || pctString.endsWith('1000') || pctString.endsWith('5000')) {
        freshCount++;
      }
    }
    
    // HEURISTIC 3: Large holders (>2%) are often insiders/bundled
    if (pctOwned > 2 && pctOwned < 10) {
      // Multiple large holders = suspicious distribution
      suspiciousCount++;
    }
  }
  
  const freshPct = sample.length > 0 ? (freshCount / sample.length) * 100 : 0;
  const suspiciousPct = sample.length > 0 ? (suspiciousCount / sample.length) * 100 : 0;
  
  return { freshPct, suspiciousPct };
}

// Analyze token risk (bundle detection + holder concentration + Phase 4 metrics)
// OPTIMIZED: Accepts existing values for caching
async function analyzeTokenRisk(
  mint: string,
  existingBundleCount?: number,
  bundleCheckedAt?: string | null
): Promise<HolderAnalysis & { bundleFromCache: boolean }> {
  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}/holders`);
    if (!response.ok) {
      return { 
        bundleScore: 0, holderCount: 0, top5Percent: 0, maxSingleWalletPct: 0,
        giniCoefficient: 0, linkedWalletCount: 0, bundledBuyCount: 0,
        freshWalletPct: 0, suspiciousWalletPct: 0, insiderActivityDetected: false,
        details: { error: 'Failed to fetch holders' },
        bundleFromCache: false
      };
    }
    
    const data = await response.json();
    const holders = Array.isArray(data) ? data : (data.holders || []);
    
    if (!Array.isArray(holders) || holders.length === 0) {
      return { 
        bundleScore: 0, holderCount: 0, top5Percent: 0, maxSingleWalletPct: 0,
        giniCoefficient: 0, linkedWalletCount: 0, bundledBuyCount: 0,
        freshWalletPct: 0, suspiciousWalletPct: 0, insiderActivityDetected: false,
        details: { holderCount: 0 },
        bundleFromCache: false
      };
    }
    
    // Calculate supply concentration
    const holdings = holders.map((h: any) => h.amount || 0);
    const totalSupply = holdings.reduce((sum, amt) => sum + amt, 0);
    const top5Holdings = holders.slice(0, 5).reduce((sum: number, h: any) => sum + (h.amount || 0), 0);
    const top5Percent = totalSupply > 0 ? (top5Holdings / totalSupply) * 100 : 0;
    
    // Calculate max single wallet percentage
    const maxHolding = holdings.length > 0 ? Math.max(...holdings) : 0;
    const maxSingleWalletPct = totalSupply > 0 ? (maxHolding / totalSupply) * 100 : 0;
    
    // PHASE 4: Gini coefficient
    const giniCoefficient = calculateGiniCoefficient(holdings);
    
    // PHASE 4: Linked wallet detection
    const linkedAnalysis = detectLinkedWallets(holders);
    
    // PHASE 4: Fresh wallet analysis (now uses heuristics only, no Helius)
    const walletAnalysis = analyzeFreshWallets(holders);
    
    // PHASE 4: Bundled buy detection with CACHING
    const bundledAnalysis = await detectBundledBuys(mint, existingBundleCount, bundleCheckedAt);
    
    // High concentration = higher bundle score
    let bundleScore = 0;
    if (top5Percent > 80) bundleScore = 90;
    else if (top5Percent > 60) bundleScore = 70;
    else if (top5Percent > 40) bundleScore = 50;
    else if (top5Percent > 20) bundleScore = 30;
    else bundleScore = 10;
    
    // Boost bundle score if suspicious patterns detected
    if (giniCoefficient > 0.8) bundleScore = Math.min(100, bundleScore + 15);
    if (linkedAnalysis.linkedCount > 5) bundleScore = Math.min(100, bundleScore + 10);
    if (bundledAnalysis.bundledCount > 2) bundleScore = Math.min(100, bundleScore + 10);
    
    // Insider activity detection
    const insiderActivityDetected = 
      giniCoefficient > 0.85 || 
      linkedAnalysis.linkedCount > 5 || 
      bundledAnalysis.bundledCount > 3 ||
      walletAnalysis.suspiciousPct > 30;
    
    return {
      bundleScore,
      holderCount: holders.length,
      top5Percent,
      maxSingleWalletPct,
      giniCoefficient,
      linkedWalletCount: linkedAnalysis.linkedCount,
      bundledBuyCount: bundledAnalysis.bundledCount,
      freshWalletPct: walletAnalysis.freshPct,
      suspiciousWalletPct: walletAnalysis.suspiciousPct,
      insiderActivityDetected,
      bundleFromCache: bundledAnalysis.fromCache,
      details: {
        holderCount: holders.length,
        top5Percent: top5Percent.toFixed(2),
        maxSingleWalletPct: maxSingleWalletPct.toFixed(2),
        giniCoefficient: giniCoefficient.toFixed(3),
        linkedWallets: linkedAnalysis,
        bundledBuys: bundledAnalysis.details,
        freshWalletPct: walletAnalysis.freshPct.toFixed(1),
        suspiciousWalletPct: walletAnalysis.suspiciousPct.toFixed(1),
      }
    };
  } catch (error) {
    console.error(`Error analyzing risk for ${mint}:`, error);
    return { 
      bundleScore: 0, holderCount: 0, top5Percent: 0, maxSingleWalletPct: 0,
      giniCoefficient: 0, linkedWalletCount: 0, bundledBuyCount: 0,
      freshWalletPct: 0, suspiciousWalletPct: 0, insiderActivityDetected: false,
      details: { error: String(error) },
      bundleFromCache: false
    };
  }
}

// Fetch token data from Solana Tracker
async function fetchTokenData(mint: string): Promise<any> {
  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching token data for ${mint}:`, error);
    return null;
  }
}

// Check mint and freeze authority status via Helius RPC
// OPTIMIZED: Uses caching to reduce RPC calls
async function checkTokenAuthorities(
  mint: string,
  existingCheck?: { mintRevoked?: boolean; freezeRevoked?: boolean; authorityCheckedAt?: string | null }
): Promise<AuthorityCheck & { fromCache: boolean }> {
  // Check if we have a recent cache (within 1 hour)
  // Authority status rarely changes after token creation
  if (existingCheck?.authorityCheckedAt && 
      existingCheck.mintRevoked !== undefined && 
      existingCheck.freezeRevoked !== undefined) {
    const cacheAge = Date.now() - new Date(existingCheck.authorityCheckedAt).getTime();
    const ONE_HOUR = 60 * 60 * 1000;
    
    if (cacheAge < ONE_HOUR) {
      console.log(`   🔐 Authority check cached (${Math.round(cacheAge / 60000)}m ago): mint=${existingCheck.mintRevoked ? 'revoked' : 'active'}, freeze=${existingCheck.freezeRevoked ? 'revoked' : 'active'}`);
      return {
        mintAuthorityRevoked: existingCheck.mintRevoked,
        freezeAuthorityRevoked: existingCheck.freezeRevoked,
        supplyValid: true, // Assume valid from cache
        totalSupply: 0,
        details: 'Cached check',
        fromCache: true
      };
    }
  }
  
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  const rpcUrl = heliusKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
    : 'https://api.mainnet-beta.solana.com';
  
  try {
    // Get token mint account info
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [
          mint,
          { encoding: 'jsonParsed' }
        ]
      })
    });
    
    if (!response.ok) {
      console.error(`RPC error for ${mint}: ${response.status}`);
      // Use cached values if available
      if (existingCheck?.mintRevoked !== undefined) {
        return {
          mintAuthorityRevoked: existingCheck.mintRevoked,
          freezeAuthorityRevoked: existingCheck.freezeRevoked ?? true,
          supplyValid: true,
          totalSupply: 0,
          details: 'RPC error - using cached values',
          fromCache: true
        };
      }
      return {
        mintAuthorityRevoked: true, // Assume safe if can't check
        freezeAuthorityRevoked: true,
        supplyValid: true,
        totalSupply: 0,
        details: 'RPC error - assuming safe',
        fromCache: false
      };
    }
    
    const data = await response.json();
    
    if (data.error || !data.result?.value) {
      console.error(`No account data for ${mint}:`, data.error);
      return {
        mintAuthorityRevoked: true,
        freezeAuthorityRevoked: true,
        supplyValid: true,
        totalSupply: 0,
        details: 'No account data - assuming safe',
        fromCache: false
      };
    }
    
    const parsed = data.result.value.data.parsed;
    if (!parsed || parsed.type !== 'mint') {
      return {
        mintAuthorityRevoked: true,
        freezeAuthorityRevoked: true,
        supplyValid: true,
        totalSupply: 0,
        details: 'Not a mint account',
        fromCache: false
      };
    }
    
    const info = parsed.info;
    const mintAuthority = info.mintAuthority;
    const freezeAuthority = info.freezeAuthority;
    const supply = parseInt(info.supply || '0');
    
    // Check if authorities are revoked (null = revoked)
    const mintAuthorityRevoked = mintAuthority === null;
    const freezeAuthorityRevoked = freezeAuthority === null;
    
    // Check if supply matches expected pump.fun supply (with tolerance)
    const supplyDiff = Math.abs(supply - STANDARD_PUMPFUN_SUPPLY) / STANDARD_PUMPFUN_SUPPLY;
    const supplyValid = supplyDiff <= SUPPLY_TOLERANCE;
    
    const details = [
      `mint:${mintAuthorityRevoked ? 'revoked' : mintAuthority?.slice(0,8)}`,
      `freeze:${freezeAuthorityRevoked ? 'revoked' : freezeAuthority?.slice(0,8)}`,
      `supply:${(supply / 1e6).toFixed(0)}M${supplyValid ? '' : ' (INVALID)'}`
    ].join(', ');
    
    console.log(`   🔐 Authority check: ${details}`);
    
    return {
      mintAuthorityRevoked,
      freezeAuthorityRevoked,
      supplyValid,
      totalSupply: supply,
      details,
      fromCache: false
    };
  } catch (error) {
    console.error(`Error checking authorities for ${mint}:`, error);
    return {
      mintAuthorityRevoked: true, // Assume safe if can't check
      freezeAuthorityRevoked: true,
      supplyValid: true,
      totalSupply: 0,
      details: `Error: ${String(error)}`,
      fromCache: false
    };
  }
}

// Fetch token data from pump.fun API for price/volume
async function fetchPumpFunData(mint: string): Promise<any> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching pump.fun data for ${mint}:`, error);
    return null;
  }
}

// Fetch RugCheck analysis for a token
async function fetchRugCheck(mint: string, config: any): Promise<RugCheckResult> {
  const defaultResult: RugCheckResult = {
    score: 0,
    normalised: 0,
    risks: [],
    passed: false,
    hasCriticalRisk: false,
    criticalRiskNames: [],
  };

  try {
    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, config.rugcheck_rate_limit_ms || 500));
    
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.log(`   ⚠️ RugCheck API error: ${response.status}`);
      // Fail open - don't reject if API is down
      return { ...defaultResult, passed: true, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    
    // Extract score (RugCheck score: 0-1000, higher = safer)
    const rawScore = data.score || 0;
    const normalised = Math.min(100, Math.max(0, rawScore / 10)); // Convert to 0-100
    
    // Extract risks
    const risks: RugCheckRisk[] = (data.risks || []).map((r: any) => ({
      name: r.name || 'Unknown',
      value: r.value || '',
      description: r.description || '',
      score: r.score || 0,
      level: r.level || 'info',
    }));
    
    // Check for critical risks
    const criticalRiskList: string[] = config.rugcheck_critical_risks || [
      'Freeze Authority still enabled',
      'Mint Authority still enabled',
      'Low Liquidity',
      'Copycat token',
      'Top 10 holders own high percentage',
      'Single holder owns high percentage',
    ];
    
    const dangerRisks = risks.filter(r => r.level === 'danger');
    const criticalRiskNames = dangerRisks
      .filter(r => criticalRiskList.some(cr => r.name.toLowerCase().includes(cr.toLowerCase())))
      .map(r => r.name);
    
    const hasCriticalRisk = criticalRiskNames.length > 0;
    const minScore = config.min_rugcheck_score || 50;
    const passed = normalised >= minScore && !hasCriticalRisk;
    
    console.log(`   🔍 RugCheck: score=${normalised.toFixed(1)}, risks=${risks.length}, critical=${hasCriticalRisk ? criticalRiskNames.join(', ') : 'none'}, passed=${passed}`);
    
    return {
      score: rawScore,
      normalised,
      risks,
      passed,
      hasCriticalRisk,
      criticalRiskNames,
    };
  } catch (error) {
    console.error(`   ⚠️ RugCheck error for ${mint}:`, error);
    // Fail open - don't reject if API call fails
    return { ...defaultResult, passed: true, error: String(error) };
  }
}

// Get config from database
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .limit(1)
    .maybeSingle();
    
  return {
    is_enabled: data?.is_enabled ?? true,
    max_bundle_score: data?.max_bundle_score ?? 70,
    min_holder_count: data?.min_holder_count ?? 10,
    max_token_age_minutes: data?.max_token_age_minutes ?? 60,
    bonding_curve_min: data?.bonding_curve_min ?? 5,
    bonding_curve_max: data?.bonding_curve_max ?? 95,
    require_image: data?.require_image ?? false,
    min_socials_count: data?.min_socials_count ?? 0,
    max_single_wallet_pct: data?.max_single_wallet_pct ?? 15,
    // Phase 4 thresholds
    max_gini_coefficient: data?.max_gini_coefficient ?? 0.85,
    max_linked_wallet_count: data?.max_linked_wallet_count ?? 5,
    max_bundled_buy_count: data?.max_bundled_buy_count ?? 3,
    max_fresh_wallet_pct: data?.max_fresh_wallet_pct ?? 50,
    max_suspicious_wallet_pct: data?.max_suspicious_wallet_pct ?? 30,
    // RugCheck thresholds
    min_rugcheck_score: data?.min_rugcheck_score ?? 50,
    rugcheck_critical_risks: data?.rugcheck_critical_risks ?? [
      'Freeze Authority still enabled',
      'Mint Authority still enabled',
      'Low Liquidity',
      'Copycat token',
      'Top 10 holders own high percentage',
      'Single holder owns high percentage',
    ],
    rugcheck_recheck_minutes: data?.rugcheck_recheck_minutes ?? 30,
    rugcheck_rate_limit_ms: data?.rugcheck_rate_limit_ms ?? 500,
  };
}

// Check if image URL is valid (not null, not placeholder)
function isValidImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl || imageUrl.trim() === '') return false;
  if (imageUrl.includes('placeholder')) return false;
  return true;
}

// Process a batch of pending tokens
async function enrichTokenBatch(
  supabase: any,
  tokens: WatchlistToken[],
  config: any
): Promise<{ enriched: number; promoted: number; rejected: number; softRejected: number }> {
  let enriched = 0;
  let promoted = 0;
  let rejected = 0;
  let softRejected = 0;
  
  for (const token of tokens) {
    console.log(`\n📊 Enriching: ${token.token_symbol} (${token.token_mint.slice(0, 8)}...)`);
    
    // Fetch current token data from both APIs + authority check (with caching)
    const [tokenData, pumpData, authorityCheck] = await Promise.all([
      fetchTokenData(token.token_mint),
      fetchPumpFunData(token.token_mint),
      checkTokenAuthorities(token.token_mint, {
        mintRevoked: token.mint_authority_revoked ?? undefined,
        freezeRevoked: token.freeze_authority_revoked ?? undefined,
        authorityCheckedAt: token.authority_checked_at
      })
    ]);
    
    // Extract price/volume from pump.fun API
    const priceUsd = pumpData?.usd_market_cap && pumpData?.total_supply 
      ? pumpData.usd_market_cap / (pumpData.total_supply / 1e6) 
      : null;
    const volumeSol = pumpData?.volume_24h || 0;
    const marketCapUsd = pumpData?.usd_market_cap || null;
    // Use actual sol_price from pump API response - if not available, skip liquidity calc
    const liquidityUsd = (pumpData?.virtual_sol_reserves && pumpData?.sol_price)
      ? (pumpData.virtual_sol_reserves / 1e9) * pumpData.sol_price 
      : null;
    
    console.log(`   Price: $${priceUsd?.toFixed(8) || 'N/A'}, Volume: ${volumeSol} SOL, MCap: $${marketCapUsd || 'N/A'}`);
    
    // Check token age if we have blockchain creation time
    const createdAt = tokenData?.events?.createdAt || (pumpData?.created_timestamp ? pumpData.created_timestamp / 1000 : null);
    if (createdAt) {
      const ageMinutes = (Date.now() - createdAt * 1000) / 60000;
      if (ageMinutes > config.max_token_age_minutes) {
        console.log(`   ⏭️ Token too old: ${ageMinutes.toFixed(0)}m (max: ${config.max_token_age_minutes}m)`);
        
        await supabase
          .from('pumpfun_watchlist')
          .update({
            status: 'rejected',
            rejection_reason: 'token_too_old',
            rejection_type: 'permanent',
            rejection_reasons: ['token_too_old'],
            removed_at: new Date().toISOString(),
            price_usd: priceUsd,
            volume_sol: volumeSol,
            market_cap_usd: marketCapUsd,
            liquidity_usd: liquidityUsd,
            last_checked_at: new Date().toISOString(),
          })
          .eq('id', token.id);
          
        rejected++;
        continue;
      }
    }
    
    // Analyze bundle risk and holder concentration (with caching for bundled buys)
    const holderAnalysis = await analyzeTokenRisk(
      token.token_mint,
      token.bundled_buy_count ?? undefined,
      token.bundle_checked_at
    );
    
    // BUMP BOT DETECTION - Detect micro-transaction heartbeat activity
    const bumpBotResult = await detectBumpBotActivity(token.token_mint);
    
    // RUGCHECK ANALYSIS - Stage 1 integration
    const rugCheckResult = await fetchRugCheck(token.token_mint, config);
    
    // Extract data
    const holderCount = tokenData?.holders || holderAnalysis.holderCount || token.holder_count || 0;
    const marketCapSol = tokenData?.pools?.[0]?.marketCap?.quote || token.market_cap_sol || 0;
    const bondingCurve = pumpData?.bonding_curve_progress 
      ? pumpData.bonding_curve_progress * 100 
      : (tokenData?.pools?.[0]?.curvePercentage || token.bonding_curve_pct || 0);
    
    // STAGNATION CHECK - Token is old with poor metrics
    const tokenAgeMinutes = createdAt ? (Date.now() - createdAt * 1000) / 60000 : 0;
    const isStagnant = tokenAgeMinutes > STAGNATION_CONFIG.max_age_mins_for_low_mcap && 
      (marketCapUsd || 0) < STAGNATION_CONFIG.min_mcap_usd && 
      bondingCurve < STAGNATION_CONFIG.min_bonding_pct;
    const shouldPruneStale = tokenAgeMinutes > STAGNATION_CONFIG.max_age_for_pruning_mins && 
      (marketCapUsd || 0) < STAGNATION_CONFIG.min_mcap_usd && 
      bondingCurve < STAGNATION_CONFIG.min_bonding_pct;
    
    if (isStagnant) {
      console.log(`   ⏸️ Stagnation detected: ${tokenAgeMinutes.toFixed(0)}m old, mcap $${(marketCapUsd || 0).toFixed(0)}, bonding ${bondingCurve.toFixed(1)}%`);
    }
    
    // Check image and socials (use existing if we have them, otherwise fetch)
    const hasImage = token.has_image ?? isValidImage(token.image_url);
    const socialsCount = token.socials_count ?? [token.twitter_url, token.telegram_url, token.website_url]
      .filter(s => s && s.trim() !== '').length;
    
    // Build rejection reasons array
    const rejectionReasons: string[] = [];
    let isPermanentReject = false;
    
    // RUGCHECK CRITICAL RISK CHECK - PERMANENT
    if (rugCheckResult.hasCriticalRisk) {
      rejectionReasons.push(`rugcheck_critical:${rugCheckResult.criticalRiskNames.join(',')}`);
      isPermanentReject = true;
    }
    
    // RUGCHECK SCORE CHECK - SOFT (only if no critical risks and score is low)
    if (!rugCheckResult.hasCriticalRisk && !rugCheckResult.passed && !rugCheckResult.error) {
      rejectionReasons.push(`rugcheck_score:${rugCheckResult.normalised.toFixed(0)}<${config.min_rugcheck_score}`);
    }
    
    // MINT AUTHORITY CHECK - PERMANENT
    if (!authorityCheck.mintAuthorityRevoked) {
      rejectionReasons.push('mint_authority_not_revoked');
      isPermanentReject = true;
    }
    
    // FREEZE AUTHORITY CHECK - PERMANENT
    if (!authorityCheck.freezeAuthorityRevoked) {
      rejectionReasons.push('freeze_authority_not_revoked');
      isPermanentReject = true;
    }
    
    // SUPPLY CHECK - PERMANENT
    if (!authorityCheck.supplyValid) {
      rejectionReasons.push('non_standard_supply');
      isPermanentReject = true;
    }
    
    // BUNDLE SCORE CHECK - SOFT
    if (holderAnalysis.bundleScore > config.max_bundle_score) {
      rejectionReasons.push(`bundle:${holderAnalysis.bundleScore}>${config.max_bundle_score}`);
    }
    
    // MAX SINGLE WALLET CHECK - SOFT
    if (holderAnalysis.maxSingleWalletPct > config.max_single_wallet_pct) {
      rejectionReasons.push(`single_wallet:${holderAnalysis.maxSingleWalletPct.toFixed(1)}%>${config.max_single_wallet_pct}%`);
    }
    
    // PHASE 4: GINI COEFFICIENT CHECK - SOFT
    if (holderAnalysis.giniCoefficient > config.max_gini_coefficient) {
      rejectionReasons.push(`gini:${holderAnalysis.giniCoefficient.toFixed(2)}>${config.max_gini_coefficient}`);
    }
    
    // PHASE 4: LINKED WALLETS CHECK - SOFT
    if (holderAnalysis.linkedWalletCount > config.max_linked_wallet_count) {
      rejectionReasons.push(`linked_wallets:${holderAnalysis.linkedWalletCount}>${config.max_linked_wallet_count}`);
    }
    
    // PHASE 4: BUNDLED BUYS CHECK - SOFT
    if (holderAnalysis.bundledBuyCount > config.max_bundled_buy_count) {
      rejectionReasons.push(`bundled_buys:${holderAnalysis.bundledBuyCount}>${config.max_bundled_buy_count}`);
    }
    
    // PHASE 4: FRESH WALLET CHECK - SOFT
    if (holderAnalysis.freshWalletPct > config.max_fresh_wallet_pct) {
      rejectionReasons.push(`fresh_wallets:${holderAnalysis.freshWalletPct.toFixed(0)}%>${config.max_fresh_wallet_pct}%`);
    }
    
    // PHASE 4: SUSPICIOUS WALLET CHECK - SOFT (can be permanent if extreme)
    if (holderAnalysis.suspiciousWalletPct > config.max_suspicious_wallet_pct) {
      rejectionReasons.push(`suspicious_wallets:${holderAnalysis.suspiciousWalletPct.toFixed(0)}%>${config.max_suspicious_wallet_pct}%`);
      if (holderAnalysis.suspiciousWalletPct > 60) {
        isPermanentReject = true; // Extreme suspicious activity = permanent
      }
    }
    
    // PHASE 4: INSIDER ACTIVITY CHECK - SOFT (aggregated signal)
    if (holderAnalysis.insiderActivityDetected) {
      rejectionReasons.push('insider_activity_detected');
    }
    
    // BUMP BOT CHECK - SOFT (artificial activity detection)
    if (bumpBotResult.detected) {
      rejectionReasons.push(`bump_bot_detected:${(bumpBotResult.microTxRatio * 100).toFixed(0)}%_micro_txs`);
      // High ratio is stronger penalty
      if (bumpBotResult.microTxRatio >= BUMP_BOT_CONFIG.micro_tx_ratio_reject) {
        rejectionReasons.push('high_bump_bot_ratio');
      }
    }
    
    // STAGNATION CHECK - SOFT (token is old with no progress)
    if (shouldPruneStale) {
      rejectionReasons.push(`stagnant:${tokenAgeMinutes.toFixed(0)}m_old_mcap_$${(marketCapUsd || 0).toFixed(0)}`);
    }
    
    // IMAGE CHECK - SOFT (only if required)
    if (config.require_image && !hasImage) {
      rejectionReasons.push('no_image');
    }
    
    // SOCIALS CHECK - SOFT (only if required)
    if (socialsCount < config.min_socials_count) {
      rejectionReasons.push(`low_socials:${socialsCount}<${config.min_socials_count}`);
    }
    
    // Decision log - track all criteria
    const giniPass = holderAnalysis.giniCoefficient <= config.max_gini_coefficient;
    const linkedPass = holderAnalysis.linkedWalletCount <= config.max_linked_wallet_count;
    const bundledPass = holderAnalysis.bundledBuyCount <= config.max_bundled_buy_count;
    const freshPass = holderAnalysis.freshWalletPct <= config.max_fresh_wallet_pct;
    const suspiciousPass = holderAnalysis.suspiciousWalletPct <= config.max_suspicious_wallet_pct;
    
    console.log(`   📋 DECISION CRITERIA:`);
    console.log(`      Mint Authority Revoked: ${authorityCheck.mintAuthorityRevoked} ${authorityCheck.mintAuthorityRevoked ? '✅' : '⛔'}`);
    console.log(`      Freeze Authority Revoked: ${authorityCheck.freezeAuthorityRevoked} ${authorityCheck.freezeAuthorityRevoked ? '✅' : '⛔'}`);
    console.log(`      Supply Valid: ${authorityCheck.supplyValid} ${authorityCheck.supplyValid ? '✅' : '⛔'}`);
    console.log(`      Bundle Score: ${holderAnalysis.bundleScore} (max: ${config.max_bundle_score}) ${holderAnalysis.bundleScore <= config.max_bundle_score ? '✅' : '❌'}`);
    console.log(`      Max Single Wallet: ${holderAnalysis.maxSingleWalletPct.toFixed(1)}% (max: ${config.max_single_wallet_pct}%) ${holderAnalysis.maxSingleWalletPct <= config.max_single_wallet_pct ? '✅' : '❌'}`);
    console.log(`      Gini Coefficient: ${holderAnalysis.giniCoefficient.toFixed(3)} (max: ${config.max_gini_coefficient}) ${giniPass ? '✅' : '❌'}`);
    console.log(`      Linked Wallets: ${holderAnalysis.linkedWalletCount} (max: ${config.max_linked_wallet_count}) ${linkedPass ? '✅' : '❌'}`);
    console.log(`      Bundled Buys: ${holderAnalysis.bundledBuyCount} (max: ${config.max_bundled_buy_count}) ${bundledPass ? '✅' : '❌'}`);
    console.log(`      Fresh Wallet %: ${holderAnalysis.freshWalletPct.toFixed(1)}% (max: ${config.max_fresh_wallet_pct}%) ${freshPass ? '✅' : '❌'}`);
    console.log(`      Suspicious Wallet %: ${holderAnalysis.suspiciousWalletPct.toFixed(1)}% (max: ${config.max_suspicious_wallet_pct}%) ${suspiciousPass ? '✅' : '❌'}`);
    console.log(`      Insider Activity: ${holderAnalysis.insiderActivityDetected ? '🚨 YES' : 'No'}`);
    console.log(`      Bump Bot: ${bumpBotResult.detected ? '🤖 DETECTED' : 'Clean'} (${bumpBotResult.microTxCount} micro-txs, ${(bumpBotResult.microTxRatio * 100).toFixed(0)}%)`);
    console.log(`      Stagnant: ${isStagnant ? '⏸️ YES' : 'No'} (age: ${tokenAgeMinutes.toFixed(0)}m)`);
    console.log(`      Holders: ${holderCount} (min for qual: ${config.min_holder_count})`);
    console.log(`      Bonding Curve: ${bondingCurve.toFixed(1)}% (range: ${config.bonding_curve_min}-${config.bonding_curve_max}%)`);
    console.log(`      Has Image: ${hasImage} (required: ${config.require_image})`);
    console.log(`      Socials: ${socialsCount} (min: ${config.min_socials_count})`);
    console.log(`      RugCheck Score: ${rugCheckResult.normalised.toFixed(1)} (min: ${config.min_rugcheck_score}) ${rugCheckResult.passed ? '✅' : '❌'}${rugCheckResult.hasCriticalRisk ? ' ⛔ CRITICAL' : ''}`);
    console.log(`      Price: $${priceUsd?.toFixed(8) || 'N/A'}, Volume: ${volumeSol} SOL, MCap: $${marketCapUsd || 'N/A'}`);
    
    const shouldReject = rejectionReasons.length > 0;
    const rejectionType = isPermanentReject ? 'permanent' : 'soft';
    
    if (shouldReject) {
      console.log(`   ❌ REJECTED (${rejectionType}): ${rejectionReasons.join(', ')}`);
      await supabase
        .from('pumpfun_watchlist')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReasons.join(', '),
          rejection_type: rejectionType,
          rejection_reasons: rejectionReasons,
          bundle_score: holderAnalysis.bundleScore,
          holder_count: holderCount,
          market_cap_sol: marketCapSol,
          bonding_curve_pct: bondingCurve,
          price_usd: priceUsd,
          price_ath_usd: priceUsd,
          volume_sol: volumeSol,
          market_cap_usd: marketCapUsd,
          liquidity_usd: liquidityUsd,
          max_single_wallet_pct: holderAnalysis.maxSingleWalletPct,
          has_image: hasImage,
          socials_count: socialsCount,
          mint_authority_revoked: authorityCheck.mintAuthorityRevoked,
          freeze_authority_revoked: authorityCheck.freezeAuthorityRevoked,
          // Phase 4 metrics
          gini_coefficient: holderAnalysis.giniCoefficient,
          linked_wallet_count: holderAnalysis.linkedWalletCount,
          bundled_buy_count: holderAnalysis.bundledBuyCount,
          fresh_wallet_pct: holderAnalysis.freshWalletPct,
          suspicious_wallet_pct: holderAnalysis.suspiciousWalletPct,
          insider_activity_detected: holderAnalysis.insiderActivityDetected,
          // RugCheck metrics
          rugcheck_score: rugCheckResult.score,
          rugcheck_normalised: rugCheckResult.normalised,
          rugcheck_risks: rugCheckResult.risks,
          rugcheck_passed: rugCheckResult.passed,
          rugcheck_checked_at: new Date().toISOString(),
          // Bump bot metrics
          micro_tx_count: bumpBotResult.microTxCount,
          micro_tx_ratio: bumpBotResult.microTxRatio,
          bump_bot_detected: bumpBotResult.detected,
          // Stagnation tracking
          is_stagnant: isStagnant,
          stagnant_reason: isStagnant ? `age:${tokenAgeMinutes.toFixed(0)}m,mcap:$${(marketCapUsd || 0).toFixed(0)},bonding:${bondingCurve.toFixed(1)}%` : null,
          last_activity_at: new Date().toISOString(),
          // Caching timestamps for Helius optimization
          authority_checked_at: authorityCheck.fromCache ? undefined : new Date().toISOString(),
          bundle_checked_at: holderAnalysis.bundleFromCache ? undefined : new Date().toISOString(),
          removed_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', token.id);
        
      if (isPermanentReject) {
        rejected++;
      } else {
        softRejected++;
      }
    } else {
      // Promote to watching with reason (include Phase 4 metrics + RugCheck)
      const promotionReason = `bundle:${holderAnalysis.bundleScore}/${config.max_bundle_score}, gini:${holderAnalysis.giniCoefficient.toFixed(2)}, linked:${holderAnalysis.linkedWalletCount}, bundled:${holderAnalysis.bundledBuyCount}, holders:${holderCount}, maxWallet:${holderAnalysis.maxSingleWalletPct.toFixed(1)}%, rugcheck:${rugCheckResult.normalised.toFixed(0)}`;
      console.log(`   ✅ PROMOTED to watching: ${promotionReason}`);
      
      await supabase
        .from('pumpfun_watchlist')
        .update({
          status: 'watching',
          bundle_score: holderAnalysis.bundleScore,
          holder_count: holderCount,
          market_cap_sol: marketCapSol,
          bonding_curve_pct: bondingCurve,
          price_usd: priceUsd,
          price_start_usd: priceUsd,
          price_ath_usd: priceUsd,
          volume_sol: volumeSol,
          market_cap_usd: marketCapUsd,
          liquidity_usd: liquidityUsd,
          max_single_wallet_pct: holderAnalysis.maxSingleWalletPct,
          has_image: hasImage,
          socials_count: socialsCount,
          mint_authority_revoked: authorityCheck.mintAuthorityRevoked,
          freeze_authority_revoked: authorityCheck.freezeAuthorityRevoked,
          // Phase 4 metrics
          gini_coefficient: holderAnalysis.giniCoefficient,
          linked_wallet_count: holderAnalysis.linkedWalletCount,
          bundled_buy_count: holderAnalysis.bundledBuyCount,
          fresh_wallet_pct: holderAnalysis.freshWalletPct,
          suspicious_wallet_pct: holderAnalysis.suspiciousWalletPct,
          insider_activity_detected: holderAnalysis.insiderActivityDetected,
          // RugCheck metrics
          rugcheck_score: rugCheckResult.score,
          rugcheck_normalised: rugCheckResult.normalised,
          rugcheck_risks: rugCheckResult.risks,
          rugcheck_passed: rugCheckResult.passed,
          rugcheck_checked_at: new Date().toISOString(),
          // Bump bot metrics
          micro_tx_count: bumpBotResult.microTxCount,
          micro_tx_ratio: bumpBotResult.microTxRatio,
          bump_bot_detected: bumpBotResult.detected,
          // Stagnation tracking
          is_stagnant: false, // Not stagnant if promoted
          last_activity_at: new Date().toISOString(),
          // Caching timestamps for Helius optimization
          authority_checked_at: authorityCheck.fromCache ? undefined : new Date().toISOString(),
          bundle_checked_at: holderAnalysis.bundleFromCache ? undefined : new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          created_at_blockchain: createdAt ? new Date(createdAt * 1000).toISOString() : null,
          qualification_reason: promotionReason,
        })
        .eq('id', token.id);
        
      promoted++;
    }
    
    enriched++;
    
    // Small delay between tokens
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return { enriched, promoted, rejected, softRejected };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'enrich';

    if (action === 'enrich') {
      console.log('🔄 Starting token enrichment...');
      
      const config = await getConfig(supabase);
      console.log('Config:', config);

      if (!config.is_enabled) {
        return new Response(JSON.stringify({
          success: true,
          paused: true,
          message: 'Pump.fun monitor is paused (is_enabled=false)',
          stats: { enriched: 0, promoted: 0, rejected: 0, softRejected: 0 }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Get pending_triage tokens
      const { data: pendingTokens, error } = await supabase
        .from('pumpfun_watchlist')
        .select('id, token_mint, token_symbol, status, holder_count, bundle_score, bonding_curve_pct, market_cap_sol, has_image, socials_count, image_url, twitter_url, telegram_url, website_url')
        .eq('status', 'pending_triage')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);
        
      if (error) {
        throw new Error(`Failed to fetch pending tokens: ${error.message}`);
      }
      
      if (!pendingTokens || pendingTokens.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No pending tokens to enrich',
          stats: { enriched: 0, promoted: 0, rejected: 0, softRejected: 0 }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.log(`Found ${pendingTokens.length} pending tokens`);
      
      const stats = await enrichTokenBatch(supabase, pendingTokens, config);
      
      console.log('\n📊 Enrichment Summary:');
      console.log(`   Enriched: ${stats.enriched}`);
      console.log(`   Promoted: ${stats.promoted}`);
      console.log(`   Rejected (permanent): ${stats.rejected}`);
      console.log(`   Rejected (soft): ${stats.softRejected}`);
      
      return new Response(JSON.stringify({
        success: true,
        stats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'status') {
      // Get counts by status
      const { data: statusCounts } = await supabase
        .from('pumpfun_watchlist')
        .select('status, rejection_type')
        .in('status', ['pending_triage', 'watching', 'rejected', 'qualified', 'dead']);
        
      const counts = {
        pending_triage: 0,
        watching: 0,
        rejected: 0,
        rejected_soft: 0,
        rejected_permanent: 0,
        qualified: 0,
        dead: 0,
      };
      
      statusCounts?.forEach((row: any) => {
        if (row.status in counts) {
          counts[row.status as keyof typeof counts]++;
        }
        if (row.status === 'rejected') {
          if (row.rejection_type === 'soft') counts.rejected_soft++;
          else if (row.rejection_type === 'permanent') counts.rejected_permanent++;
        }
      });
      
      return new Response(JSON.stringify({
        success: true,
        counts
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Unknown action',
      validActions: ['enrich', 'status']
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
