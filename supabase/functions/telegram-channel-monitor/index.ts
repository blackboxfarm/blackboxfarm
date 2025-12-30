import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana address regex - matches base58 addresses 32-44 chars
const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

// ============================================================================
// TYPES
// ============================================================================

interface TradingKeyword {
  id: string;
  keyword: string;
  category: string;
  weight: number;
  is_active: boolean;
}

interface TradingRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  required_keywords: string[];
  excluded_keywords: string[];
  min_keyword_weight: number | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  bonding_curve_position: string | null;
  min_bonding_pct: number | null;
  max_bonding_pct: number | null;
  require_on_curve: boolean | null;
  require_graduated: boolean | null;
  min_age_minutes: number | null;
  max_age_minutes: number | null;
  min_market_cap_usd: number | null;
  max_market_cap_usd: number | null;
  platforms: string[];
  price_change_5m_min: number | null;
  price_change_5m_max: number | null;
  buy_amount_usd: number;
  sell_target_multiplier: number;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean;
  fallback_to_fantasy: boolean;
}

interface TradingTier {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  requires_ape_keyword: boolean;
  min_price_usd: number | null;
  max_price_usd: number | null;
  min_market_cap_usd: number | null;
  max_market_cap_usd: number | null;
  buy_amount_usd: number;
  sell_target_multiplier: number;
  stop_loss_pct: number | null;
  stop_loss_enabled: boolean;
  icon: string | null;
}

interface KeywordMatchResult {
  matchedKeywords: string[];
  totalWeight: number;
  categories: Record<string, number>;
  hasBearishSignal: boolean;
  hasHighConviction: boolean;
}

interface EnrichedTokenData {
  symbol: string | null;
  name: string | null;
  price: number | null;
  marketCap: number | null;
  ageMinutes: number | null;
  platform: string | null;
  isOnBondingCurve: boolean;
  bondingCurvePercent: number | null;
  bondingCurvePosition: 'early' | 'mid' | 'late' | 'graduated' | null;
  hasGraduated: boolean;
  priceChange5m: number | null;
  isMayhemMode: boolean;
}

interface RuleEvaluationResult {
  matchedRule: TradingRule | null;
  decision: 'buy' | 'fantasy_buy' | 'skip' | 'no_action';
  buyAmount: number;
  sellTarget: number;
  stopLoss: number | null;
  stopLossEnabled: boolean;
  reasoning: string;
  ruleId: string | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractSolanaAddresses(text: string): string[] {
  const matches = text.match(SOLANA_ADDRESS_REGEX) || [];
  return matches.filter(addr => {
    if (addr.length < 32 || addr.length > 44) return false;
    const hasUpper = /[A-HJ-NP-Z]/.test(addr);
    const hasLower = /[a-km-z]/.test(addr);
    const hasNumber = /[1-9]/.test(addr);
    return hasUpper && hasLower && hasNumber;
  });
}

// Check if message contains "ape" keyword (case insensitive) - legacy simple mode
function containsApeKeyword(text: string): boolean {
  const apePattern = /\bape\b/i;
  return apePattern.test(text);
}

// ============================================================================
// KEYWORD DETECTION ENGINE (Advanced Mode)
// ============================================================================

async function detectKeywords(
  text: string,
  supabase: any
): Promise<KeywordMatchResult> {
  const { data: keywords, error } = await supabase
    .from('trading_keywords')
    .select('*')
    .eq('is_active', true);

  if (error || !keywords) {
    console.error('[telegram-channel-monitor] Error fetching keywords:', error);
    return {
      matchedKeywords: [],
      totalWeight: 0,
      categories: {},
      hasBearishSignal: false,
      hasHighConviction: false
    };
  }

  const lowerText = text.toLowerCase();
  const matchedKeywords: string[] = [];
  const categories: Record<string, number> = {};
  let totalWeight = 0;
  let hasBearishSignal = false;
  let hasHighConviction = false;

  for (const kw of keywords as TradingKeyword[]) {
    // Check if keyword exists in text (word boundary aware)
    const regex = new RegExp(`\\b${kw.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lowerText)) {
      matchedKeywords.push(kw.keyword);
      totalWeight += kw.weight;
      categories[kw.category] = (categories[kw.category] || 0) + kw.weight;
      
      if (kw.category === 'bearish') {
        hasBearishSignal = true;
      }
      if (kw.category === 'high_conviction') {
        hasHighConviction = true;
      }
    }
  }

  console.log(`[telegram-channel-monitor] Keywords detected: ${matchedKeywords.join(', ')} (weight: ${totalWeight.toFixed(2)})`);

  return {
    matchedKeywords,
    totalWeight,
    categories,
    hasBearishSignal,
    hasHighConviction
  };
}

// ============================================================================
// TOKEN ENRICHMENT
// ============================================================================

async function fetchWithRetry(url: string, maxRetries = 3, delayMs = 500): Promise<Response | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      console.warn(`[telegram-channel-monitor] Fetch attempt ${attempt}/${maxRetries} failed: ${response.status}`);
    } catch (error: any) {
      const isDNS = error?.message?.includes('dns') || error?.message?.includes('lookup');
      console.warn(`[telegram-channel-monitor] Fetch attempt ${attempt}/${maxRetries} error${isDNS ? ' (DNS)' : ''}: ${error?.message?.slice(0, 100)}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * attempt)); // Exponential backoff
      }
    }
  }
  return null;
}

async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  // Try Jupiter first with retry
  const jupResponse = await fetchWithRetry(`https://api.jup.ag/price/v2?ids=${tokenMint}`);
  if (jupResponse) {
    try {
      const data = await jupResponse.json();
      if (data.data?.[tokenMint]?.price) {
        return parseFloat(data.data[tokenMint].price);
      }
    } catch {}
  }
  
  // Fallback to DexScreener with retry
  const dexResponse = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
  if (dexResponse) {
    try {
      const data = await dexResponse.json();
      if (data.pairs?.[0]?.priceUsd) {
        console.log(`[telegram-channel-monitor] Price from DexScreener fallback: ${data.pairs[0].priceUsd}`);
        return parseFloat(data.pairs[0].priceUsd);
      }
    } catch {}
  }
  
  console.error(`[telegram-channel-monitor] All price fetch attempts failed for ${tokenMint}`);
  return null;
}

async function fetchDexScreenerData(tokenMint: string): Promise<{
  price: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  priceChange5m: number | null;
  dexId: string | null;
}> {
  const response = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
  if (response) {
    try {
      const data = await response.json();
      if (data.pairs?.[0]) {
        const pair = data.pairs[0];
        return {
          price: parseFloat(pair.priceUsd) || null,
          marketCap: pair.marketCap || null,
          pairCreatedAt: pair.pairCreatedAt || null,
          priceChange5m: pair.priceChange?.m5 || null,
          dexId: pair.dexId || null
        };
      }
    } catch {}
  }
  return { price: null, marketCap: null, pairCreatedAt: null, priceChange5m: null, dexId: null };
}

