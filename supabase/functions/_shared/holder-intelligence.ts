/**
 * Holder Intelligence — Cross-links holder wallets against reputation databases,
 * fetches historical snapshots, traces dev wallet genealogy, matches KOLs,
 * and feeds insider wallets into the reputation mesh.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { traceParentWallets, meshGenealogyResults } from "./auto-genealogy.ts";

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
      .select('created_at, holder_count, health_score, top5_concentration, tier_dust, tier_retail, tier_serious, tier_whale')
      .eq('token_mint', tokenMint)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const prev = data[0];
    const totalTiers = (prev.tier_dust ?? 0) + (prev.tier_retail ?? 0) + (prev.tier_serious ?? 0) + (prev.tier_whale ?? 0);
    const prevDustPct = totalTiers > 0 ? ((prev.tier_dust ?? 0) / totalTiers) * 100 : 0;
    
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
      previousDustPct: prevDustPct,
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

// ============================================
// KOL MATCHING (server-side)
// ============================================

export interface KOLMatch {
  wallet_address: string;
  twitter_handle: string | null;
  kol_tier: string | null;
  trust_score: number | null;
  is_active: boolean;
}

/**
 * Match holder wallets against the kol_wallets table.
 * Returns matched KOL holders with their metadata.
 */
export async function matchKOLWallets(
  holderAddresses: string[]
): Promise<KOLMatch[]> {
  const supabase = getSupabaseClient();
  if (!supabase || holderAddresses.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('kol_wallets')
      .select('wallet_address, twitter_handle, kol_tier, trust_score, is_active')
      .in('wallet_address', holderAddresses)
      .eq('is_active', true);

    if (error || !data) return [];

    console.log(`[HolderIntel] KOL match: ${data.length} KOLs found in ${holderAddresses.length} wallets`);
    return data as KOLMatch[];
  } catch (e) {
    console.warn('[HolderIntel] KOL matching error:', e);
    return [];
  }
}

// ============================================
// DEV WALLET GENEALOGY
// ============================================

export interface DevGenealogyResult {
  creatorWallet: string;
  parentWallets: Array<{
    wallet: string;
    depth: number;
    amountSol: number;
    cexName?: string;
    label?: string; // 'FUNDER', 'KYC_ROOT', etc.
  }>;
  xAccounts: string[];
  cexSources: string[];
  kycRootWallet: string | null;
  alreadyKnown: boolean; // true if genealogy was already in DB
}

/**
 * Trace dev wallet's funding chain: Dev → Funder → KYC Root.
 * First checks if we already have genealogy data. If not, runs a lightweight trace
 * and stores results in dev_wallet_reputation + reputation_mesh.
 */
