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

const KOLSCAN_TTL_MS = 24 * 60 * 60 * 1000;

function isBase58(s: string): boolean {
  return typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

async function maybeFetchKolscan(
  supabase: ReturnType<typeof createClient>,
  wallet: string,
  existingHandle: string | null,
  checkedAt: string | null,
): Promise<string | null> {
  const fresh = checkedAt && (Date.now() - new Date(checkedAt).getTime() < KOLSCAN_TTL_MS);
  if (fresh) return existingHandle;

  try {
    const r = await fetch(`https://kolscan.io/account/${wallet}`, {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 BlackBoxFarmBot/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    let handle: string | null = null;
    if (r.ok) {
      const html = await r.text();
      // KOLscan profile pages embed the handle in <title> like
      // "Cupsey | KolScan" or in a <h1>.  Best-effort regex.
      const titleMatch = html.match(/<title>([^<|]+?)\s*\|\s*KolScan<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>\s*([^<]{1,40})\s*<\/h1>/i);
      const candidate = (titleMatch?.[1] || h1Match?.[1] || '').trim();
      if (candidate && !/not\s+found|404/i.test(candidate)) handle = candidate;
    }
    // Persist (also writes a null + checked_at so we don't re-scrape constantly)
    await supabase
      .from('dev_wallet_reputation')
      .update({ kolscan_handle: handle, kolscan_checked_at: new Date().toISOString() })
      .eq('wallet_address', wallet);
    return handle;
  } catch (_e) {
    return existingHandle;
  }
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

    // KOLscan enrich (best-effort, fail-open)
    let kolscanHandle: string | null = rep?.kolscan_handle ?? null;
    if (rep) {
      kolscanHandle = await maybeFetchKolscan(supabase, wallet, rep.kolscan_handle ?? null, rep.kolscan_checked_at ?? null);
    }

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
        url: `https://kolscan.io/account/${wallet}`,
      } : null,
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