async function fetchTokenMetadata(tokenMint: string): Promise<{ symbol: string; name: string } | null> {
  // Try Jupiter with retry
  const jupResponse = await fetchWithRetry(`https://tokens.jup.ag/token/${tokenMint}`, 2, 300);
  if (jupResponse) {
    try {
      const data = await jupResponse.json();
      if (data.symbol) {
        return { symbol: data.symbol, name: data.name || 'Unknown Token' };
      }
    } catch {}
  }
  
  // Fallback to DexScreener for metadata
  const dexResponse = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, 2, 300);
  if (dexResponse) {
    try {
      const data = await dexResponse.json();
      if (data.pairs?.[0]?.baseToken?.symbol) {
        console.log(`[telegram-channel-monitor] Metadata from DexScreener fallback: ${data.pairs[0].baseToken.symbol}`);
        return {
          symbol: data.pairs[0].baseToken.symbol,
          name: data.pairs[0].baseToken.name || 'Unknown Token'
        };
      }
    } catch {}
  }
  
  return null;
}

// Mayhem Mode Program ID - tokens launched with AI trading agent
const MAYHEM_MODE_PROGRAM_ID = 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e';
// Normal pump.fun supply is 1 billion (1e15 with 6 decimals), Mayhem is 2 billion
const NORMAL_PUMPFUN_SUPPLY = 1000000000000000;
const MAYHEM_PUMPFUN_SUPPLY = 2000000000000000;