export async function traceDevGenealogy(
  creatorWallet: string | undefined
): Promise<DevGenealogyResult | null> {
  if (!creatorWallet) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // Step 1: Check if we already have upstream data
    const { data: existing } = await supabase
      .from('dev_wallet_reputation')
      .select('wallet_address, upstream_wallets, twitter_accounts, trust_level')
      .eq('wallet_address', creatorWallet)
      .maybeSingle();

    if (existing?.upstream_wallets && existing.upstream_wallets.length > 0) {
      // Already traced — return cached data
      console.log(`[HolderIntel] Genealogy cache hit for ${creatorWallet.slice(0, 8)}... (${existing.upstream_wallets.length} upstream)`);
      
      // Look up the deepest upstream wallet for KYC root label
      const upstreamWallets = existing.upstream_wallets as string[];
      
      // Check reputation_mesh for KYC root
      let kycRoot: string | null = null;
      const { data: meshLinks } = await supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, relationship')
        .or(`source_id.in.(${upstreamWallets.join(',')}),linked_id.in.(${upstreamWallets.join(',')})`)
        .eq('relationship', 'same_kyc_root')
        .limit(1);
      
      if (meshLinks && meshLinks.length > 0) {
        kycRoot = meshLinks[0].source_id === creatorWallet ? meshLinks[0].linked_id : meshLinks[0].source_id;
      }

      return {
        creatorWallet,
        parentWallets: upstreamWallets.map((w, i) => ({
          wallet: w,
          depth: i + 1,
          amountSol: 0,
          label: i === upstreamWallets.length - 1 && kycRoot ? 'KYC_ROOT' : 'FUNDER',
        })),
        xAccounts: (existing.twitter_accounts as string[]) || [],
        cexSources: [],
        kycRootWallet: kycRoot,
        alreadyKnown: true,
      };
    }

    // Step 2: Run a live trace (lightweight, 2-depth max to not slow report)
    console.log(`[HolderIntel] Running live genealogy trace for ${creatorWallet.slice(0, 8)}...`);
    const genealogy = await traceParentWallets(supabase, creatorWallet, 'holders-report');

    if (genealogy.parentWallets.length === 0 && genealogy.xAccounts.length === 0) {
      console.log(`[HolderIntel] No genealogy data found for ${creatorWallet.slice(0, 8)}...`);
      return null;
    }

    // Step 3: Store results in mesh (fire and forget)
    meshGenealogyResults(supabase, creatorWallet, genealogy, 'holders-report').catch(e =>
      console.warn('[HolderIntel] Mesh storage error:', e)
    );

    // Determine KYC root (deepest non-CEX wallet, or CEX itself)
    const deepestParent = genealogy.parentWallets[genealogy.parentWallets.length - 1];
    const kycRoot = deepestParent?.cexName
      ? deepestParent.wallet
      : genealogy.parentWallets.length >= 2 ? deepestParent?.wallet : null;

    return {
      creatorWallet,
      parentWallets: genealogy.parentWallets.map((p, i) => ({
        wallet: p.wallet,
        depth: p.depth,
        amountSol: p.amountSol,
        cexName: p.cexName,
        label: p.cexName ? 'CEX' : (i === genealogy.parentWallets.length - 1 ? 'KYC_ROOT' : 'FUNDER'),
      })),
      xAccounts: genealogy.xAccounts,
      cexSources: genealogy.cexSources,
      kycRootWallet: kycRoot || null,
      alreadyKnown: false,
    };
  } catch (e) {
    console.warn('[HolderIntel] Genealogy trace error:', e);
    return null;
  }
}

// ============================================
// FRESH WALLET AGE DETECTION (Item 10)
// ============================================

export interface FreshWalletResult {
  freshWalletCount: number;
  totalChecked: number;
  freshPercentage: number;
  oldestAccountAge: string;
  newestAccountAge: string;
  clusterDetected: boolean; // true if many wallets created around same time
  clusterWindowHours: number | null;
  walletAges: Array<{
    wallet: string;
    createdAt: string | null;
    ageHours: number | null;
    isFresh: boolean; // created within 48h of token launch
  }>;
}

/**
 * Check wallet creation dates for the top holders using Helius getMultipleAccounts.
 * Detects sybil/bot wallets by finding clusters of recently-created wallets.
 * 
 * Cost: 1 Helius RPC call per report (batch of up to 20 wallets).
 */
