import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('pumpfun-dev-tracker');

/**
 * PUMPFUN DEV TRACKER
 * 
 * Purpose: Update developer wallet reputation based on trade outcomes
 * 
 * Actions:
 * - update_on_success: Called after successful 1.5x sell to boost dev reputation
 * - update_on_rug: Called when a token rugs to penalize dev reputation
 * - analyze_dev_pattern: Analyze dev's sell behavior pattern
 * - link_social_accounts: Link Twitter/Telegram to dev wallet
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

// Calculate new reputation score based on outcomes
function calculateReputationScore(
  tokensSuccessful: number,
  tokensRugged: number,
  tokensAbandoned: number,
  tokensStableAfterDump: number
): number {
  const totalTokens = tokensSuccessful + tokensRugged + tokensAbandoned;
  if (totalTokens === 0) return 50; // Default neutral score

  // Base score from success rate
  const successRate = tokensSuccessful / totalTokens;
  const rugRate = tokensRugged / totalTokens;

  // Score calculation:
  // - 50 base score
  // - +40 max for high success rate
  // - -40 max for high rug rate
  // - +10 bonus for stable_after_dump pattern (good dev behavior)
  let score = 50;
  score += successRate * 40;
  score -= rugRate * 40;
  
  // Bonus for stable_after_dump pattern - indicates good dev
  if (tokensStableAfterDump > 0) {
    const stableBonus = Math.min(tokensStableAfterDump * 5, 15);
    score += stableBonus;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Determine trust level from reputation score
function getTrustLevel(score: number): string {
  if (score >= 80) return 'trusted';
  if (score >= 60) return 'neutral';
  if (score >= 40) return 'suspicious';
  if (score >= 20) return 'avoid';
  return 'blacklisted';
}

// Update dev reputation after successful trade
async function updateOnSuccess(supabase: any, devWallet: string, tokenMint: string): Promise<any> {
  console.log(`[Dev Tracker] Recording success for dev: ${devWallet}, token: ${tokenMint}`);

  // Get or create dev reputation record
  const { data: existing } = await supabase
    .from('dev_wallet_reputation')
    .select('*')
    .eq('wallet_address', devWallet)
    .single();

  const tokensSuccessful = (existing?.tokens_successful || 0) + 1;
  const tokensRugged = existing?.tokens_rugged || 0;
  const tokensAbandoned = existing?.tokens_abandoned || 0;
  const tokensStableAfterDump = existing?.tokens_stable_after_dump || 0;
  const totalTokens = (existing?.total_tokens_launched || 0) + (existing ? 0 : 1);

  const newScore = calculateReputationScore(tokensSuccessful, tokensRugged, tokensAbandoned, tokensStableAfterDump);
  const newTrustLevel = getTrustLevel(newScore);

  const upsertData = {
    wallet_address: devWallet,
    tokens_successful: tokensSuccessful,
    tokens_rugged: tokensRugged,
    tokens_abandoned: tokensAbandoned,
    total_tokens_launched: totalTokens,
    reputation_score: newScore,
    trust_level: newTrustLevel,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('dev_wallet_reputation')
    .upsert(upsertData, { onConflict: 'wallet_address' })
    .select()
    .single();

  if (error) {
    console.error('[Dev Tracker] Upsert error:', error);
    return { error: error.message };
  }

  // Also update token_lifecycle_tracking
  await supabase
    .from('token_lifecycle_tracking')
    .upsert({
      token_mint: tokenMint,
      our_decision: 'bought',
      outcome_type: 'graduated',
      outcome_detected_at: new Date().toISOString(),
      dev_wallet: devWallet,
      dev_action: 'held',
    }, { onConflict: 'token_mint' });

  console.log(`[Dev Tracker] Updated dev ${devWallet}: score ${newScore}, trust ${newTrustLevel}`);
  return { success: true, reputation: data };
}

// Update dev reputation after rug/failure
async function updateOnRug(supabase: any, devWallet: string, tokenMint: string): Promise<any> {
  console.log(`[Dev Tracker] Recording rug for dev: ${devWallet}, token: ${tokenMint}`);

  const { data: existing } = await supabase
    .from('dev_wallet_reputation')
    .select('*')
    .eq('wallet_address', devWallet)
    .single();

  const tokensSuccessful = existing?.tokens_successful || 0;
  const tokensRugged = (existing?.tokens_rugged || 0) + 1;
  const tokensAbandoned = existing?.tokens_abandoned || 0;
  const tokensStableAfterDump = existing?.tokens_stable_after_dump || 0;
  const totalTokens = (existing?.total_tokens_launched || 0) + (existing ? 0 : 1);

  const newScore = calculateReputationScore(tokensSuccessful, tokensRugged, tokensAbandoned, tokensStableAfterDump);
  const newTrustLevel = getTrustLevel(newScore);

  const upsertData = {
    wallet_address: devWallet,
    tokens_successful: tokensSuccessful,
    tokens_rugged: tokensRugged,
    tokens_abandoned: tokensAbandoned,
    total_tokens_launched: totalTokens,
    reputation_score: newScore,
    trust_level: newTrustLevel,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('dev_wallet_reputation')
    .upsert(upsertData, { onConflict: 'wallet_address' })
    .select()
    .single();

  if (error) {
    console.error('[Dev Tracker] Upsert error:', error);
    return { error: error.message };
  }

  // Update token_lifecycle_tracking
  await supabase
    .from('token_lifecycle_tracking')
    .upsert({
      token_mint: tokenMint,
      outcome_type: 'died',
      outcome_detected_at: new Date().toISOString(),
      dev_wallet: devWallet,
      dev_action: 'sold',
    }, { onConflict: 'token_mint' });

  console.log(`[Dev Tracker] Recorded rug for dev ${devWallet}: score ${newScore}, trust ${newTrustLevel}`);
  return { success: true, reputation: data };
}

// Analyze dev's sell pattern on a specific token
async function analyzeDevPattern(supabase: any, devWallet: string, tokenMint: string): Promise<any> {
  console.log(`[Dev Tracker] Analyzing pattern for dev: ${devWallet} on token: ${tokenMint}`);

  try {
    // Fetch dev's transactions on this token from Helius
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusKey) {
      return { error: 'HELIUS_API_KEY not configured' };
    }

    // Get token creation timestamp
    const { data: token } = await supabase
      .from('pumpfun_watchlist')
      .select('created_at_blockchain, market_cap_sol')
      .eq('token_mint', tokenMint)
      .single();

    if (!token) {
      return { error: 'Token not found' };
    }

    // For now, use a simplified pattern detection based on metadata
    // In production, this would fetch actual transaction history
    const { data: tokenData } = await supabase
      .from('pumpfun_watchlist')
      .select('dev_sold, dev_sell_percentage, price_usd, metadata')
      .eq('token_mint', tokenMint)
      .single();

    const devSold = tokenData?.dev_sold || false;
    const sellPct = tokenData?.dev_sell_percentage || 0;
    const currentMcap = tokenData?.metadata?.market_cap_usd || 0;

    // Pattern: "stable_after_dump" = dev sold 50%+ but token still has activity
    const isStableAfterDump = devSold && sellPct >= 50 && currentMcap > 1000;

    if (isStableAfterDump) {
      // Update dev reputation with pattern
      const { data: existing } = await supabase
        .from('dev_wallet_reputation')
        .select('tokens_stable_after_dump')
        .eq('wallet_address', devWallet)
        .single();

      const stableCount = (existing?.tokens_stable_after_dump || 0) + 1;

      await supabase
        .from('dev_wallet_reputation')
        .upsert({
          wallet_address: devWallet,
          tokens_stable_after_dump: stableCount,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' });
    }

    return {
      success: true,
      pattern: {
        devWallet,
        tokenMint,
        devSold,
        sellPercentage: sellPct,
        isStableAfterDump,
        currentMcap,
      }
    };
  } catch (err) {
    console.error('[Dev Tracker] Pattern analysis error:', err);
    return { error: String(err) };
  }
}

// Link social accounts to dev wallet
async function linkSocialAccounts(
  supabase: any,
  devWallet: string,
  twitterHandle?: string,
  telegramGroup?: string
): Promise<any> {
  console.log(`[Dev Tracker] Linking socials for dev: ${devWallet}`);

  // Get existing socials
  const { data: existing } = await supabase
    .from('dev_wallet_reputation')
    .select('twitter_accounts, telegram_groups')
    .eq('wallet_address', devWallet)
    .single();

  const twitterAccounts = new Set<string>(existing?.twitter_accounts || []);
  const telegramGroups = new Set<string>(existing?.telegram_groups || []);

  if (twitterHandle) {
    twitterAccounts.add(twitterHandle.replace('@', '').toLowerCase());
  }
  if (telegramGroup) {
    telegramGroups.add(telegramGroup.toLowerCase());
  }

  const { data, error } = await supabase
    .from('dev_wallet_reputation')
    .upsert({
      wallet_address: devWallet,
      twitter_accounts: Array.from(twitterAccounts),
      telegram_groups: Array.from(telegramGroups),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' })
    .select()
    .single();

  if (error) {
    console.error('[Dev Tracker] Link error:', error);
    return { error: error.message };
  }

  return { success: true, updated: data };
}

// Get dev reputation with full history
async function getDevReputation(supabase: any, devWallet: string): Promise<any> {
  const { data, error } = await supabase
    .from('dev_wallet_reputation')
    .select('*')
    .eq('wallet_address', devWallet)
    .single();

  if (error && error.code !== 'PGRST116') {
    return { error: error.message };
  }

  if (!data) {
    return {
      wallet_address: devWallet,
      reputation_score: 50,
      trust_level: 'unknown',
      total_tokens_launched: 0,
      tokens_successful: 0,
      tokens_rugged: 0,
      tokens_stable_after_dump: 0,
    };
  }

  return data;
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

    const { action, devWallet, tokenMint, twitterHandle, telegramGroup } = await req.json();
    console.log(`[Dev Tracker] Action: ${action}`);

    let result;
    switch (action) {
      case 'update_on_success':
        if (!devWallet || !tokenMint) return errorResponse('Missing devWallet or tokenMint');
        result = await updateOnSuccess(supabase, devWallet, tokenMint);
        break;

      case 'update_on_rug':
        if (!devWallet || !tokenMint) return errorResponse('Missing devWallet or tokenMint');
        result = await updateOnRug(supabase, devWallet, tokenMint);
        break;

      case 'analyze_dev_pattern':
        if (!devWallet || !tokenMint) return errorResponse('Missing devWallet or tokenMint');
        result = await analyzeDevPattern(supabase, devWallet, tokenMint);
        break;

      case 'link_social_accounts':
        if (!devWallet) return errorResponse('Missing devWallet');
        result = await linkSocialAccounts(supabase, devWallet, twitterHandle, telegramGroup);
        break;

      case 'get_reputation':
        if (!devWallet) return errorResponse('Missing devWallet');
        result = await getDevReputation(supabase, devWallet);
        break;

      default:
        return errorResponse(`Unknown action: ${action}`);
    }

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    console.error('[Dev Tracker] Error:', error);
    return errorResponse(String(error), 500);
  }
});
