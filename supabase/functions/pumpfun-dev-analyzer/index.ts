import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('pumpfun-dev-analyzer');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DevAnalysis {
  walletAddress: string;
  totalTokens: number;
  graduatedTokens: number;
  successfulTokens: number;
  failedTokens: number;
  ruggedTokens: number;
  avgLifespanMins: number;
  avgPeakMcapUsd: number;
  successRatePct: number;
  sameNameCount: number;
  pattern: 'unknown' | 'serial_spammer' | 'fee_farmer' | 'test_launcher' | 'legitimate_builder';
  isSerialSpammer: boolean;
  isTestLauncher: boolean;
  isLegitimateBuilder: boolean;
  reputationScore: number;
  trustLevel: string;
  tokens: any[];
}

// Fetch all tokens created by a wallet - tries Pump.fun first, then Helius DAS as fallback
async function fetchDevTokenHistory(walletAddress: string): Promise<any[]> {
  // Try pump.fun endpoints first with proper headers
  const pumpEndpoints = [
    `https://frontend-api.pump.fun/coins/user-created-coins/${walletAddress}?limit=200&offset=0`,
    `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/user-created-coins/${walletAddress}?limit=200&offset=0`
  ];
  
  const pumpHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/'
  };
  
  for (const endpoint of pumpEndpoints) {
    try {
      console.log(`[DevAnalyzer] Trying pump.fun: ${endpoint.includes('frontend') ? 'frontend-api' : 'client-api'}`);
      const response = await fetch(endpoint, { headers: pumpHeaders });
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.log(`[DevAnalyzer] Pump.fun returned ${data.length} tokens`);
          return data;
        }
      } else {
        console.log(`[DevAnalyzer] Pump.fun returned ${response.status}`);
      }
    } catch (error) {
      console.log(`[DevAnalyzer] Pump.fun error:`, error);
    }
  }
  
  // Fallback to Helius DAS API to get tokens created by this wallet
  console.log(`[DevAnalyzer] Pump.fun failed, trying Helius DAS API...`);
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
  
  if (!heliusApiKey) {
    console.log(`[DevAnalyzer] No HELIUS_API_KEY, cannot fallback`);
    return [];
  }
  
  try {
    // Use Helius DAS to search for assets created by this wallet
    const heliusResponse = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dev-tokens',
        method: 'searchAssets',
        params: {
          ownerAddress: walletAddress,
          creatorAddress: walletAddress,
          tokenType: 'fungible',
          page: 1,
          limit: 200
        }
      })
    });
    
    if (heliusResponse.ok) {
      const heliusData = await heliusResponse.json();
      const items = heliusData?.result?.items || [];
      
      // Transform Helius format to pump.fun-like format
      const tokens = items.map((item: any) => ({
        mint: item.id,
        name: item.content?.metadata?.name || 'Unknown',
        symbol: item.content?.metadata?.symbol || '???',
        complete: false, // Helius doesn't tell us graduation status
        usd_market_cap: 0, // Would need separate lookup
        created_timestamp: item.created_at || null
      }));
      
      console.log(`[DevAnalyzer] Helius DAS returned ${tokens.length} tokens`);
      return tokens;
    } else {
      console.log(`[DevAnalyzer] Helius DAS error: ${heliusResponse.status}`);
    }
  } catch (error) {
    console.error(`[DevAnalyzer] Helius DAS error:`, error);
  }
  
  // Final fallback: try to get created tokens from database
  console.log(`[DevAnalyzer] All APIs failed, checking local DB...`);
  return [];
}

// Classify token outcome based on its metrics
function classifyTokenOutcome(token: any): 'graduated' | 'successful' | 'failed' | 'rugged' | 'active' | 'unknown' {
  const mcap = token.usd_market_cap || 0;
  const isComplete = token.complete === true;
  
  // Graduated = made it to Raydium
  if (isComplete) return 'graduated';
  
  // Check if token is still active (has recent activity)
  const createdAt = token.created_timestamp ? new Date(token.created_timestamp) : null;
  const ageHours = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : 999;
  
  // If very new and has decent mcap, consider active
  if (ageHours < 24 && mcap > 1000) return 'active';
  
  // Successful = reached decent market cap but didn't graduate
  if (mcap > 50000) return 'successful';
  
  // Failed = died with low market cap
  if (mcap < 1000 && ageHours > 1) return 'failed';
  
  // Very quick death with no mcap = possible rug or test
  if (mcap < 100 && ageHours > 0.5) return 'rugged';
  
  return 'unknown';
}

