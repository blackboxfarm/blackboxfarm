import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';
enableHeliusTracking('allstar-mint-auditor');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum tier to qualify as an allstar (tier 2 = 300k+)
const MIN_ALLSTAR_TIER = 2;

// ─── STEP 1: Qualify new allstars from proven_dev_tokens ───

// Resolve creator for a token via pump.fun API
async function resolveCreator(tokenMint: string): Promise<string | null> {
  try {
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.creator && typeof data.creator === 'string' && data.creator.length >= 32) ? data.creator : null;
  } catch { return null; }
}

// Phase 0: Backfill dev_wallet on proven_dev_tokens that are missing it
async function backfillCreatorWallets(supabase: any): Promise<number> {
  const { data: missing } = await supabase
    .from('proven_dev_tokens')
    .select('id, token_mint')
    .is('dev_wallet', null)
    .limit(10); // 10 per run to avoid rate limits

  let filled = 0;
  for (const token of missing || []) {
    const creator = await resolveCreator(token.token_mint);
    if (creator) {
      await supabase.from('proven_dev_tokens').update({ dev_wallet: creator, updated_at: new Date().toISOString() }).eq('id', token.id);
      filled++;
      console.log(`[allstar] Backfilled creator for ${token.token_mint.slice(0, 12)}... → ${creator.slice(0, 8)}...`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return filled;
}

async function qualifyAllstars(supabase: any): Promise<number> {
  // Get all proven tokens with dev_wallet that meet minimum tier
  const { data: provenTokens } = await supabase
    .from('proven_dev_tokens')
    .select('token_mint, symbol, name, dev_wallet, tier, market_cap_ath')
    .gte('tier', MIN_ALLSTAR_TIER)
    .not('dev_wallet', 'is', null);

  if (!provenTokens || provenTokens.length === 0) return 0;

  // Group by dev_wallet → pick best tier/mcap
  const devMap = new Map<string, { bestTier: number; bestMcap: number; bestMint: string; bestSymbol: string; tokenCount: number }>();
  
  for (const t of provenTokens) {
    const existing = devMap.get(t.dev_wallet);
    if (!existing || t.tier > existing.bestTier || (t.tier === existing.bestTier && t.market_cap_ath > existing.bestMcap)) {
      devMap.set(t.dev_wallet, {
        bestTier: t.tier,
        bestMcap: t.market_cap_ath || 0,
        bestMint: t.token_mint,
        bestSymbol: t.symbol || 'UNKNOWN',
        tokenCount: (existing?.tokenCount || 0) + 1,
      });
    } else if (existing) {
      existing.tokenCount++;
    }
  }

  let qualified = 0;

  for (const [wallet, stats] of devMap) {
    // Check if already in registry
    const { data: existing } = await supabase
      .from('allstar_dev_registry')
      .select('id, best_tier')
      .eq('master_wallet', wallet)
      .maybeSingle();

    // Find developer profile + extras
    const { data: devProfile } = await supabase
      .from('developer_profiles')
      .select('id, twitter_handle, master_wallet_address')
      .eq('master_wallet_address', wallet)
      .maybeSingle();

    // Find KYC root from developer_wallets lineage
    let kycRoot: string | null = null;
    if (devProfile) {
      const { data: kycWallet } = await supabase
        .from('developer_wallets')
        .select('wallet_address')
        .eq('developer_id', devProfile.id)
        .eq('wallet_type', 'kyc_root')
        .limit(1)
        .maybeSingle();
      kycRoot = kycWallet?.wallet_address || null;
    }

    // Build family wallet list
    const familyWallets: string[] = [wallet];
    if (devProfile) {
      const { data: relatedWallets } = await supabase
        .from('developer_wallets')
        .select('wallet_address')
        .eq('developer_id', devProfile.id);
      
      for (const w of relatedWallets || []) {
        if (!familyWallets.includes(w.wallet_address)) {
          familyWallets.push(w.wallet_address);
        }
      }
    }

    // Also pull from reputation_mesh for deeper connections
    const { data: meshWallets } = await supabase
      .from('reputation_mesh')
      .select('target_id')
      .eq('source_id', wallet)
      .in('relationship_type', ['funded_by', 'funds', 'same_entity', 'parent_wallet', 'child_wallet'])
      .limit(50);

    for (const mw of meshWallets || []) {
      if (mw.target_id && !familyWallets.includes(mw.target_id)) {
        familyWallets.push(mw.target_id);
      }
    }

    const now = new Date().toISOString();

    if (existing) {
      // Update if better tier or more tokens
      if (stats.bestTier > existing.best_tier || !existing.best_tier) {
        await supabase
          .from('allstar_dev_registry')
          .update({
            best_tier: stats.bestTier,
            best_token_mint: stats.bestMint,
            best_token_symbol: stats.bestSymbol,
            best_mcap_achieved: stats.bestMcap,
            total_proven_tokens: stats.tokenCount,
            total_wallet_family_size: familyWallets.length,
            family_wallets: familyWallets,
            twitter_handle: devProfile?.twitter_handle || null,
            kyc_root_wallet: kycRoot,
            updated_at: now,
          })
          .eq('id', existing.id);
      }
    } else {
      // New allstar entry
      const { error } = await supabase
        .from('allstar_dev_registry')
        .insert({
          developer_id: devProfile?.id || null,
          master_wallet: wallet,
          twitter_handle: devProfile?.twitter_handle || null,
          kyc_root_wallet: kycRoot,
          best_tier: stats.bestTier,
          best_token_mint: stats.bestMint,
          best_token_symbol: stats.bestSymbol,
          best_mcap_achieved: stats.bestMcap,
          total_proven_tokens: stats.tokenCount,
          total_wallet_family_size: familyWallets.length,
          family_wallets: familyWallets,
          status: 'active',
        });

      if (!error) {
        qualified++;
        console.log(`[allstar] ⭐ New allstar: ${wallet.slice(0, 8)}... (T${stats.bestTier}, $${stats.bestSymbol}, ${familyWallets.length} wallets)`);
      }
    }
  }

  return qualified;
}

// ─── STEP 2: Audit allstar wallet families for new mints ───

interface MintHit {
  tokenMint: string;
  symbol?: string;
  name?: string;
  creatorWallet: string;
  walletDepth: number;
  launchpad?: string;
  signature: string;
  timestamp: number;
}

async function auditAllstarFamily(
  supabase: any,
  allstar: any,
  heliusApiKey: string,
  sinceHours: number
): Promise<MintHit[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const familyWallets: string[] = allstar.family_wallets || [allstar.master_wallet];
  const hits: MintHit[] = [];

  for (const wallet of familyWallets.slice(0, 30)) { // Cap at 30 wallets per family
    try {
      const url = getHeliusRestUrl(`/v0/addresses/${wallet}/transactions`, { type: 'TOKEN_MINT', limit: '50' });
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) continue;

      const transactions = await response.json();

      for (const tx of transactions || []) {
        const txTime = new Date(tx.timestamp * 1000);
        if (txTime < since) continue;

        const tokenMint = tx.tokenTransfers?.[0]?.mint || tx.events?.token?.mint;
        if (!tokenMint) continue;

        // Skip if already known
        const { data: knownToken } = await supabase
          .from('allstar_mint_alerts')
          .select('id')
          .eq('token_mint', tokenMint)
          .maybeSingle();

        if (knownToken) continue;

        // Also skip if in developer_tokens already with same allstar
        const { data: devToken } = await supabase
          .from('developer_tokens')
          .select('id')
          .eq('token_mint', tokenMint)
          .maybeSingle();

        // Detect launchpad
        const programIds = tx.accountData?.map((a: any) => a.account) || [];
        let launchpad = 'unknown';
        if (programIds.includes('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') || tx.source === 'PUMP_FUN') launchpad = 'pump.fun';

        // Determine wallet depth in family
        const depth = wallet === allstar.master_wallet ? 0 :
                      wallet === allstar.kyc_root_wallet ? -1 : 1;

        hits.push({
          tokenMint,
          symbol: tx.tokenTransfers?.[0]?.tokenSymbol || tx.events?.token?.tokenSymbol,
          name: tx.tokenTransfers?.[0]?.tokenName || tx.events?.token?.tokenName,
          creatorWallet: wallet,
          walletDepth: depth,
          launchpad,
          signature: tx.signature,
          timestamp: tx.timestamp,
        });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.warn(`[allstar] Error scanning ${wallet.slice(0, 8)}...:`, e);
    }
  }

  return hits;
}

// ─── STEP 3: Create alerts + notifications ───

async function createAllstarAlert(
  supabase: any,
  allstar: any,
  hit: MintHit
): Promise<void> {
  // Determine alert level based on allstar tier
  const alertLevel = allstar.best_tier >= 6 ? 'critical' :
                     allstar.best_tier >= 4 ? 'high_priority' : 'opportunity';

  const tierLabel = `T${allstar.best_tier}`;
  const mcapLabel = allstar.best_mcap_achieved >= 1_000_000
    ? `$${(allstar.best_mcap_achieved / 1_000_000).toFixed(1)}M`
    : `$${(allstar.best_mcap_achieved / 1_000).toFixed(0)}K`;

  // Insert alert
  await supabase.from('allstar_mint_alerts').insert({
    allstar_id: allstar.id,
    developer_id: allstar.developer_id,
    token_mint: hit.tokenMint,
    token_symbol: hit.symbol,
    token_name: hit.name,
    creator_wallet: hit.creatorWallet,
    detecting_wallet: hit.creatorWallet,
    wallet_depth: hit.walletDepth,
    allstar_tier: allstar.best_tier,
    allstar_best_mcap: allstar.best_mcap_achieved,
    launchpad: hit.launchpad,
    alert_level: alertLevel,
    metadata: {
      twitter_handle: allstar.twitter_handle,
      kyc_root: allstar.kyc_root_wallet,
      best_token_symbol: allstar.best_token_symbol,
      signature: hit.signature,
      family_size: allstar.total_wallet_family_size,
    },
  });

  // Admin notification
  const emoji = alertLevel === 'critical' ? '🌟🚨' : alertLevel === 'high_priority' ? '⭐🔔' : '✨';
  await supabase.from('admin_notifications').insert({
    notification_type: 'allstar_mint',
    title: `${emoji} ALLSTAR DEV MINTED: $${hit.symbol || 'UNKNOWN'}`,
    message: `${tierLabel} dev ${allstar.twitter_handle || allstar.master_wallet.slice(0, 8)}... (best: $${allstar.best_token_symbol} → ${mcapLabel}) just launched $${hit.symbol || 'NEW'} on ${hit.launchpad}. Wallet family: ${allstar.total_wallet_family_size} wallets.`,
    metadata: {
      token_mint: hit.tokenMint,
      allstar_id: allstar.id,
      allstar_tier: allstar.best_tier,
      creator_wallet: hit.creatorWallet,
      action_url: `https://pump.fun/${hit.tokenMint}`,
    },
  });

  // Update allstar record
  await supabase
    .from('allstar_dev_registry')
    .update({
      last_mint_detected_at: new Date().toISOString(),
      new_mints_found: (allstar.new_mints_found || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', allstar.id);

  // Fire Telegram alert for high-tier devs
  if (allstar.best_tier >= 4) {
    try {
      await supabase.functions.invoke('telegram-bot-webhook', {
        body: {
          type: 'allstar_mint_alert',
          data: {
            token_mint: hit.tokenMint,
            token_symbol: hit.symbol,
            allstar_tier: allstar.best_tier,
            allstar_twitter: allstar.twitter_handle,
            best_token: allstar.best_token_symbol,
            best_mcap: allstar.best_mcap_achieved,
            launchpad: hit.launchpad,
          },
        },
      });
    } catch (e) {
      console.warn('[allstar] Telegram alert failed:', e);
    }
  }

  console.log(`[allstar] 🚀 ALERT: ${tierLabel} dev ${allstar.master_wallet.slice(0, 8)}... minted $${hit.symbol || hit.tokenMint.slice(0, 8)} (${alertLevel})`);
}

// ─── MAIN HANDLER ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusApiKey = getHeliusApiKey();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const {
      audit_batch_size = 10,
      hours_lookback = 24,
      force_requalify = false,
    } = body;

    const results = {
      new_allstars_qualified: 0,
      allstars_audited: 0,
      new_mints_detected: 0,
      alerts_created: 0,
      total_family_wallets_scanned: 0,
      errors: [] as string[],
    };

    // ─── PHASE 1: Qualify new allstars ───
    console.log('[allstar] Phase 1: Qualifying allstars from proven_dev_tokens...');
    results.new_allstars_qualified = await qualifyAllstars(supabase);
    console.log(`[allstar] Qualified ${results.new_allstars_qualified} new allstars`);

    // ─── PHASE 2: Audit oldest-scanned allstars ───
    console.log('[allstar] Phase 2: Auditing allstar wallet families...');
    
    const { data: allstarsToAudit } = await supabase
      .from('allstar_dev_registry')
      .select('*')
      .eq('status', 'active')
      .order('last_audit_at', { ascending: true, nullsFirst: true })
      .limit(audit_batch_size);

    for (const allstar of allstarsToAudit || []) {
      try {
        const familySize = (allstar.family_wallets || []).length;
        results.total_family_wallets_scanned += familySize;

        const hits = await auditAllstarFamily(supabase, allstar, heliusApiKey, hours_lookback);
        results.allstars_audited++;

        for (const hit of hits) {
          await createAllstarAlert(supabase, allstar, hit);
          results.new_mints_detected++;
          results.alerts_created++;
        }

        // Mark as audited
        await supabase
          .from('allstar_dev_registry')
          .update({
            last_audit_at: new Date().toISOString(),
            audit_count: (allstar.audit_count || 0) + 1,
          })
          .eq('id', allstar.id);

      } catch (e: any) {
        results.errors.push(`${allstar.master_wallet.slice(0, 8)}: ${e.message}`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[allstar] ✅ Complete in ${elapsed}ms:`, results);

    return new Response(
      JSON.stringify({ success: true, elapsed, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[allstar] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