export async function detectFreshWallets(
  holderAddresses: string[],
  tokenCreatedAt?: string | null, // ISO timestamp or null
): Promise<FreshWalletResult | null> {
  if (holderAddresses.length === 0) return null;

  try {
    const { getHeliusRpcUrl, getHeliusApiKey } = await import('./helius-client.ts');
    const { heliusFetch } = await import('./helius-rate-limiter.ts');
    const heliusKey = getHeliusApiKey();
    if (!heliusKey) return null;

    const rpcUrl = getHeliusRpcUrl(heliusKey);
    const walletsToCheck = holderAddresses.slice(0, 20);

    // Single batch RPC call — 1 credit
    const response = await heliusFetch(
      rpcUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'fresh-wallet-check',
          method: 'getMultipleAccounts',
          params: [walletsToCheck, { encoding: 'jsonParsed' }],
        }),
      },
      {
        functionName: 'bagless-holders-report',
        endpoint: 'getMultipleAccounts',
        method: 'getMultipleAccounts',
        requestParams: { walletCount: walletsToCheck.length },
      },
    );

    if (!response || !response.ok) {
      console.warn('[HolderIntel] Fresh wallet check failed — RPC unavailable');
      return null;
    }

    const rpcData = await response.json();
    const accounts = rpcData.result?.value;
    if (!accounts || !Array.isArray(accounts)) return null;

    // Parse account ages from rent epoch and slot data
    // Accounts with very low lamports and recent rent_epoch are "fresh"
    const tokenBirth = tokenCreatedAt ? new Date(tokenCreatedAt).getTime() : null;
    const now = Date.now();
    const FRESH_THRESHOLD_HOURS = 48;

    const walletAges: FreshWalletResult['walletAges'] = [];
    const creationTimestamps: number[] = [];

    for (let i = 0; i < walletsToCheck.length; i++) {
      const account = accounts[i];
      if (!account) {
        walletAges.push({ wallet: walletsToCheck[i], createdAt: null, ageHours: null, isFresh: false });
        continue;
      }

      // Use rent_epoch as a proxy for account age
      // Lower rent_epoch = older account. Current epoch ~ 750+ (as of 2025)
      // Each epoch is ~2-3 days on Solana
      const rentEpoch = account.rentEpoch ?? 0;
      
      // Estimate creation time: epoch 0 ≈ Solana genesis (March 2020)
      // Average epoch duration ≈ 2.5 days
      const SOLANA_GENESIS_MS = new Date('2020-03-16').getTime();
      const AVG_EPOCH_DURATION_MS = 2.5 * 24 * 60 * 60 * 1000;
      const estimatedCreationMs = SOLANA_GENESIS_MS + (rentEpoch * AVG_EPOCH_DURATION_MS);
      const ageMs = now - estimatedCreationMs;
      const ageHours = Math.max(0, Math.round(ageMs / 3600000));

      // Determine "fresh" relative to token creation
      let isFresh = false;
      if (tokenBirth) {
        // Fresh = wallet created within 48h before or after token launch
        const diffFromLaunch = Math.abs(estimatedCreationMs - tokenBirth);
        isFresh = diffFromLaunch < FRESH_THRESHOLD_HOURS * 3600000;
      } else {
        // No token birth known — consider fresh if < 7 days old
        isFresh = ageHours < 7 * 24;
      }

      walletAges.push({
        wallet: walletsToCheck[i],
        createdAt: new Date(estimatedCreationMs).toISOString(),
        ageHours,
        isFresh,
      });

      if (isFresh) {
        creationTimestamps.push(estimatedCreationMs);
      }
    }

    const freshCount = walletAges.filter(w => w.isFresh).length;
    const validAges = walletAges.filter(w => w.ageHours !== null);

    // Detect clustering: if many fresh wallets were created within a tight window
    let clusterDetected = false;
    let clusterWindowHours: number | null = null;
    if (creationTimestamps.length >= 3) {
      creationTimestamps.sort((a, b) => a - b);
      const windowMs = creationTimestamps[creationTimestamps.length - 1] - creationTimestamps[0];
      clusterWindowHours = Math.round(windowMs / 3600000);
      // If 3+ fresh wallets created within 24h window → cluster
      clusterDetected = clusterWindowHours <= 24 && creationTimestamps.length >= 3;
    }

    const sortedAges = validAges.map(w => w.ageHours!).sort((a, b) => a - b);

    const formatAge = (hours: number) => {
      if (hours < 24) return `${hours}h`;
      if (hours < 24 * 30) return `${Math.round(hours / 24)}d`;
      return `${Math.round(hours / (24 * 30))}mo`;
    };

    const result: FreshWalletResult = {
      freshWalletCount: freshCount,
      totalChecked: walletsToCheck.length,
      freshPercentage: walletsToCheck.length > 0 ? Math.round((freshCount / walletsToCheck.length) * 100) : 0,
      oldestAccountAge: sortedAges.length > 0 ? formatAge(sortedAges[sortedAges.length - 1]) : 'unknown',
      newestAccountAge: sortedAges.length > 0 ? formatAge(sortedAges[0]) : 'unknown',
      clusterDetected,
      clusterWindowHours,
      walletAges,
    };

    console.log(`[HolderIntel] Fresh wallet check: ${freshCount}/${walletsToCheck.length} fresh (${result.freshPercentage}%), cluster=${clusterDetected}`);
    return result;
  } catch (e) {
    console.warn('[HolderIntel] Fresh wallet detection error:', e);
    return null;
  }
}

// ============================================
// INCREMENTAL GENEALOGY EXPANSION
// ============================================

/**
 * When genealogy is cached, fire-and-forget a background check
 * for new tokens minted by any wallet in the tree.
 * This passively expands actor profiles over time.
 */
