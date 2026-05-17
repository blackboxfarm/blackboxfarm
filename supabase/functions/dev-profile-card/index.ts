// dev-profile-card: aggregates everything we know about a developer wallet
// into a single dossier for the Dev Profile "trading card" modal.
//
// GET / POST  ?wallet=<base58> | body { wallet: "..." }
//
// Joins:
//   allstar_dev_registry, dev_wallet_reputation, dev_reputation_v2,
//   proven_dev_tokens (top 5 by ATH), launchpad_creator_profiles,
//   x_account_registry (handle, followers, display name).
//
// Best-effort enriches with KOLscan handle (24h TTL) — fail-open per
// the Security Guards Policy.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function isBase58(s: string): boolean {
  return typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * Look up KOL status from the internal pumpfun_kol_registry. This registry
 * is maintained by `kol-registry-sync` / `pumpfun-kol-registry` on a 24h
 * cadence and is sourced from kolscan.io's leaderboard — so we never have
 * to scrape kolscan HTML at request time.
 *
 * Match priority:
 *   1) the dev wallet itself
 *   2) any wallet in the dev's family (linked/family wallets)
 *   3) the dev's X handle (after stripping @)
 */
async function lookupKol(
  supabase: ReturnType<typeof createClient>,
  devWallet: string,
  familyWallets: string[],
  handleCandidates: string[],
): Promise<any | null> {
  const select =
    'wallet_address, twitter_handle, twitter_followers, kolscan_rank, kolscan_last_rank, kolscan_weekly_score, display_name, kol_tier, trust_score, source, is_active';

  // 1) direct wallet match
  const { data: direct } = await supabase
    .from('pumpfun_kol_registry')
    .select(select)
    .eq('wallet_address', devWallet)
    .maybeSingle();
  if (direct) return { ...direct, matchedVia: 'wallet', matchedWallet: devWallet };

  // 2) family wallet match
  const fam = (familyWallets || []).filter((w) => w && w !== devWallet);
  if (fam.length) {
    const { data: famHit } = await supabase
      .from('pumpfun_kol_registry')
      .select(select)
      .in('wallet_address', fam.slice(0, 50))
      .order('kolscan_rank', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (famHit) return { ...famHit, matchedVia: 'family', matchedWallet: (famHit as any).wallet_address };
  }

  // 3) handle match
  const clean = Array.from(new Set(handleCandidates.map((h) => String(h || '').replace(/^@/, '').trim()).filter(Boolean)));
  if (clean.length) {
    const { data: handleHit } = await supabase
      .from('pumpfun_kol_registry')
      .select(select)
      .ilike('twitter_handle', clean[0])
      .maybeSingle();
    if (handleHit) return { ...handleHit, matchedVia: 'handle', matchedWallet: (handleHit as any).wallet_address };
  }

  return null;
}

function verdict(rep: any, allstar: any, topTokens: any[]): string {
  const t = rep?.total_tokens_launched ?? 0;
  const r = rep?.tokens_rugged ?? 0;
  const successPct = rep?.success_rate_pct ?? null;
  const tier = allstar?.best_tier ?? null;
  const bestSym = allstar?.best_token_symbol || topTokens[0]?.symbol;
  const bestMcap = allstar?.best_mcap_achieved || topTokens[0]?.market_cap_ath;

  if (rep?.auto_blacklisted) return `Auto-blacklisted — ${r}/${t} rugs detected. Do not trust.`;
  if (rep?.is_serial_spammer) return `Serial spammer — ${t} mints, ${r} rugs. Likely throwaway dev.`;
  if (tier && tier >= 6) return `Proven big-launch dev — T${tier} from $${bestSym} (ATH $${Number(bestMcap||0).toLocaleString()}).`;
  if (tier && tier >= 4) return `Mid-tier proven dev — T${tier} from $${bestSym}.`;
  if (tier) return `Early-tier proven dev — T${tier}, watching for repeat.`;
  if (rep?.is_legitimate_builder) return `Legitimate builder — ${successPct ?? '?'}% success across ${t} tokens.`;
  if (t === 0) return `New / unknown wallet — no prior launch history.`;
  return `Neutral — ${t} launches, ${r} rugs, ${successPct ?? '?'}% success.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let wallet = url.searchParams.get('wallet') || '';
    if (!wallet && (req.method === 'POST' || req.method === 'PUT')) {
      const body = await req.json().catch(() => ({}));
      wallet = body?.wallet || '';
    }
    if (!isBase58(wallet)) {
      return new Response(JSON.stringify({ error: 'Invalid wallet' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Parallel base queries
    const [allstarRes, repRes, repV2Res, tokensRes, lpRes] = await Promise.all([
      supabase.from('allstar_dev_registry').select('*').eq('master_wallet', wallet).maybeSingle(),
      supabase.from('dev_wallet_reputation').select('*').eq('wallet_address', wallet).maybeSingle(),
      supabase.from('dev_reputation_v2').select('*').eq('wallet_address', wallet).maybeSingle(),
      supabase.from('proven_dev_tokens').select('*').eq('dev_wallet', wallet).order('market_cap_ath', { ascending: false }).limit(5),
      supabase.from('launchpad_creator_profiles').select('*').eq('creator_wallet', wallet),
    ]);

    const allstar = allstarRes.data;
    const rep = repRes.data;
    const repV2 = repV2Res.data;
    const topTokens = tokensRes.data || [];
    const launchpadProfiles = lpRes.data || [];

    // X profile — try registry by handle from allstar OR by any twitter handle in dev_wallet_reputation
    const handleCandidates: string[] = [];
    if (allstar?.twitter_handle) handleCandidates.push(String(allstar.twitter_handle).replace(/^@/, ''));
    for (const h of (rep?.twitter_accounts || [])) {
      if (h) handleCandidates.push(String(h).replace(/^@/, ''));
    }
    for (const lp of launchpadProfiles) {
      if (lp.linked_x_account) handleCandidates.push(String(lp.linked_x_account).replace(/^@/, ''));
    }
    let xProfile: any = null;
    if (handleCandidates.length) {
      const { data: xp } = await supabase
        .from('x_account_registry')
        .select('current_handle, display_name, followers_count, followers_fetched_at, handle_history, name_history, is_verified, linked_token_count')
        .ilike('current_handle', handleCandidates[0])
        .maybeSingle();
      xProfile = xp || null;
    }

    // KOL enrichment — internal pumpfun_kol_registry (no live scraping).
    const familyWallets: string[] = [
      ...(allstar?.family_wallets || []),
      ...((rep?.linked_wallets as string[] | undefined) || []),
    ];
    const kolRow = await lookupKol(supabase, wallet, familyWallets, handleCandidates);
    const kolscanHandle: string | null =
      kolRow?.twitter_handle || kolRow?.display_name || rep?.kolscan_handle || null;

    const dossier = {
      wallet,
      verdict: verdict(rep, allstar, topTokens),
      tier: allstar?.best_tier ?? null,
      identity: {
        displayName: xProfile?.display_name || null,
        xHandle: xProfile?.current_handle || handleCandidates[0] || null,
        xFollowers: xProfile?.followers_count ?? null,
        xVerified: xProfile?.is_verified ?? false,
        handleHistory: xProfile?.handle_history || [],
        nameHistory: xProfile?.name_history || [],
        linkedTokenCount: xProfile?.linked_token_count ?? null,
        knownAliases: rep?.known_aliases || [],
      },
      walletGraph: {
        masterWallet: wallet,
        kycRootWallet: allstar?.kyc_root_wallet || rep?.trail_end_kyc_root || null,
        familySize: allstar?.total_wallet_family_size ?? (rep?.linked_wallets?.length ?? 1),
        familyWallets: allstar?.family_wallets || [],
        linkedWallets: rep?.linked_wallets || [],
        upstreamWallets: rep?.upstream_wallets || [],
        downstreamWallets: rep?.downstream_wallets || [],
      },
      bestTokens: topTokens.map((t: any) => ({
        mint: t.token_mint,
        symbol: t.symbol,
        name: t.name,
        tier: t.tier,
        athMcap: t.market_cap_ath,
        athAt: t.ath_timestamp,
        mintedAt: t.mint_timestamp,
        isTierDefining: allstar?.best_token_mint && t.token_mint === allstar.best_token_mint,
      })),
      careerStats: {
        totalLaunched: rep?.total_tokens_launched ?? null,
        successful: rep?.tokens_successful ?? null,
        graduated: rep?.tokens_graduated ?? null,
        rugged: rep?.tokens_rugged ?? null,
        abandoned: rep?.tokens_abandoned ?? null,
        successRatePct: rep?.success_rate_pct ?? null,
        avgPeakMcapUsd: rep?.avg_peak_mcap_usd ?? null,
        avgLifespanMins: rep?.avg_token_lifespan_mins ?? null,
        typicalSellPct: rep?.typical_sell_percentage ?? null,
        trustLevel: rep?.trust_level || 'unknown',
        reputationScore: rep?.reputation_score ?? null,
        compositeScore: repV2?.composite ?? null,
        archetype: repV2?.archetype ?? null,
        patterns: {
          spikeKill: !!rep?.pattern_spike_kill,
          walletWasher: !!rep?.pattern_wallet_washer,
          buybackDev: !!rep?.pattern_buyback_dev,
          washBundler: !!rep?.pattern_wash_bundler,
          hiddenWhale: !!rep?.pattern_hidden_whale,
          diamondDev: !!rep?.pattern_diamond_dev,
        },
        flags: {
          isLegitBuilder: !!rep?.is_legitimate_builder,
          isSerialSpammer: !!rep?.is_serial_spammer,
          isTestLauncher: !!rep?.is_test_launcher,
          autoBlacklisted: !!rep?.auto_blacklisted,
        },
      },
      social: {
        twitterAccounts: rep?.twitter_accounts || [],
        telegramGroups: rep?.telegram_groups || [],
        discordServers: rep?.discord_servers || [],
      },
      launchpadProfiles: launchpadProfiles.map((lp: any) => ({
        platform: lp.platform,
        username: lp.platform_username,
        profileUrl: lp.profile_url,
        tokensCreated: lp.tokens_created,
        tokensGraduated: lp.tokens_graduated,
        tokensRugged: lp.tokens_rugged,
        linkedX: lp.linked_x_account,
      })),
      kolscan: kolscanHandle ? {
        handle: kolscanHandle,
        url: `https://kolscan.io/account/${kolRow?.matchedWallet || wallet}`,
      } : null,
      kol: {
        isKol: !!kolRow,
        source: kolRow?.source ?? null,
        handle: kolRow?.twitter_handle ?? null,
        displayName: kolRow?.display_name ?? null,
        tier: kolRow?.kol_tier ?? null,
        rank: kolRow?.kolscan_rank ?? kolRow?.kolscan_last_rank ?? null,
        trustScore: kolRow?.trust_score ?? null,
        weeklyScore: kolRow?.kolscan_weekly_score ?? null,
        followers: kolRow?.twitter_followers ?? null,
        matchedVia: kolRow?.matchedVia ?? null,
        matchedWallet: kolRow?.matchedWallet ?? null,
      },
      meta: {
        firstSeenAt: rep?.first_seen_at ?? null,
        lastActivityAt: rep?.last_activity_at ?? null,
        lastAnalyzedAt: rep?.last_analyzed_at ?? null,
        lastAuditAt: allstar?.last_audit_at ?? null,
      },
    };

    return new Response(JSON.stringify(dossier), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    console.error('[dev-profile-card] error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});