async function checkPumpFunBondingCurve(tokenMint: string): Promise<{
  isOnCurve: boolean;
  bondingPercent: number | null;
  hasGraduated: boolean;
  isMayhemMode: boolean;
}> {
  try {
    // Check pump.fun API for bonding curve status
    const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
    if (!response.ok) {
      return { isOnCurve: false, bondingPercent: null, hasGraduated: false, isMayhemMode: false };
    }
    const data = await response.json();
    
    // Pump.fun uses virtual_sol_reserves and real_sol_reserves to calculate progress
    // Token graduates at ~85 SOL in bonding curve
    const virtualSolReserves = data.virtual_sol_reserves || 0;
    const realSolReserves = data.real_sol_reserves || 0;
    const complete = data.complete || false;
    const totalSupply = data.total_supply || 0;
    const program = data.program || null;
    
    // Detect Mayhem Mode:
    // 1. Check if program field matches Mayhem Mode program ID
    // 2. Check if total_supply is 2 billion (double the normal 1 billion)
    const isMayhemMode = program === MAYHEM_MODE_PROGRAM_ID || 
                         totalSupply >= MAYHEM_PUMPFUN_SUPPLY;
    
    if (isMayhemMode) {
      console.log(`[telegram-channel-monitor] MAYHEM MODE DETECTED for ${tokenMint} (supply: ${totalSupply}, program: ${program})`);
    }
    
    // Calculate bonding curve progress (roughly 0-100%)
    const bondingPercent = complete ? 100 : Math.min(100, (realSolReserves / 85) * 100);
    
    return {
      isOnCurve: !complete,
      bondingPercent: bondingPercent,
      hasGraduated: complete,
      isMayhemMode
    };
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error checking pump.fun bonding curve:`, error);
    return { isOnCurve: false, bondingPercent: null, hasGraduated: false, isMayhemMode: false };
  }
}

function determinePlatform(dexId: string | null): string {
  if (!dexId) return 'unknown';
  const lower = dexId.toLowerCase();
  if (lower.includes('pump') || lower === 'pumpfun') return 'pump.fun';
  if (lower.includes('raydium')) return 'raydium';
  if (lower.includes('orca')) return 'orca';
  if (lower.includes('moonshot')) return 'moonshot';
  return dexId;
}

function getBondingCurvePosition(percent: number | null): 'early' | 'mid' | 'late' | null {
  if (percent === null) return null;
  if (percent <= 25) return 'early';
  if (percent <= 75) return 'mid';
  return 'late';
}

async function enrichTokenData(tokenMint: string): Promise<EnrichedTokenData> {
  // Fetch all data in parallel
  const [jupiterPrice, dexData, metadata, bondingCurve] = await Promise.all([
    fetchTokenPrice(tokenMint),
    fetchDexScreenerData(tokenMint),
    fetchTokenMetadata(tokenMint),
    checkPumpFunBondingCurve(tokenMint)
  ]);

  const price = jupiterPrice ?? dexData.price;
  const platform = determinePlatform(dexData.dexId);
  const ageMinutes = dexData.pairCreatedAt 
    ? Math.floor((Date.now() - dexData.pairCreatedAt) / 60000)
    : null;

  const bondingPosition = bondingCurve.hasGraduated 
    ? 'graduated' as const
    : getBondingCurvePosition(bondingCurve.bondingPercent);

  return {
    symbol: metadata?.symbol || null,
    name: metadata?.name || null,
    price,
    marketCap: dexData.marketCap,
    ageMinutes,
    platform,
    isOnBondingCurve: bondingCurve.isOnCurve,
    bondingCurvePercent: bondingCurve.bondingPercent,
    bondingCurvePosition: bondingPosition,
    hasGraduated: bondingCurve.hasGraduated,
    priceChange5m: dexData.priceChange5m,
    isMayhemMode: bondingCurve.isMayhemMode
  };
}

// ============================================================================
// RULES ENGINE
// ============================================================================

async function evaluateRules(
  config: any,
  tokenData: EnrichedTokenData,
  keywordResult: KeywordMatchResult,
  supabase: any
): Promise<RuleEvaluationResult> {
  const tradingMode = config.trading_mode || 'simple';
  const isFantasyMode = config.fantasy_mode ?? true;

  console.log(`[telegram-channel-monitor] Trading mode: ${tradingMode}, Fantasy: ${isFantasyMode}`);

  // ========== SIMPLE MODE ==========
  if (tradingMode === 'simple') {
    return await evaluateSimpleMode(config, tokenData, keywordResult.hasHighConviction || containsApeKeyword('ape'), isFantasyMode, supabase);
  }

  // ========== ADVANCED MODE ==========
  // Fetch rules for this channel + global rules
  const { data: rules, error } = await supabase
    .from('trading_rules')
    .select('*')
    .eq('is_active', true)
    .or(`channel_id.is.null,channel_id.eq.${config.id}`)
    .order('priority', { ascending: true });

  if (error) {
    console.error('[telegram-channel-monitor] Error fetching rules:', error);
    // Fallback to simple mode on error
    return await evaluateSimpleMode(config, tokenData, keywordResult.hasHighConviction, isFantasyMode, supabase);
  }

  // If no rules, check fallback behavior
  if (!rules || rules.length === 0) {
    console.log('[telegram-channel-monitor] No rules found, falling back to simple mode');
    return await evaluateSimpleMode(config, tokenData, keywordResult.hasHighConviction, isFantasyMode, supabase);
  }

  // Evaluate rules by priority
  for (const rule of rules as TradingRule[]) {
    const matchResult = evaluateSingleRule(rule, tokenData, keywordResult);
    if (matchResult.matches) {
      console.log(`[telegram-channel-monitor] Rule matched: "${rule.name}" - ${matchResult.reason}`);
      
      const decision = isFantasyMode ? 'fantasy_buy' : 'buy';
      
      return {
        matchedRule: rule,
        decision,
        buyAmount: rule.buy_amount_usd,
        sellTarget: rule.sell_target_multiplier,
        stopLoss: rule.stop_loss_pct,
        stopLossEnabled: rule.stop_loss_enabled,
        reasoning: `Rule "${rule.name}": ${matchResult.reason}`,
        ruleId: rule.id
      };
    } else {
      console.log(`[telegram-channel-monitor] Rule "${rule.name}" not matched: ${matchResult.reason}`);
    }
  }

  // No rules matched - check fallback
  const lastRule = rules[rules.length - 1] as TradingRule;
  if (lastRule?.fallback_to_fantasy && isFantasyMode) {
    console.log('[telegram-channel-monitor] No rules matched, falling back to fantasy default');
    return {
      matchedRule: null,
      decision: 'fantasy_buy',
      buyAmount: config.fantasy_buy_amount_usd || 50,
      sellTarget: 2.0,
      stopLoss: null,
      stopLossEnabled: false,
      reasoning: 'No rules matched, using fantasy fallback',
      ruleId: null
    };
  }

  return {
    matchedRule: null,
    decision: 'skip',
    buyAmount: 0,
    sellTarget: 0,
    stopLoss: null,
    stopLossEnabled: false,
    reasoning: 'No matching rules and no fallback enabled',
    ruleId: null
  };
}

function evaluateSingleRule(
  rule: TradingRule,
  tokenData: EnrichedTokenData,
  keywordResult: KeywordMatchResult
): { matches: boolean; reason: string } {
  // Check required keywords (ANY must match)
  if (rule.required_keywords && rule.required_keywords.length > 0) {
    const hasRequiredKeyword = rule.required_keywords.some(kw => 
      keywordResult.matchedKeywords.includes(kw.toLowerCase())
    );
    if (!hasRequiredKeyword) {
      return { matches: false, reason: `Missing required keywords: ${rule.required_keywords.join(', ')}` };
    }
  }

  // Check excluded keywords (NONE should match)
  if (rule.excluded_keywords && rule.excluded_keywords.length > 0) {
    const hasExcludedKeyword = rule.excluded_keywords.some(kw => 
      keywordResult.matchedKeywords.includes(kw.toLowerCase())
    );
    if (hasExcludedKeyword) {
      return { matches: false, reason: 'Contains excluded keyword' };
    }
  }

  // Check minimum keyword weight
  if (rule.min_keyword_weight !== null && keywordResult.totalWeight < rule.min_keyword_weight) {
    return { matches: false, reason: `Keyword weight ${keywordResult.totalWeight.toFixed(2)} < required ${rule.min_keyword_weight}` };
  }

  // Check price range
  if (tokenData.price !== null) {
    if (rule.min_price_usd !== null && tokenData.price < rule.min_price_usd) {
      return { matches: false, reason: `Price $${tokenData.price} below minimum $${rule.min_price_usd}` };
    }
    if (rule.max_price_usd !== null && tokenData.price > rule.max_price_usd) {
      return { matches: false, reason: `Price $${tokenData.price} above maximum $${rule.max_price_usd}` };
    }
  }

  // Check bonding curve position
  if (rule.bonding_curve_position && rule.bonding_curve_position !== 'any') {
    if (tokenData.bondingCurvePosition !== rule.bonding_curve_position) {
      return { matches: false, reason: `Bonding curve position "${tokenData.bondingCurvePosition}" != required "${rule.bonding_curve_position}"` };
    }
  }

  // Check bonding curve percentage
  if (tokenData.bondingCurvePercent !== null) {
    if (rule.min_bonding_pct !== null && tokenData.bondingCurvePercent < rule.min_bonding_pct) {
      return { matches: false, reason: `Bonding ${tokenData.bondingCurvePercent}% below minimum ${rule.min_bonding_pct}%` };
    }
    if (rule.max_bonding_pct !== null && tokenData.bondingCurvePercent > rule.max_bonding_pct) {
      return { matches: false, reason: `Bonding ${tokenData.bondingCurvePercent}% above maximum ${rule.max_bonding_pct}%` };
    }
  }

  // Check require on curve
  if (rule.require_on_curve === true && !tokenData.isOnBondingCurve) {
    return { matches: false, reason: 'Token not on bonding curve' };
  }

  // Check require graduated
  if (rule.require_graduated === true && !tokenData.hasGraduated) {
    return { matches: false, reason: 'Token has not graduated' };
  }

  // Check age
  if (tokenData.ageMinutes !== null) {
    if (rule.min_age_minutes !== null && tokenData.ageMinutes < rule.min_age_minutes) {
      return { matches: false, reason: `Age ${tokenData.ageMinutes}min below minimum ${rule.min_age_minutes}min` };
    }
    if (rule.max_age_minutes !== null && tokenData.ageMinutes > rule.max_age_minutes) {
      return { matches: false, reason: `Age ${tokenData.ageMinutes}min above maximum ${rule.max_age_minutes}min` };
    }
  }

  // Check market cap
  if (tokenData.marketCap !== null) {
    if (rule.min_market_cap_usd !== null && tokenData.marketCap < rule.min_market_cap_usd) {
      return { matches: false, reason: `Market cap $${tokenData.marketCap} below minimum` };
    }
    if (rule.max_market_cap_usd !== null && tokenData.marketCap > rule.max_market_cap_usd) {
      return { matches: false, reason: `Market cap $${tokenData.marketCap} above maximum` };
    }
  }

  // Check platforms
  if (rule.platforms && rule.platforms.length > 0 && tokenData.platform) {
    if (!rule.platforms.includes(tokenData.platform)) {
      return { matches: false, reason: `Platform "${tokenData.platform}" not in allowed: ${rule.platforms.join(', ')}` };
    }
  }

  // Check price change 5m
  if (tokenData.priceChange5m !== null) {
    if (rule.price_change_5m_min !== null && tokenData.priceChange5m < rule.price_change_5m_min) {
      return { matches: false, reason: `5m price change ${tokenData.priceChange5m}% below minimum` };
    }
    if (rule.price_change_5m_max !== null && tokenData.priceChange5m > rule.price_change_5m_max) {
      return { matches: false, reason: `5m price change ${tokenData.priceChange5m}% above maximum (too volatile)` };
    }
  }

  // All conditions passed!
  return { matches: true, reason: 'All conditions met' };
}

async function evaluateSimpleMode(
  config: any,
  tokenData: EnrichedTokenData,
  hasApeKeyword: boolean,
  isFantasyMode: boolean,
  supabase: any
): Promise<RuleEvaluationResult> {
  const price = tokenData.price;
  const marketCap = tokenData.marketCap;
  const tokenAge = tokenData.ageMinutes;

  // Check token age
  const maxTokenAgeMinutes = config.max_mint_age_minutes ?? 10080;
  if (tokenAge !== null && tokenAge > maxTokenAgeMinutes) {
    return {
      matchedRule: null,
      decision: 'skip',
      buyAmount: 0,
      sellTarget: 0,
      stopLoss: null,
      stopLossEnabled: false,
      reasoning: `Token too old: ${tokenAge} minutes (max: ${maxTokenAgeMinutes})`,
      ruleId: null
    };
  }

  if (price === null) {
    return {
      matchedRule: null,
      decision: 'skip',
      buyAmount: 0,
      sellTarget: 0,
      stopLoss: null,
      stopLossEnabled: false,
      reasoning: 'Unable to fetch price',
      ruleId: null
    };
  }

  // Fetch trading tiers from database
  const { data: tiers, error: tiersError } = await supabase
    .from('telegram_trading_tiers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (tiersError) {
    console.error('[telegram-channel-monitor] Error fetching trading tiers:', tiersError);
  }

  const decision = isFantasyMode ? 'fantasy_buy' : 'buy';

  // Evaluate tiers in priority order
  if (tiers && tiers.length > 0) {
    for (const tier of tiers as TradingTier[]) {
      // Check APE keyword requirement
      if (tier.requires_ape_keyword && !hasApeKeyword) {
        console.log(`[telegram-channel-monitor] Tier "${tier.name}" skipped: requires APE keyword`);
        continue;
      }

      // Check price range
      if (tier.min_price_usd !== null && price < tier.min_price_usd) {
        console.log(`[telegram-channel-monitor] Tier "${tier.name}" skipped: price $${price} below min $${tier.min_price_usd}`);
        continue;
      }
      if (tier.max_price_usd !== null && price > tier.max_price_usd) {
        console.log(`[telegram-channel-monitor] Tier "${tier.name}" skipped: price $${price} above max $${tier.max_price_usd}`);
        continue;
      }

      // Check market cap range
      if (marketCap !== null) {
        if (tier.min_market_cap_usd !== null && marketCap < tier.min_market_cap_usd) {
          console.log(`[telegram-channel-monitor] Tier "${tier.name}" skipped: MC $${marketCap} below min`);
          continue;
        }
        if (tier.max_market_cap_usd !== null && marketCap > tier.max_market_cap_usd) {
          console.log(`[telegram-channel-monitor] Tier "${tier.name}" skipped: MC $${marketCap} above max`);
          continue;
        }
      }

      // Tier matches!
      console.log(`[telegram-channel-monitor] Matched tier: "${tier.name}" (${tier.icon || '📊'}) - Buy: $${tier.buy_amount_usd}, Target: ${tier.sell_target_multiplier}x`);
      return {
        matchedRule: null,
        decision,
        buyAmount: tier.buy_amount_usd,
        sellTarget: tier.sell_target_multiplier,
        stopLoss: tier.stop_loss_pct,
        stopLossEnabled: tier.stop_loss_enabled,
        reasoning: `${tier.icon || '📊'} ${tier.name}: ${tier.description || 'Tier matched'}`,
        ruleId: tier.id
      };
    }
  }

  // Fallback to config defaults if no tiers match
  const minPriceThreshold = config.min_price_threshold || 0.00002;
  const maxPriceThreshold = config.max_price_threshold || 0.00004;

  if (hasApeKeyword && price < minPriceThreshold) {
    return {
      matchedRule: null,
      decision,
      buyAmount: config.large_buy_amount_usd || 100,
      sellTarget: config.large_sell_multiplier || 5,
      stopLoss: null,
      stopLossEnabled: false,
      reasoning: `APE keyword + low price ($${price.toFixed(8)} < $${minPriceThreshold}). Large buy tier (fallback).`,
      ruleId: null
    };
  } else if (price >= minPriceThreshold) {
    return {
      matchedRule: null,
      decision,
      buyAmount: config.standard_buy_amount_usd || 50,
      sellTarget: config.standard_sell_multiplier || 3,
      stopLoss: null,
      stopLossEnabled: false,
      reasoning: `Standard price range. Standard buy tier (fallback).`,
      ruleId: null
    };
  }

  return {
    matchedRule: null,
    decision: 'skip',
    buyAmount: 0,
    sellTarget: 0,
    stopLoss: null,
    stopLossEnabled: false,
    reasoning: `No matching tier found for price $${price.toFixed(8)}`,
    ruleId: null
  };
}

// ============================================================================
// AI INTERPRETATION (Enhanced)
// ============================================================================

function generateAIInterpretation(
  messageText: string,
  extractedTokens: string[],
  keywordResult: KeywordMatchResult,
  tokenData: EnrichedTokenData | null,
  ruleResult: RuleEvaluationResult
): {
  summary: string;
  interpretation: string;
  decision: string;
  reasoning: string;
  confidence: number;
} {
  let messageType = 'unknown';
  let confidence = 0.5;
  
  if (extractedTokens.length > 0) {
    if (keywordResult.hasHighConviction) {
      messageType = 'high_conviction_call';
      confidence = 0.9;
    } else if (keywordResult.totalWeight > 1.0) {
      messageType = 'token_call';
      confidence = 0.7;
    } else {
      messageType = 'token_mention';
      confidence = 0.5;
    }
  } else if (/gm|gn|lol|haha|thanks/i.test(messageText)) {
    messageType = 'casual_chat';
    confidence = 0.3;
  } else {
    messageType = 'general_discussion';
    confidence = 0.3;
  }

  let summary = '';
  let interpretation = '';

  switch (messageType) {
    case 'high_conviction_call':
      summary = `🦍 High conviction call detected. Keywords: ${keywordResult.matchedKeywords.slice(0, 5).join(', ')}`;
      interpretation = `Strong buy signal. Token: ${tokenData?.symbol || 'Unknown'}. Price: $${tokenData?.price?.toFixed(8) || 'N/A'}. Platform: ${tokenData?.platform || 'Unknown'}. Bonding: ${tokenData?.bondingCurvePercent?.toFixed(0) || 'N/A'}%`;
      break;
    case 'token_call':
      summary = `Token call with bullish sentiment. Weight: ${keywordResult.totalWeight.toFixed(2)}`;
      interpretation = `Moderate conviction. Token: ${tokenData?.symbol || 'Unknown'}. Keywords: ${keywordResult.matchedKeywords.slice(0, 3).join(', ')}`;
      break;
    case 'token_mention':
      summary = `Token mentioned without strong signals.`;
      interpretation = `Low conviction mention. Token: ${tokenData?.symbol || 'Unknown'}.`;
      break;
    default:
      summary = `General channel message.`;
      interpretation = `No trading signals detected.`;
  }

  return {
    summary,
    interpretation,
    decision: ruleResult.decision,
    reasoning: ruleResult.reasoning,
    confidence
  };
}

// ============================================================================
// EMAIL NOTIFICATIONS
// ============================================================================

async function sendEmailNotification(
  supabase: any,
  email: string,
  tokenMint: string,
  tokenSymbol: string,
  price: number,
  buyAmount: number,
  sellMultiplier: number,
  ruleName: string | null
) {
  try {
    const { error } = await supabase.functions.invoke('send-notification', {
      body: {
        type: 'email',
        to: email,
        subject: `🦍 Trade Alert: ${tokenSymbol}`,
        title: `New Token Call from Blind Ape Alpha`,
        message: `
Token: ${tokenSymbol}
Mint: ${tokenMint}
Price: $${price?.toFixed(10) || 'Unknown'}
Buy Amount: $${buyAmount}
Sell Target: ${sellMultiplier}x
Rule: ${ruleName || 'Simple Mode'}

View on Solscan: https://solscan.io/token/${tokenMint}
View on DexScreener: https://dexscreener.com/solana/${tokenMint}
        `.trim(),
        metadata: { tokenMint, tokenSymbol, price, buyAmount, sellMultiplier }
      }
    });
    
    if (error) {
      console.error('[telegram-channel-monitor] Error sending email:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[telegram-channel-monitor] Error invoking send-notification:', error);
    return false;
  }
}

// ============================================================================
// CHANNEL SCRAPING
// ============================================================================

async function scrapePublicChannel(username: string): Promise<Array<{
  messageId: string;
  text: string;
  date: Date;
  callerUsername?: string;
  callerDisplayName?: string;
}>> {
  const url = `https://t.me/s/${username}`;
  console.log(`[telegram-channel-monitor] Scraping public channel: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) {
      console.error(`[telegram-channel-monitor] Failed to fetch channel page: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    const messages: Array<{ messageId: string; text: string; date: Date; callerUsername?: string; callerDisplayName?: string }> = [];
    
    const messageBlockPattern = /<div class="tgme_widget_message_wrap[^"]*"[^>]*>[\s\S]*?<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    
    let match;
    while ((match = messageBlockPattern.exec(html)) !== null) {
      const [fullBlock, postId, messageContent] = match;
      
      const authorNameMatch = messageContent.match(/<span class="tgme_widget_message_author_name"[^>]*>([^<]+)<\/span>/i);
      const callerDisplayName = authorNameMatch ? authorNameMatch[1].trim() : undefined;
      
      const authorLinkMatch = messageContent.match(/<a class="tgme_widget_message_owner_name"[^>]*href="https:\/\/t\.me\/([^"\/]+)"[^>]*>/i);
      const callerUsername = authorLinkMatch ? authorLinkMatch[1] : (callerDisplayName ? callerDisplayName.replace(/\s+/g, '_').toLowerCase() : undefined);
      
      const textMatch = messageContent.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const rawText = textMatch ? textMatch[1] : '';
      
      const dateMatch = messageContent.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i);
      const dateStr = dateMatch ? dateMatch[1] : new Date().toISOString();
      
      const text = rawText
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      
      if (text) {
        const messageId = postId.split('/').pop() || postId;
        messages.push({
          messageId,
          text,
          date: new Date(dateStr),
          callerUsername,
          callerDisplayName
        });
      }
    }
    
    if (messages.length === 0) {
      const simplePattern = /<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"[^>]*>[\s\S]*?<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<time[^>]*datetime="([^"]+)"[^>]*>/gi;
      
      while ((match = simplePattern.exec(html)) !== null) {
        const [, postId, rawText, dateStr] = match;
        const text = rawText
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        
        if (text) {
          const messageId = postId.split('/').pop() || postId;
          messages.push({
            messageId,
            text,
            date: new Date(dateStr)
          });
        }
      }
    }
    
    console.log(`[telegram-channel-monitor] Scraped ${messages.length} messages from ${username}`);
    return messages;
  } catch (error) {
    console.error(`[telegram-channel-monitor] Error scraping channel:`, error);
    return [];
  }
}