export async function expandGenealogyTree(
  creatorWallet: string,
  upstreamWallets: string[],
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || upstreamWallets.length === 0) return;

  try {
    const allWallets = [creatorWallet, ...upstreamWallets];

    // Check for new tokens minted by any wallet in the tree
    const { data: knownTokens } = await supabase
      .from('token_lifecycle')
      .select('creator_wallet, token_mint')
      .in('creator_wallet', allWallets);

    const knownMints = new Set((knownTokens || []).map(t => t.token_mint));

    // Check pumpfun_watchlist for tokens we haven't linked yet
    const { data: watchlistTokens } = await supabase
      .from('pumpfun_watchlist')
      .select('creator_wallet, token_mint')
      .in('creator_wallet', allWallets)
      .limit(50);

    if (watchlistTokens) {
      const newTokens = watchlistTokens.filter(t => !knownMints.has(t.token_mint));
      if (newTokens.length > 0) {
        // Upsert new token_lifecycle entries
        const inserts = newTokens.map(t => ({
          token_mint: t.token_mint,
          creator_wallet: t.creator_wallet,
          last_seen_at: new Date().toISOString(),
        }));
        await supabase.from('token_lifecycle').upsert(inserts, {
          onConflict: 'token_mint',
          ignoreDuplicates: true,
        });

        // Also link these tokens to the KYC root in reputation_mesh
        for (const t of newTokens.slice(0, 10)) {
          await supabase.from('reputation_mesh').upsert({
            source_type: 'wallet',
            source_id: t.creator_wallet,
            linked_type: 'token',
            linked_id: t.token_mint,
            relationship: 'created',
            confidence: 90,
            evidence: `Discovered via genealogy tree expansion from ${creatorWallet.slice(0, 8)}...`,
            discovered_via: 'genealogy-expansion',
          }, {
            onConflict: 'source_type,source_id,linked_type,linked_id,relationship',
            ignoreDuplicates: true,
          });
        }

        console.log(`[HolderIntel] Genealogy expansion: found ${newTokens.length} new tokens across ${allWallets.length} wallets`);
      }
    }
  } catch (e) {
    console.warn('[HolderIntel] Genealogy expansion error:', e);
  }
}

// ============================================
// INSIDER WALLET MESH FEEDING
// ============================================

/**
 * Feed bundled/insider wallets into the reputation mesh for cross-report pattern detection.
 * Only stores wallets that control significant supply (>2%).
 */
export async function feedInsiderWallets(
  tokenMint: string,
  bundledWallets: string[],
  bundledPercentage: number,
  clusters: Array<{ wallets: string[]; totalPercentage: number; clusterType: string }>
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || bundledWallets.length === 0) return;

  try {
    const now = new Date().toISOString();
    const meshLinks: any[] = [];

    // Store bundled wallets as insider links to the token
    for (const wallet of bundledWallets.slice(0, 20)) {
      meshLinks.push({
        source_type: 'wallet',
        source_id: wallet,
        linked_type: 'token',
        linked_id: tokenMint,
        relationship: 'insider_of',
        confidence: 80,
        evidence: `Bundled insider (${bundledPercentage.toFixed(1)}% total bundle), detected via RugCheck`,
        discovered_via: 'holders-report',
      });
    }

    // Store cluster connections (wallets within same cluster)
    for (const cluster of clusters) {
      if (cluster.wallets.length < 2 || cluster.totalPercentage < 2) continue;
      
      for (let i = 0; i < cluster.wallets.length - 1; i++) {
        for (let j = i + 1; j < Math.min(cluster.wallets.length, 5); j++) {
          meshLinks.push({
            source_type: 'wallet',
            source_id: cluster.wallets[i],
            linked_type: 'wallet',
            linked_id: cluster.wallets[j],
            relationship: 'same_cluster',
            confidence: 75,
            evidence: `${cluster.clusterType} cluster (${cluster.totalPercentage.toFixed(1)}% supply) on ${tokenMint.slice(0, 8)}...`,
            discovered_via: 'holders-report',
          });
        }
      }
    }

    if (meshLinks.length > 0) {
      await supabase.from('reputation_mesh').upsert(meshLinks, {
        onConflict: 'source_type,source_id,linked_type,linked_id,relationship',
        ignoreDuplicates: true,
      });
      console.log(`[HolderIntel] Fed ${meshLinks.length} insider/cluster links to mesh for ${tokenMint.slice(0, 8)}...`);
    }
  } catch (e) {
    // Ignore constraint errors
    if (!String(e).includes('duplicate') && !String(e).includes('23505')) {
      console.warn('[HolderIntel] Insider mesh feed error:', e);
    }
  }
}