// Detect developer pattern based on token history
function detectDevPattern(tokens: any[]): DevAnalysis['pattern'] {
  const totalTokens = tokens.length;
  
  if (totalTokens === 0) return 'unknown';
  
  // Count outcomes
  let graduated = 0;
  let successful = 0;
  let failed = 0;
  let rugged = 0;
  
  for (const token of tokens) {
    const outcome = classifyTokenOutcome(token);
    if (outcome === 'graduated') graduated++;
    else if (outcome === 'successful') successful++;
    else if (outcome === 'failed') failed++;
    else if (outcome === 'rugged') rugged++;
  }
  
  const successRate = (graduated + successful) / totalTokens;
  
  // Serial spammer: 50+ tokens with less than 5% success
  if (totalTokens >= 50 && successRate < 0.05) {
    return 'serial_spammer';
  }
  
  // Fee farmer: 20+ tokens with less than 10% success and mostly quick deaths
  if (totalTokens >= 20 && successRate < 0.1 && failed / totalTokens > 0.7) {
    return 'fee_farmer';
  }
  
  // Check for same-name patterns (test launcher)
  const names = tokens.map(t => t.name?.toLowerCase()).filter(Boolean);
  const nameCounts: Record<string, number> = {};
  for (const name of names) {
    nameCounts[name] = (nameCounts[name] || 0) + 1;
  }
  const maxSameName = Math.max(...Object.values(nameCounts), 0);
  
  // If dev uses same name multiple times and one succeeds, they're a test launcher
  if (maxSameName >= 2 && (graduated > 0 || successful > 0)) {
    return 'test_launcher';
  }
  
  // Legitimate builder: Few tokens with high success rate
  if (totalTokens <= 10 && successRate >= 0.3) {
    return 'legitimate_builder';
  }
  
  return 'unknown';
}

