/**
 * Holder Intelligence — Cross-links holder wallets against reputation databases
 * and fetches historical snapshot data for delta analysis.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://apxauapuusmgwbbzjgfl.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

export interface FlaggedHolder {
  wallet_address: string;
  trust_level: string | null;
  tokens_rugged: number | null;
  tokens_launched: number | null;
  reputation_score: number | null;
  dev_pattern: string | null;
  auto_blacklisted: boolean | null;
  is_blacklisted: boolean;
  source: 'reputation' | 'blacklist' | 'both';
}

export interface HistoricalDelta {
  previousHolderCount: number;
  holderCountChange: number;
  previousHealthScore: number;
  healthScoreChange: number;
  previousDustPct: number;
  dustPctChange: number;
  previousTop5Pct: number;
  top5PctChange: number;
  snapshotAge: string; // e.g. "2 hours ago", "3 days ago"
  snapshotTimestamp: string;
}

/**
 * Cross-reference top holder wallets against dev_wallet_reputation and pumpfun_blacklist.
 * Returns flagged holders with their reputation data.
 */
export async function crossLinkHolderReputation(
  holderAddresses: string[]
): Promise<FlaggedHolder[]> {
  const supabase = getSupabaseClient();
  if (!supabase || holderAddresses.length === 0) return [];

  try {
    // Query both tables in parallel
    const [repResult, blacklistResult] = await Promise.all([
      supabase
        .from('dev_wallet_reputation')
        .select('wallet_address, trust_level, tokens_rugged, total_tokens_launched, reputation_score, dev_pattern, auto_blacklisted')
        .in('wallet_address', holderAddresses),
      supabase
        .from('pumpfun_blacklist')
        .select('wallet_address')
        .in('wallet_address', holderAddresses),
    ]);

    const repMap = new Map<string, any>();
    if (repResult.data) {
      for (const r of repResult.data) {
        repMap.set(r.wallet_address, r);
      }
    }

    const blacklistSet = new Set<string>();
    if (blacklistResult.data) {
      for (const b of blacklistResult.data) {
        blacklistSet.add(b.wallet_address);
      }
    }

    const flagged: FlaggedHolder[] = [];

    // Merge results
    const allWallets = new Set([...repMap.keys(), ...blacklistSet]);
    for (const wallet of allWallets) {
      const rep = repMap.get(wallet);
      const isBlacklisted = blacklistSet.has(wallet);
      const inRep = !!rep;

      // Only flag if actually suspicious
      const isSuspicious = isBlacklisted ||
        (rep?.trust_level && ['scammer', 'blacklisted', 'serial_rugger', 'suspicious'].includes(rep.trust_level)) ||
        (rep?.tokens_rugged && rep.tokens_rugged > 0) ||
        (rep?.auto_blacklisted === true);

      if (isSuspicious) {
        flagged.push({
          wallet_address: wallet,
          trust_level: rep?.trust_level ?? null,
          tokens_rugged: rep?.tokens_rugged ?? null,
          tokens_launched: rep?.total_tokens_launched ?? null,
          reputation_score: rep?.reputation_score ?? null,
          dev_pattern: rep?.dev_pattern ?? null,
          auto_blacklisted: rep?.auto_blacklisted ?? null,
          is_blacklisted: isBlacklisted,
          source: inRep && isBlacklisted ? 'both' : isBlacklisted ? 'blacklist' : 'reputation',
        });
      }
    }

    console.log(`[HolderIntel] Checked ${holderAddresses.length} wallets → ${flagged.length} flagged`);
    return flagged;
  } catch (e) {
    console.warn('[HolderIntel] Reputation cross-link error:', e);
    return [];
  }
}

/**
 * Fetch the most recent prior search result for this token to compute deltas.
 */
export async function fetchHistoricalDelta(
  tokenMint: string
): Promise<HistoricalDelta | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('token_search_results')
      .select('created_at, holder_count, health_score, top5_concentration, tier_dust')
      .eq('token_mint', tokenMint)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const prev = data[0];
    const snapshotDate = new Date(prev.created_at);
    const ageMs = Date.now() - snapshotDate.getTime();
    const ageHours = Math.floor(ageMs / 3600000);
    
    let snapshotAge: string;
    if (ageHours < 1) snapshotAge = 'less than 1 hour ago';
    else if (ageHours < 24) snapshotAge = `${ageHours} hours ago`;
    else snapshotAge = `${Math.floor(ageHours / 24)} days ago`;

    return {
      previousHolderCount: prev.holder_count ?? 0,
      holderCountChange: 0, // Will be computed by caller
      previousHealthScore: prev.health_score ?? 0,
      healthScoreChange: 0,
      previousDustPct: prev.tier_dust ?? 0,
      dustPctChange: 0,
      previousTop5Pct: prev.top5_concentration ?? 0,
      top5PctChange: 0,
      snapshotAge,
      snapshotTimestamp: prev.created_at,
    };
  } catch (e) {
    console.warn('[HolderIntel] Historical delta error:', e);
    return null;
  }
}

/**
 * Upsert creator wallet into token_lifecycle for passive intelligence building.
 */
export async function feedTokenLifecycle(
  tokenMint: string,
  creatorWallet: string | undefined,
  symbol: string | undefined,
  launchpadName: string | undefined
): Promise<void> {
  if (!creatorWallet) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    await supabase.from('token_lifecycle').upsert({
      token_mint: tokenMint,
      creator_wallet: creatorWallet,
      symbol: symbol || null,
      launchpad: launchpadName || null,
      last_seen_at: new Date().toISOString(),
    }, {
      onConflict: 'token_mint',
      ignoreDuplicates: false,
    });
    console.log(`[HolderIntel] Token lifecycle updated for ${tokenMint.slice(0, 8)}...`);
  } catch (e) {
    // Ignore errors — table may not exist yet
    if (!String(e).includes('does not exist')) {
      console.warn('[HolderIntel] Token lifecycle upsert error:', e);
    }
  }
}

/**
 * Detect social link changes (e.g. Twitter removed since last scan).
 */
export async function detectSocialChanges(
  tokenMint: string,
  currentSocials: { twitter?: string; telegram?: string; website?: string; discord?: string }
): Promise<string[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data } = await supabase
      .from('token_socials_history')
      .select('twitter, telegram, website, discord, created_at')
      .eq('token_mint', tokenMint)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!data || data.length === 0) return [];

    const prev = data[0];
    const warnings: string[] = [];

    if (prev.twitter && !currentSocials.twitter) {
      warnings.push('Twitter/X removed since last scan');
    }
    if (prev.website && !currentSocials.website) {
      warnings.push('Website removed since last scan');
    }
    if (prev.telegram && !currentSocials.telegram) {
      warnings.push('Telegram removed since last scan');
    }

    return warnings;
  } catch (e) {
    return [];
  }
}
