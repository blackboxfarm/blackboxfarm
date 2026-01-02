import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}

interface AuthorityCheck {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  supplyValid: boolean;
  totalSupply: number;
  details: string;
}

interface HolderAnalysis {
  bundleScore: number;
  holderCount: number;
  top5Percent: number;
  maxSingleWalletPct: number;
  details: any;
}

// Analyze token risk (bundle detection + holder concentration)
async function analyzeTokenRisk(mint: string): Promise<HolderAnalysis> {
  try {
    const response = await fetch(`https://data.solanatracker.io/tokens/${mint}/holders`);
    if (!response.ok) {
      return { bundleScore: 0, holderCount: 0, top5Percent: 0, maxSingleWalletPct: 0, details: { error: 'Failed to fetch holders' } };
    }
    
    const data = await response.json();
    const holders = Array.isArray(data) ? data : (data.holders || []);
    
    if (!Array.isArray(holders) || holders.length === 0) {
      return { bundleScore: 0, holderCount: 0, top5Percent: 0, maxSingleWalletPct: 0, details: { holderCount: 0 } };
    }
    
    // Calculate supply concentration
    const totalSupply = holders.reduce((sum: number, h: any) => sum + (h.amount || 0), 0);
    const top5Holdings = holders.slice(0, 5).reduce((sum: number, h: any) => sum + (h.amount || 0), 0);
    const top5Percent = totalSupply > 0 ? (top5Holdings / totalSupply) * 100 : 0;
    
    // Calculate max single wallet percentage
    const maxHolding = holders.length > 0 ? Math.max(...holders.map((h: any) => h.amount || 0)) : 0;
    const maxSingleWalletPct = totalSupply > 0 ? (maxHolding / totalSupply) * 100 : 0;
    
    // High concentration = higher bundle score
    let bundleScore = 0;
    if (top5Percent > 80) bundleScore = 90;
    else if (top5Percent > 60) bundleScore = 70;
    else if (top5Percent > 40) bundleScore = 50;
    else if (top5Percent > 20) bundleScore = 30;
    else bundleScore = 10;
    
    return {
      bundleScore,
      holderCount: holders.length,
      top5Percent,
      maxSingleWalletPct,
      details: {
        holderCount: holders.length,
        top5Percent: top5Percent.toFixed(2),
        maxSingleWalletPct: maxSingleWalletPct.toFixed(2),
      }
    };
  } catch (error) {
    console.error(`Error analyzing risk for ${mint}:`, error);
    return { bundleScore: 0, holderCount: 0, top5Percent: 0, maxSingleWalletPct: 0, details: { error: String(error) } };
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
async function checkTokenAuthorities(mint: string): Promise<AuthorityCheck> {
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
      return {
        mintAuthorityRevoked: true, // Assume safe if can't check
        freezeAuthorityRevoked: true,
        supplyValid: true,
        totalSupply: 0,
        details: 'RPC error - assuming safe'
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
        details: 'No account data - assuming safe'
      };
    }
    
    const parsed = data.result.value.data.parsed;
    if (!parsed || parsed.type !== 'mint') {
      return {
        mintAuthorityRevoked: true,
        freezeAuthorityRevoked: true,
        supplyValid: true,
        totalSupply: 0,
        details: 'Not a mint account'
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
      details
    };
  } catch (error) {
    console.error(`Error checking authorities for ${mint}:`, error);
    return {
      mintAuthorityRevoked: true, // Assume safe if can't check
      freezeAuthorityRevoked: true,
      supplyValid: true,
      totalSupply: 0,
      details: `Error: ${String(error)}`
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

// Get config from database
async function getConfig(supabase: any) {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
    
  return {
    max_bundle_score: data?.max_bundle_score ?? 70,
    min_holder_count: data?.min_holder_count ?? 10,
    max_token_age_minutes: data?.max_token_age_minutes ?? 60,
    bonding_curve_min: data?.bonding_curve_min ?? 5,
    bonding_curve_max: data?.bonding_curve_max ?? 95,
    require_image: data?.require_image ?? false,
    min_socials_count: data?.min_socials_count ?? 0,
    max_single_wallet_pct: data?.max_single_wallet_pct ?? 15,
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
    
    // Fetch current token data from both APIs + authority check
    const [tokenData, pumpData, authorityCheck] = await Promise.all([
      fetchTokenData(token.token_mint),
      fetchPumpFunData(token.token_mint),
      checkTokenAuthorities(token.token_mint)
    ]);
    
    // Extract price/volume from pump.fun API
    const priceUsd = pumpData?.usd_market_cap && pumpData?.total_supply 
      ? pumpData.usd_market_cap / (pumpData.total_supply / 1e6) 
      : null;
    const volumeSol = pumpData?.volume_24h || 0;
    const marketCapUsd = pumpData?.usd_market_cap || null;
    const liquidityUsd = pumpData?.virtual_sol_reserves
      ? (pumpData.virtual_sol_reserves / 1e9) * (pumpData?.sol_price || 150) 
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
    
    // Analyze bundle risk and holder concentration
    const holderAnalysis = await analyzeTokenRisk(token.token_mint);
    
    // Extract data
    const holderCount = tokenData?.holders || holderAnalysis.holderCount || token.holder_count || 0;
    const marketCapSol = tokenData?.pools?.[0]?.marketCap?.quote || token.market_cap_sol || 0;
    const bondingCurve = pumpData?.bonding_curve_progress 
      ? pumpData.bonding_curve_progress * 100 
      : (tokenData?.pools?.[0]?.curvePercentage || token.bonding_curve_pct || 0);
    
    // Check image and socials (use existing if we have them, otherwise fetch)
    const hasImage = token.has_image ?? isValidImage(token.image_url);
    const socialsCount = token.socials_count ?? [token.twitter_url, token.telegram_url, token.website_url]
      .filter(s => s && s.trim() !== '').length;
    
    // Build rejection reasons array
    const rejectionReasons: string[] = [];
    let isPermanentReject = false;
    
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
    
    // IMAGE CHECK - SOFT (only if required)
    if (config.require_image && !hasImage) {
      rejectionReasons.push('no_image');
    }
    
    // SOCIALS CHECK - SOFT (only if required)
    if (socialsCount < config.min_socials_count) {
      rejectionReasons.push(`low_socials:${socialsCount}<${config.min_socials_count}`);
    }
    
    // Decision log - track all criteria
    const criteria = {
      mintAuthorityRevoked: { value: authorityCheck.mintAuthorityRevoked, required: true, pass: authorityCheck.mintAuthorityRevoked },
      freezeAuthorityRevoked: { value: authorityCheck.freezeAuthorityRevoked, required: true, pass: authorityCheck.freezeAuthorityRevoked },
      supplyValid: { value: authorityCheck.supplyValid, required: true, pass: authorityCheck.supplyValid },
      bundleScore: { value: holderAnalysis.bundleScore, max: config.max_bundle_score, pass: holderAnalysis.bundleScore <= config.max_bundle_score },
      holderCount: { value: holderCount, min: config.min_holder_count, pass: true }, // Not blocking, just tracking
      bondingCurve: { value: bondingCurve, min: config.bonding_curve_min, max: config.bonding_curve_max, 
        pass: bondingCurve >= config.bonding_curve_min && bondingCurve <= config.bonding_curve_max },
      maxSingleWallet: { value: holderAnalysis.maxSingleWalletPct, max: config.max_single_wallet_pct, 
        pass: holderAnalysis.maxSingleWalletPct <= config.max_single_wallet_pct },
      hasImage: { value: hasImage, required: config.require_image, pass: !config.require_image || hasImage },
      socialsCount: { value: socialsCount, min: config.min_socials_count, pass: socialsCount >= config.min_socials_count },
    };
    
    console.log(`   📋 DECISION CRITERIA:`);
    console.log(`      Mint Authority Revoked: ${authorityCheck.mintAuthorityRevoked} ${criteria.mintAuthorityRevoked.pass ? '✅' : '⛔'}`);
    console.log(`      Freeze Authority Revoked: ${authorityCheck.freezeAuthorityRevoked} ${criteria.freezeAuthorityRevoked.pass ? '✅' : '⛔'}`);
    console.log(`      Supply Valid: ${authorityCheck.supplyValid} ${criteria.supplyValid.pass ? '✅' : '⛔'}`);
    console.log(`      Bundle Score: ${holderAnalysis.bundleScore} (max: ${config.max_bundle_score}) ${criteria.bundleScore.pass ? '✅' : '❌'}`);
    console.log(`      Max Single Wallet: ${holderAnalysis.maxSingleWalletPct.toFixed(1)}% (max: ${config.max_single_wallet_pct}%) ${criteria.maxSingleWallet.pass ? '✅' : '❌'}`);
    console.log(`      Holders: ${holderCount} (tracking, min for qual: ${config.min_holder_count})`);
    console.log(`      Bonding Curve: ${bondingCurve.toFixed(1)}% (range: ${config.bonding_curve_min}-${config.bonding_curve_max}%) ${criteria.bondingCurve.pass ? '✅' : '⚠️'}`);
    console.log(`      Has Image: ${hasImage} (required: ${config.require_image}) ${criteria.hasImage.pass ? '✅' : '❌'}`);
    console.log(`      Socials: ${socialsCount} (min: ${config.min_socials_count}) ${criteria.socialsCount.pass ? '✅' : '❌'}`);
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
      // Promote to watching with reason
      const promotionReason = `bundle:${holderAnalysis.bundleScore}/${config.max_bundle_score}, holders:${holderCount}, bc:${bondingCurve.toFixed(0)}%, maxWallet:${holderAnalysis.maxSingleWalletPct.toFixed(1)}%`;
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
          last_checked_at: new Date().toISOString(),
          created_at_blockchain: createdAt ? new Date(createdAt * 1000).toISOString() : null,
          qualification_reason: promotionReason, // Store the promotion criteria for reference
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