// Calculate reputation score (0-100)
function calculateReputationScore(analysis: Partial<DevAnalysis>): number {
  let score = 50; // Start neutral
  
  const { totalTokens = 0, successRatePct = 0, pattern = 'unknown', graduatedTokens = 0 } = analysis;
  
  // Graduated tokens are a big positive
  score += graduatedTokens * 10;
  
  // Success rate bonus/penalty
  if (successRatePct >= 30) score += 20;
  else if (successRatePct >= 10) score += 10;
  else if (successRatePct < 5 && totalTokens > 10) score -= 20;
  
  // Pattern adjustments
  if (pattern === 'serial_spammer') score -= 40;
  if (pattern === 'fee_farmer') score -= 25;
  if (pattern === 'test_launcher') score += 5; // Slight positive - shows intention
  if (pattern === 'legitimate_builder') score += 25;
  
  // Too many tokens is suspicious
  if (totalTokens > 100) score -= 15;
  else if (totalTokens > 50) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

// Get trust level from score
function getTrustLevel(score: number): string {
  if (score >= 80) return 'trusted';
  if (score >= 60) return 'neutral';
  if (score >= 40) return 'suspicious';
  if (score >= 20) return 'risky';
  return 'scammer';
}

// Analyze a developer wallet
async function analyzeDevWallet(walletAddress: string): Promise<DevAnalysis> {
  console.log(`[DevAnalyzer] Analyzing wallet: ${walletAddress}`);
  
  const tokens = await fetchDevTokenHistory(walletAddress);
  console.log(`[DevAnalyzer] Found ${tokens.length} tokens for ${walletAddress.slice(0, 8)}...`);
  
  if (tokens.length === 0) {
    return {
      walletAddress,
      totalTokens: 0,
      graduatedTokens: 0,
      successfulTokens: 0,
      failedTokens: 0,
      ruggedTokens: 0,
      avgLifespanMins: 0,
      avgPeakMcapUsd: 0,
      successRatePct: 0,
      sameNameCount: 0,
      pattern: 'unknown',
      isSerialSpammer: false,
      isTestLauncher: false,
      isLegitimateBuilder: false,
      reputationScore: 50,
      trustLevel: 'neutral',
      tokens: [],
    };
  }
  
  // Classify all tokens
  let graduated = 0, successful = 0, failed = 0, rugged = 0;
  let totalMcap = 0;
  
  for (const token of tokens) {
    const outcome = classifyTokenOutcome(token);
    if (outcome === 'graduated') graduated++;
    else if (outcome === 'successful') successful++;
    else if (outcome === 'failed') failed++;
    else if (outcome === 'rugged') rugged++;
    
    totalMcap += token.usd_market_cap || 0;
  }
  
  // Check for same-name patterns
  const names = tokens.map(t => t.name?.toLowerCase()).filter(Boolean);
  const nameCounts: Record<string, number> = {};
  for (const name of names) {
    nameCounts[name] = (nameCounts[name] || 0) + 1;
  }
  const maxSameName = Math.max(...Object.values(nameCounts), 0);
  
  const totalTokens = tokens.length;
  const successRatePct = totalTokens > 0 ? ((graduated + successful) / totalTokens) * 100 : 0;
  const avgPeakMcapUsd = totalTokens > 0 ? totalMcap / totalTokens : 0;
  
  const pattern = detectDevPattern(tokens);
  
  const analysis: DevAnalysis = {
    walletAddress,
    totalTokens,
    graduatedTokens: graduated,
    successfulTokens: successful,
    failedTokens: failed,
    ruggedTokens: rugged,
    avgLifespanMins: 0, // Would need historical tracking to calculate
    avgPeakMcapUsd,
    successRatePct,
    sameNameCount: maxSameName,
    pattern,
    isSerialSpammer: pattern === 'serial_spammer',
    isTestLauncher: pattern === 'test_launcher',
    isLegitimateBuilder: pattern === 'legitimate_builder',
    reputationScore: 0,
    trustLevel: '',
    tokens: tokens.slice(0, 20), // Return first 20 for display
  };
  
  analysis.reputationScore = calculateReputationScore(analysis);
  analysis.trustLevel = getTrustLevel(analysis.reputationScore);
  
  console.log(`[DevAnalyzer] ${walletAddress.slice(0, 8)}... -> Pattern: ${pattern}, Score: ${analysis.reputationScore}, Trust: ${analysis.trustLevel}`);
  
  return analysis;
}

// Save/update dev reputation in database
async function saveDevReputation(supabase: any, analysis: DevAnalysis): Promise<void> {
  const { walletAddress, totalTokens, graduatedTokens, successfulTokens, failedTokens, 
          avgPeakMcapUsd, successRatePct, sameNameCount, pattern, reputationScore, trustLevel,
          isSerialSpammer, isTestLauncher, isLegitimateBuilder } = analysis;
  
  await supabase
    .from('dev_wallet_reputation')
    .upsert({
      wallet_address: walletAddress,
      total_tokens_launched: totalTokens,
      tokens_graduated: graduatedTokens,
      tokens_successful: successfulTokens,
      tokens_rugged: failedTokens,
      avg_peak_mcap_usd: avgPeakMcapUsd,
      success_rate_pct: successRatePct,
      total_same_name_tokens: sameNameCount,
      dev_pattern: pattern,
      reputation_score: reputationScore,
      trust_level: trustLevel,
      is_serial_spammer: isSerialSpammer,
      is_test_launcher: isTestLauncher,
      is_legitimate_builder: isLegitimateBuilder,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' });
  
  console.log(`[DevAnalyzer] Saved reputation for ${walletAddress.slice(0, 8)}...`);
}

// Check if duplicate is allowed (same dev, or original was a test)
async function checkSmartDuplicate(
  supabase: any, 
  symbol: string, 
  creatorWallet: string
): Promise<{ isDuplicate: boolean; allowReason?: string; blockReason?: string; originalToken?: any }> {
  const lowerSymbol = symbol.toLowerCase();
  
  // Check seen_symbols for previous tokens with same name
  const { data: previousTokens } = await supabase
    .from('pumpfun_seen_symbols')
    .select('*')
    .eq('symbol_lower', lowerSymbol)
    .order('first_seen_at', { ascending: false })
    .limit(10);
  
  if (!previousTokens || previousTokens.length === 0) {
    // No previous tokens with this name - allow
    return { isDuplicate: false };
  }
  
  // Check if any previous token is from the SAME creator
  const sameDevToken = previousTokens.find((t: any) => t.creator_wallet === creatorWallet);
  
  if (sameDevToken) {
    // Same dev is re-using name
    // Check if previous was a test (died quickly, low mcap)
    if (sameDevToken.is_test_launch || sameDevToken.lifespan_mins < 30 && sameDevToken.peak_mcap_usd < 1000) {
      return { 
        isDuplicate: false, 
        allowReason: 'same_dev_relaunch_after_test',
        originalToken: sameDevToken 
      };
    }
    
    // Same dev, but previous was successful - might be a re-brand attempt
    if (sameDevToken.peak_mcap_usd > 10000) {
      return { 
        isDuplicate: true, 
        blockReason: 'same_dev_already_successful_with_name',
        originalToken: sameDevToken 
      };
    }
    
    // Same dev, previous was mid-tier - allow as potential improvement
    return { 
      isDuplicate: false, 
      allowReason: 'same_dev_retry',
      originalToken: sameDevToken 
    };
  }
  
  // Different dev copying a name
  // Check if any previous token was successful
  const successfulOriginal = previousTokens.find((t: any) => 
    t.peak_mcap_usd > 10000 || t.token_outcome === 'successful' || t.token_outcome === 'graduated'
  );
  
  if (successfulOriginal) {
    return { 
      isDuplicate: true, 
      blockReason: 'copycat_of_successful_token',
      originalToken: successfulOriginal 
    };
  }
  
  // Check if original is recent and still potentially active (less than 24h old)
  const mostRecent = previousTokens[0];
  const ageHours = mostRecent.first_seen_at 
    ? (Date.now() - new Date(mostRecent.first_seen_at).getTime()) / (1000 * 60 * 60)
    : 999;
  
  if (ageHours < 24 && !mostRecent.is_test_launch) {
    return { 
      isDuplicate: true, 
      blockReason: 'recent_same_name_exists',
      originalToken: mostRecent 
    };
  }
  
  // Previous tokens all failed/tests, allow this one
  return { 
    isDuplicate: false, 
    allowReason: 'previous_versions_failed' 
  };
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
    
    const { action, walletAddress, symbol, creatorWallet, wallets } = await req.json();
    
    switch (action) {
      case 'analyze': {
        // Analyze a single dev wallet
        if (!walletAddress) {
          return new Response(
            JSON.stringify({ error: 'walletAddress required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const analysis = await analyzeDevWallet(walletAddress);
        await saveDevReputation(supabase, analysis);
        
        return new Response(
          JSON.stringify({ success: true, analysis }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      case 'analyze-batch': {
        // Analyze multiple wallets
        if (!wallets || !Array.isArray(wallets)) {
          return new Response(
            JSON.stringify({ error: 'wallets array required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const results: DevAnalysis[] = [];
        for (const wallet of wallets.slice(0, 10)) { // Limit to 10 at a time
          const analysis = await analyzeDevWallet(wallet);
          await saveDevReputation(supabase, analysis);
          results.push(analysis);
        }
        
        return new Response(
          JSON.stringify({ success: true, analyzed: results.length, results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      case 'check-duplicate': {
        // Smart duplicate check
        if (!symbol || !creatorWallet) {
          return new Response(
            JSON.stringify({ error: 'symbol and creatorWallet required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const result = await checkSmartDuplicate(supabase, symbol, creatorWallet);
        
        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      case 'get-reputation': {
        // Get existing reputation from DB
        if (!walletAddress) {
          return new Response(
            JSON.stringify({ error: 'walletAddress required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const { data } = await supabase
          .from('dev_wallet_reputation')
          .select('*')
          .eq('wallet_address', walletAddress)
          .maybeSingle();
        
        if (!data) {
          // No cached reputation, analyze now
          const analysis = await analyzeDevWallet(walletAddress);
          await saveDevReputation(supabase, analysis);
          
          return new Response(
            JSON.stringify({ success: true, cached: false, reputation: analysis }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ success: true, cached: true, reputation: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      case 'backfill-watchlist': {
        // Analyze all unique creator wallets from current watchlist
        const { data: uniqueCreators } = await supabase
          .from('pumpfun_watchlist')
          .select('creator_wallet')
          .not('creator_wallet', 'is', null)
          .limit(100);
        
        const walletSet = new Set((uniqueCreators || []).map((r: any) => r.creator_wallet).filter(Boolean));
        const walletsToAnalyze = Array.from(walletSet);
        
        console.log(`[DevAnalyzer] Backfilling ${walletsToAnalyze.length} unique creators`);
        
        const results: DevAnalysis[] = [];
        for (const wallet of walletsToAnalyze) {
          const analysis = await analyzeDevWallet(wallet);
          await saveDevReputation(supabase, analysis);
          results.push(analysis);
          
          // Rate limit
          await new Promise(r => setTimeout(r, 200));
        }
        
        const spammers = results.filter(r => r.isSerialSpammer).length;
        const testers = results.filter(r => r.isTestLauncher).length;
        const builders = results.filter(r => r.isLegitimateBuilder).length;
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            analyzed: results.length,
            spammers,
            testers,
            builders,
            summary: `Analyzed ${results.length}: ${spammers} spammers, ${testers} test-launchers, ${builders} legit builders`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('[DevAnalyzer] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