// ============================================================================
// MAIN SERVER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, channelId: requestChannelId, singleChannel, deepScan, resetMessageId } = body;

    console.log(`[telegram-channel-monitor] Action: ${action || 'scan'}, singleChannel: ${singleChannel}, channelId: ${requestChannelId}, deepScan: ${deepScan}`);

    // Build query for channel configurations
    let query = supabase.from('telegram_channel_config').select('*');
    
    if (singleChannel && requestChannelId) {
      console.log(`[telegram-channel-monitor] Single channel mode: ${requestChannelId}`);
      query = query.eq('channel_id', requestChannelId);
    } else {
      query = query.eq('is_active', true);
    }

    const { data: configs, error: configError } = await query;

    if (configError) {
      console.error('[telegram-channel-monitor] Error fetching configs:', configError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch channel configurations'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    if (!configs || configs.length === 0) {
      console.log('[telegram-channel-monitor] No channel configurations found');
      return new Response(JSON.stringify({
        success: true,
        message: singleChannel ? 'Channel not found' : 'No active channel configurations',
        processed: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: any[] = [];
    let totalProcessed = 0;
    let totalBuys = 0;
    let totalFantasyBuys = 0;
    let totalRawMessages = 0;

    for (const config of configs) {
      const channelId = requestChannelId || config.channel_id;
      const channelUsername = config.channel_username;
      const channelType = config.channel_type || 'channel';
      const isFantasyMode = config.fantasy_mode ?? true;
      const tradingMode = config.trading_mode || 'simple';
      
      console.log(`[telegram-channel-monitor] Processing: ${channelUsername || channelId} (${config.channel_name || 'unnamed'}) - Type: ${channelType} - Mode: ${tradingMode} - Fantasy: ${isFantasyMode}`);

      try {
        let channelMessages: Array<{ messageId: string; text: string; date: Date; callerUsername?: string; callerDisplayName?: string }> = [];
        let groupWarning: string | null = null;
        
        // Fetch messages
        if (!channelUsername) {
          groupWarning = 'Missing channel username in config';
        } else if (channelType === 'group') {
          // MTProto for groups
          try {
            const { data: mtData, error: mtError } = await supabase.functions.invoke('telegram-mtproto-auth', {
              body: { action: 'fetch_recent_messages', channelUsername, limit: 50 }
            });

            if (mtError) throw mtError;

            if (mtData?.success && Array.isArray(mtData.messages)) {
              channelMessages = mtData.messages.map((m: any) => ({
                messageId: String(m.messageId || m.id),
                text: m.text || '',
                date: new Date(m.date),
                callerUsername: m.callerUsername,
                callerDisplayName: m.callerDisplayName,
              }));
              console.log(`[telegram-channel-monitor] MTProto fetched ${channelMessages.length} messages`);
            } else {
              groupWarning = mtData?.error || 'MTProto returned no messages';
            }
          } catch (e: any) {
            groupWarning = `MTProto error: ${e?.message || 'unknown error'}`;
          }

          // Bot API fallback
          if (channelMessages.length === 0) {
            const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
            if (botToken) {
              const updatesResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/getUpdates?offset=-100&limit=100`
              );
              const updatesData = await updatesResponse.json();

              if (updatesData.ok) {
                const filtered = updatesData.result?.filter((update: any) => {
                  const msg = update.channel_post || update.message;
                  if (!msg) return false;
                  const chatUsername = msg.chat?.username?.toLowerCase();
                  return chatUsername === channelUsername?.toLowerCase();
                }) || [];

                channelMessages = filtered.map((update: any) => {
                  const msg = update.channel_post || update.message;
                  const from = msg.from || msg.sender_chat || {};
                  return {
                    messageId: msg.message_id.toString(),
                    text: msg.text || '',
                    date: new Date(msg.date * 1000),
                    callerUsername: from.username,
                    callerDisplayName: from.first_name ? `${from.first_name} ${from.last_name || ''}`.trim() : from.title
                  };
                });

                if (channelMessages.length > 0) {
                  groupWarning = null;
                }
              }
            }
          }
        } else {
          channelMessages = await scrapePublicChannel(channelUsername);
        }

        totalRawMessages += channelMessages.length;

        if (groupWarning && channelMessages.length === 0) {
          console.log(`[telegram-channel-monitor] WARNING: ${groupWarning}`);
          results.push({
            channel: config.channel_name || channelUsername || channelId,
            channelType,
            tradingMode,
            messagesFound: 0,
            success: false,
            warning: groupWarning
          });
          continue;
        }

        // Usernames to ignore (owner's messages)
        const IGNORED_USERNAMES = ['system_reset'];
        
        for (const msg of channelMessages) {
          if (!msg.text) continue;

          const messageId = msg.messageId;
          const messageText = msg.text;
          const messageDate = msg.date;
          const callerUsername = msg.callerUsername;
          const callerDisplayName = msg.callerDisplayName;

          // Skip messages from ignored usernames
          if (callerUsername && IGNORED_USERNAMES.includes(callerUsername.toLowerCase())) {
            console.log(`[telegram-channel-monitor] Skipping message from ignored user: @${callerUsername}`);
            continue;
          }

          // Skip if message is too old
          const scanWindowMinutes = config.scan_window_minutes ?? 1440;
          const messageAgeMinutes = (Date.now() - messageDate.getTime()) / 60000;
          if (!deepScan && messageAgeMinutes > scanWindowMinutes) {
            continue;
          }

          // Skip if already processed
          if (!resetMessageId && config.last_message_id) {
            const lastId = parseInt(config.last_message_id);
            const currentId = parseInt(messageId);
            if (!isNaN(lastId) && !isNaN(currentId) && currentId <= lastId) {
              continue;
            }
          }

          // Extract Solana addresses (dedupe within the same message)
          const addresses = Array.from(new Set(extractSolanaAddresses(messageText)));
          
          // Detect keywords (for both modes)
          const keywordResult = tradingMode === 'advanced' 
            ? await detectKeywords(messageText, supabase)
            : { 
                matchedKeywords: containsApeKeyword(messageText) ? ['ape'] : [], 
                totalWeight: containsApeKeyword(messageText) ? 2.0 : 0, 
                categories: {}, 
                hasBearishSignal: false,
                hasHighConviction: containsApeKeyword(messageText)
              };

          // Skip if bearish signals detected (in advanced mode)
          if (tradingMode === 'advanced' && keywordResult.hasBearishSignal) {
            console.log(`[telegram-channel-monitor] Bearish signal detected, skipping: ${keywordResult.matchedKeywords.join(', ')}`);
            continue;
          }

          // Enrich first token
          let tokenData: EnrichedTokenData | null = null;
          const firstToken = addresses[0];
          
          if (firstToken) {
            tokenData = await enrichTokenData(firstToken);
          }

          // Evaluate rules
          const ruleResult = addresses.length > 0 && tokenData
            ? await evaluateRules(config, tokenData, keywordResult, supabase)
            : {
                matchedRule: null,
                decision: 'no_action' as const,
                buyAmount: 0,
                sellTarget: 0,
                stopLoss: null,
                stopLossEnabled: false,
                reasoning: 'No token address found',
                ruleId: null
              };

          // Generate AI interpretation
          const aiResult = generateAIInterpretation(messageText, addresses, keywordResult, tokenData, ruleResult);

          // Log interpretation
          const { data: interpretationRow, error: interpretationError } = await supabase
            .from('telegram_message_interpretations')
            .insert({
              channel_config_id: config.id,
              channel_id: channelId,
              message_id: messageId,
              raw_message: messageText.substring(0, 2000),
              ai_summary: aiResult.summary,
              ai_interpretation: aiResult.interpretation,
              extracted_tokens: addresses,
              decision: ruleResult.decision,
              decision_reasoning: ruleResult.reasoning,
              confidence_score: aiResult.confidence,
              token_mint: firstToken || null,
              token_symbol: tokenData?.symbol || null,
              price_at_detection: tokenData?.price || null,
              caller_username: callerUsername || null,
              caller_display_name: callerDisplayName || null
            })
            .select('id')
            .single();

          if (interpretationError) {
            console.error('[telegram-channel-monitor] Failed to insert telegram_message_interpretations:', interpretationError);
          }

          const interpretationId = interpretationRow?.id ?? null;

          console.log(`[telegram-channel-monitor] AI: ${aiResult.summary} -> ${ruleResult.decision}`);

          // Process each token
          for (const tokenMint of addresses) {
            // Dedupe call records by message_id+token (NOT just token) so repeats across messages still get added
            const { data: existingCall, error: existingCallError } = await supabase
              .from('telegram_channel_calls')
              .select('id')
              .eq('channel_id', channelId)
              .eq('message_id', messageId)
              .eq('token_mint', tokenMint)
              .maybeSingle();

            if (existingCallError) {
              console.warn(`[telegram-channel-monitor] Error checking existing call for ${tokenMint}:`, existingCallError);
            }

            // Check first call
            const { data: existingGlobal, error: existingGlobalError } = await supabase
              .from('telegram_channel_calls')
              .select('id')
              .eq('token_mint', tokenMint)
              .limit(1)
              .maybeSingle();

            if (existingGlobalError) {
              console.warn(`[telegram-channel-monitor] Error checking global first-call for ${tokenMint}:`, existingGlobalError);
            }

            const isFirstCall = !existingGlobal;

            // Get token data for this specific token
            let currentTokenData = tokenData;
            if (tokenMint !== firstToken) {
              currentTokenData = await enrichTokenData(tokenMint);
            }

            // Evaluate rules for this token
            const currentRuleResult = currentTokenData
              ? await evaluateRules(config, currentTokenData, keywordResult, supabase)
              : ruleResult;

            const status = currentRuleResult.decision === 'skip' || currentRuleResult.decision === 'no_action'
              ? 'skipped'
              : (isFantasyMode ? 'fantasy_bought' : 'detected');

            // Insert call record if we don't already have one for THIS message
            let callId: string | null = existingCall?.id ?? null;
            if (!callId) {
              const { data: insertedCall, error: insertCallError } = await supabase
                .from('telegram_channel_calls')
                .insert({
                  channel_config_id: config.id,
                  channel_id: channelId,
                  channel_name: config.channel_name,
                  message_id: messageId,
                  token_mint: tokenMint,
                  token_symbol: currentTokenData?.symbol || null,
                  token_name: currentTokenData?.name || null,
                  raw_message: messageText.substring(0, 1000),
                  contains_ape: keywordResult.hasHighConviction,
                  price_at_call: currentTokenData?.price,
                  mint_age_minutes: currentTokenData?.ageMinutes,
                  buy_tier: currentRuleResult.matchedRule?.name || (currentRuleResult.buyAmount > 50 ? 'large' : 'standard'),
                  buy_amount_usd: currentRuleResult.buyAmount || null,
                  sell_multiplier: currentRuleResult.sellTarget || null,
                  status,
                  skip_reason: currentRuleResult.decision === 'skip' ? currentRuleResult.reasoning : null,
                  caller_username: callerUsername || null,
                  caller_display_name: callerDisplayName || null,
                  is_first_call: isFirstCall
                })
                .select('id')
                .single();

              if (insertCallError) {
                console.error(`[telegram-channel-monitor] Call insert FAILED for ${tokenMint}:`, insertCallError);
              } else {
                callId = insertedCall?.id ?? null;
              }
            }

            // Track caller
            if (isFirstCall && (callerUsername || callerDisplayName)) {
              const callerKey = callerUsername || callerDisplayName?.replace(/\s+/g, '_').toLowerCase();
              const { data: existingCaller } = await supabase
                .from('telegram_callers')
                .select('*')
                .eq('caller_username', callerKey)
                .maybeSingle();

              if (!existingCaller) {
                await supabase.from('telegram_callers').insert({
                  caller_username: callerKey,
                  caller_display_name: callerDisplayName,
                  channel_config_id: config.id,
                  total_calls: 1,
                  first_calls: 1,
                  last_active_at: new Date().toISOString()
                });
              } else {
                await supabase.from('telegram_callers').update({
                  total_calls: (existingCaller.total_calls || 0) + 1,
                  first_calls: (existingCaller.first_calls || 0) + 1,
                  last_active_at: new Date().toISOString()
                }).eq('id', existingCaller.id);
              }
            }

            totalProcessed++;

            // Execute trade or fantasy position
            if (currentRuleResult.decision === 'buy' || currentRuleResult.decision === 'fantasy_buy') {
              // GLOBAL DEDUPE: Only 1 fantasy position per token_mint ever (first call wins)
              const { data: existingTokenPos, error: existingTokenPosError } = await supabase
                .from('telegram_fantasy_positions')
                .select('id, channel_name, caller_display_name, created_at')
                .eq('token_mint', tokenMint)
                .limit(1)
                .maybeSingle();

              if (existingTokenPosError) {
                console.warn(`[telegram-channel-monitor] Error checking existing fantasy position for token ${tokenMint}:`, existingTokenPosError);
              }

              if (existingTokenPos) {
                console.log(`[telegram-channel-monitor] Fantasy position ALREADY EXISTS for token ${tokenMint} (first called by ${existingTokenPos.channel_name} via ${existingTokenPos.caller_display_name} at ${existingTokenPos.created_at}), skipping duplicate`);
              } else {
                // ============== PRE-FILTER: MAYHEM MODE CHECK ==============
                // Skip tokens launched in pump.fun Mayhem Mode (AI trading agent)
                if (currentTokenData?.isMayhemMode) {
                  console.log(`[telegram-channel-monitor] SKIPPING ${tokenMint} - MAYHEM MODE token (AI trading agent active)`);
                  
                  // Update the call record to show it was skipped
                  await supabase
                    .from('telegram_calls')
                    .update({ 
                      status: 'skipped', 
                      skip_reason: 'Mayhem Mode token - AI trading agent active, high manipulation risk' 
                    })
                    .eq('id', callId);
                  
                  totalSkipped++;
                  continue; // Skip to next token
                }
                
                // ============== DEVELOPER ENRICHMENT + RUGCHECK ==============
                let developerData: any = null;
                let skipPosition = false;
                let skipReason: string | null = null;
                let finalSellMultiplier = currentRuleResult.sellTarget;
                
                try {
                  console.log(`[telegram-channel-monitor] Calling developer-enrichment for ${tokenMint}`);
                  const { data: enrichmentResult, error: enrichmentError } = await supabase.functions.invoke('developer-enrichment', {
                    body: { 
                      tokenMint, 
                      defaultSellMultiplier: currentRuleResult.sellTarget 
                    }
                  });
                  
                  if (enrichmentError) {
                    console.warn(`[telegram-channel-monitor] Developer enrichment failed:`, enrichmentError);
                  } else {
                    developerData = enrichmentResult;
                    console.log(`[telegram-channel-monitor] Enrichment result: canTrade=${developerData?.canTrade}, risk=${developerData?.riskLevel}, rugcheck=${developerData?.rugcheckNormalised}/100`);
                    
                    // Check if we should skip this position
                    if (developerData && !developerData.canTrade) {
                      skipPosition = true;
                      skipReason = developerData.skipReason || developerData.rugcheckSkipReason || 'Risk assessment failed';
                      console.log(`[telegram-channel-monitor] SKIPPING position due to: ${skipReason}`);
                    }
                    
                    // Adjust sell multiplier if risk assessment suggests it
                    if (developerData?.adjustedSellMultiplier) {
                      finalSellMultiplier = developerData.adjustedSellMultiplier;
                      console.log(`[telegram-channel-monitor] Adjusted sell multiplier: ${currentRuleResult.sellTarget} -> ${finalSellMultiplier}`);
                    }
                  }
                } catch (enrichmentErr) {
                  console.warn(`[telegram-channel-monitor] Developer enrichment exception:`, enrichmentErr);
                  // Continue without enrichment data
                }
                
                if (skipPosition) {
                  // Log the skip but don't create position
                  console.log(`[telegram-channel-monitor] Position SKIPPED for ${currentTokenData?.symbol || tokenMint}: ${skipReason}`);
                  
                  // Update call record with skip reason
                  if (callId) {
                    await supabase
                      .from('telegram_channel_calls')
                      .update({ 
                        status: 'skipped', 
                        skip_reason: skipReason 
                      })
                      .eq('id', callId);
                  }
                } else {
                  const entryPrice = currentTokenData?.price || 0.00001;
                  const tokenAmount = entryPrice > 0 ? currentRuleResult.buyAmount / entryPrice : null;

                  // Fallback caller: if caller is "Phanes" (bot), use channel name instead
                  const isPhanesCaller = callerDisplayName?.toLowerCase() === 'phanes' ||
                    callerUsername?.toLowerCase() === 'phanes' ||
                    callerDisplayName?.toLowerCase()?.includes('phanes');

                  const effectiveCallerUsername = isPhanesCaller
                    ? (config.channel_name || channelUsername || callerUsername)
                    : callerUsername;

                  const effectiveCallerDisplayName = isPhanesCaller
                    ? (config.channel_name || channelUsername || callerDisplayName)
                    : callerDisplayName;

                  // Build position data with developer enrichment
                  const positionData: any = {
                    call_id: callId,
                    interpretation_id: interpretationId,
                    channel_config_id: config.id,
                    token_mint: tokenMint,
                    token_symbol: currentTokenData?.symbol || null,
                    token_name: currentTokenData?.name || null,
                    entry_price_usd: entryPrice,
                    entry_amount_usd: currentRuleResult.buyAmount,
                    token_amount: tokenAmount,
                    current_price_usd: entryPrice,
                    target_sell_multiplier: finalSellMultiplier,
                    status: 'open',
                    caller_username: effectiveCallerUsername,
                    caller_display_name: effectiveCallerDisplayName,
                    channel_name: config.channel_name || channelUsername,
                    stop_loss_pct: currentRuleResult.stopLossEnabled ? currentRuleResult.stopLoss : null,
                    is_active: true,
                    stop_loss_enabled: currentRuleResult.stopLossEnabled || false,
                    trail_tracking_enabled: true
                  };

                  // Add developer enrichment data if available
                  if (developerData) {
                    positionData.developer_id = developerData.developerId;
                    positionData.developer_risk_level = developerData.riskLevel;
                    positionData.developer_reputation_score = developerData.reputationScore;
                    positionData.developer_warning = developerData.warning;
                    positionData.developer_twitter_handle = developerData.twitterHandle;
                    positionData.developer_total_tokens = developerData.totalTokens;
                    positionData.developer_rug_count = developerData.rugCount;
                    
                    // RugCheck data
                    positionData.rugcheck_score = developerData.rugcheckScore || null;
                    positionData.rugcheck_normalised = developerData.rugcheckNormalised || null;
                    positionData.rugcheck_risks = developerData.rugcheckRisks || null;
                    positionData.rugcheck_passed = developerData.rugcheckPassed ?? null;
                    positionData.rugcheck_checked_at = new Date().toISOString();
                    
                    // Track if we adjusted based on risk
                    if (developerData.adjustedSellMultiplier && developerData.adjustedSellMultiplier !== currentRuleResult.sellTarget) {
                      positionData.adjusted_by_dev_risk = true;
                      positionData.original_sell_multiplier = currentRuleResult.sellTarget;
                    }
                  }

                  const { error: fantasyInsertError } = await supabase
                    .from('telegram_fantasy_positions')
                    .insert(positionData);

                  if (fantasyInsertError) {
                    console.error(`[telegram-channel-monitor] Fantasy position insert FAILED for ${tokenMint}:`, fantasyInsertError);
                  } else {
                    totalFantasyBuys++;
                    const riskBadge = developerData?.riskLevel ? ` [${developerData.riskLevel.toUpperCase()}]` : '';
                    const rugcheckBadge = developerData?.rugcheckNormalised !== undefined ? ` RC:${developerData.rugcheckNormalised}/100` : '';
                    console.log(`[telegram-channel-monitor] Fantasy INSERTED: ${currentTokenData?.symbol || tokenMint} - $${currentRuleResult.buyAmount} @ $${entryPrice.toFixed(10)} (${tradingMode})${riskBadge}${rugcheckBadge}`);
                  }
                }
              }
            }

            // FlipIt auto-buy: trigger when enabled and rules match
            if (config.flipit_enabled) {
              const flipitBuyAmount = config.flipit_buy_amount_usd || 10;
              const flipitSellMultiplier = config.flipit_sell_multiplier || 2;
              const flipitMaxDaily = config.flipit_max_daily_positions || 5;

              // Check daily position limit
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              const { count: todayPositions } = await supabase
                .from('flip_positions')
                .select('id', { count: 'exact', head: true })
                .eq('source', 'telegram')
                .eq('source_channel_id', config.id)
                .gte('created_at', today.toISOString());

              if ((todayPositions || 0) < flipitMaxDaily) {
                // GLOBAL DEDUPE: Only 1 real position per token_mint ever (first call wins)
                const { data: existingFlipPosition, error: flipPosCheckError } = await supabase
                  .from('flip_positions')
                  .select('id, token_symbol, created_at, source')
                  .eq('token_mint', tokenMint)
                  .limit(1)
                  .maybeSingle();

                if (flipPosCheckError) {
                  console.warn(`[telegram-channel-monitor] Error checking existing FlipIt position for ${tokenMint}:`, flipPosCheckError);
                }

                if (existingFlipPosition) {
                  console.log(`[telegram-channel-monitor] FlipIt: Position ALREADY EXISTS for ${tokenMint} (${existingFlipPosition.token_symbol}) created at ${existingFlipPosition.created_at} from ${existingFlipPosition.source}, skipping duplicate buy`);
                } else {
                  // Find active FlipIt wallet
                  const { data: flipitWallets } = await supabase
                    .from('flipit_wallets')
                    .select('id')
                    .eq('is_active', true)
                    .limit(1);

                  const walletId = flipitWallets?.[0]?.id || config.flipit_wallet_id;
                  
                  if (walletId) {
                    try {
                      console.log(`[telegram-channel-monitor] FlipIt: Triggering auto-buy for ${currentTokenData?.symbol || tokenMint} - $${flipitBuyAmount} @ ${flipitSellMultiplier}x`);
                      
                      await supabase.functions.invoke('flipit-execute', {
                        body: {
                          walletId,
                          action: 'buy',
                          tokenMint,
                          amountUsd: flipitBuyAmount,
                          targetMultiplier: flipitSellMultiplier,
                          source: 'telegram',
                          sourceChannelId: config.id
                        }
                      });
                      totalBuys++;
                      console.log(`[telegram-channel-monitor] FlipIt: Buy executed successfully`);
                    } catch (buyError) {
                      console.error('[telegram-channel-monitor] FlipIt buy error:', buyError);
                    }
                  } else {
                    console.log('[telegram-channel-monitor] FlipIt: No active wallet found, skipping');
                  }
                }
              } else {
                console.log(`[telegram-channel-monitor] FlipIt: Daily limit reached (${todayPositions}/${flipitMaxDaily})`);
              }
            } else if (!isFantasyMode && config.flipit_wallet_id) {
              // Legacy: Real trading without flipit_enabled flag
              // GLOBAL DEDUPE: Only 1 real position per token_mint ever (first call wins)
              const { data: existingLegacyPosition, error: legacyPosCheckError } = await supabase
                .from('flip_positions')
                .select('id, token_symbol, created_at, source')
                .eq('token_mint', tokenMint)
                .limit(1)
                .maybeSingle();

              if (legacyPosCheckError) {
                console.warn(`[telegram-channel-monitor] Error checking existing legacy FlipIt position for ${tokenMint}:`, legacyPosCheckError);
              }

              if (existingLegacyPosition) {
                console.log(`[telegram-channel-monitor] Legacy FlipIt: Position ALREADY EXISTS for ${tokenMint} (${existingLegacyPosition.token_symbol}) created at ${existingLegacyPosition.created_at} from ${existingLegacyPosition.source}, skipping duplicate buy`);
              } else {
                try {
                  await supabase.functions.invoke('flipit-execute', {
                    body: {
                      walletId: config.flipit_wallet_id,
                      action: 'buy',
                      tokenMint,
                      amountUsd: currentRuleResult.buyAmount,
                      targetMultiplier: currentRuleResult.sellTarget,
                      stopLossPct: currentRuleResult.stopLossEnabled ? currentRuleResult.stopLoss : null
                    }
                  });
                  totalBuys++;
                } catch (buyError) {
                  console.error('[telegram-channel-monitor] FlipIt buy error:', buyError);
                }
              }
            }

            // Email notification
            if (config.email_notifications && config.notification_email) {
              await sendEmailNotification(
                supabase,
                config.notification_email,
                tokenMint,
                currentTokenData?.symbol || 'UNKNOWN',
                currentTokenData?.price || 0,
                currentRuleResult.buyAmount,
                currentRuleResult.sellTarget,
                currentRuleResult.matchedRule?.name || null
              );
            }
          }
        }

        // Update last check
        const maxMessageId = channelMessages.length > 0
          ? Math.max(...channelMessages.map(m => parseInt(m.messageId) || 0))
          : config.last_message_id;

        await supabase
          .from('telegram_channel_config')
          .update({
            last_check_at: new Date().toISOString(),
            last_message_id: maxMessageId
          })
          .eq('id', config.id);

        results.push({
          channel: config.channel_name || channelUsername || channelId,
          channelType,
          tradingMode,
          messagesFound: channelMessages.length,
          success: true
        });

      } catch (channelError: any) {
        console.error(`[telegram-channel-monitor] Error processing channel:`, channelError);
        results.push({
          channel: config.channel_name || channelUsername || channelId,
          channelType,
          tradingMode,
          success: false,
          error: channelError.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: totalProcessed,
      buysExecuted: totalBuys,
      fantasyBuysExecuted: totalFantasyBuys,
      rawMessagesRetrieved: totalRawMessages,
      channels: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[telegram-channel-monitor] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});