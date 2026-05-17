import { createClient } from 'npm:@supabase/supabase-js@2';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, getHeliusRestUrl, getHeliusRpcUrl } from '../_shared/helius-client.ts';
import { withRunLog } from '../_shared/run-logger.ts';
import { fetchPumpFunCoin } from '../_shared/pumpfun-fetch.ts';
import { sendAdminSms } from '../_shared/sms-notify.ts';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { buildRichMintAlert } from '../_shared/mint-alert-format.ts';
enableHeliusTracking('allstar-mint-auditor');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum tier to qualify as an allstar (tier 2 = 300k+)
const MIN_ALLSTAR_TIER = 2;
const MAX_MINT_ALERT_AGE_HOURS = 2;
// Hard absolute ceiling: no token older than 7 days can EVER trigger an alert,
// regardless of any other config. Tokens older than this are silently indexed to the mesh.
const MAX_ABSOLUTE_MINT_AGE_HOURS = 168;

// Pump.fun "create" Anchor discriminator: sha256("global:create").slice(0,8)
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPFUN_CREATE_DISCRIMINATOR_HEX = '181ec828051c0777';

function ixDataToHex(data: any): string {
  if (typeof data !== 'string' || !data) return '';
  try {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = 0n;
    for (const c of data) {
      const v = ALPHABET.indexOf(c);
      if (v < 0) return '';
      num = num * 58n + BigInt(v);
    }
    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    let zeros = 0;
    for (const c of data) { if (c === '1') zeros++; else break; }
    return '00'.repeat(zeros) + hex;
  } catch { return ''; }
}

// ─── STEP 1: Qualify new allstars from proven_dev_tokens ───

// Resolve creator for a token via pump.fun API
async function resolveCreator(tokenMint: string): Promise<string | null> {
  try {
    const data = await fetchPumpFunCoin(tokenMint, 'allstar-mint-auditor');
    if (!data) return null;
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
  mintTimestamp: number; // actual on-chain mint time (verified)
  mintAge: string; // human-readable age
}

/**
 * Verify actual on-chain mint timestamp via Helius getTransaction.
 * Returns epoch seconds or null if unverifiable.
 */
async function verifyMintTimestamp(tokenMint: string, heliusApiKey: string): Promise<number | null> {
  // Strategy 1: Helius DAS getAsset — returns authoritative token creation date
  try {
    const rpcUrl = getHeliusRpcUrl(heliusApiKey);
    const dasRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'mint-ts-das',
        method: 'getAsset',
        params: { id: tokenMint },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (dasRes.ok) {
      const dasData = await dasRes.json();
      const asset = dasData?.result;
      // DAS returns created_at as ISO string on the token_info or content level
      const createdAt = asset?.token_info?.mint_authority
        ? null // mint_authority alone doesn't give us a date
        : null;
      // Check slot-based creation: the asset's "slot" field from the earliest tx
      // More reliably, check content.metadata or compression.created_at
      const compressionCreatedAt = asset?.compression?.created_at;
      const contentCreatedAt = asset?.created_at;
      const isoDate = compressionCreatedAt || contentCreatedAt;
      if (isoDate) {
        const epoch = Math.floor(new Date(isoDate).getTime() / 1000);
        if (epoch > 0) {
          console.log(`[allstar] ✓ DAS getAsset creation date for ${tokenMint.slice(0, 12)}: ${isoDate}`);
          return epoch;
        }
      }
    }
  } catch (e) {
    console.warn(`[allstar] DAS getAsset failed for ${tokenMint.slice(0, 12)}:`, e);
  }

  // Strategy 2: Helius TOKEN_MINT transactions — take the OLDEST (last item), not newest
  try {
    const url = getHeliusRestUrl(`/v0/addresses/${tokenMint}/transactions`, { type: 'TOKEN_MINT', limit: '50' });
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const txs = await res.json();
      if (Array.isArray(txs) && txs.length > 0) {
        // Take the OLDEST transaction (last in the array) — that's the true mint
        const oldestTx = txs[txs.length - 1];
        if (oldestTx?.timestamp) {
          console.log(`[allstar] ✓ Oldest TOKEN_MINT tx for ${tokenMint.slice(0, 12)}: ${new Date(oldestTx.timestamp * 1000).toISOString()} (${txs.length} txs found)`);
          return oldestTx.timestamp;
        }
      }
    }
  } catch (e) {
    console.warn(`[allstar] TOKEN_MINT fallback failed for ${tokenMint.slice(0, 12)}:`, e);
  }

  // Strategy 3: getSignaturesForAddress — get the earliest signature for the mint address
  try {
    const rpcUrl = getHeliusRpcUrl(heliusApiKey);
    const sigRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'mint-ts-sigs',
        method: 'getSignaturesForAddress',
        params: [tokenMint, { limit: 1000 }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (sigRes.ok) {
      const sigData = await sigRes.json();
      const sigs = sigData?.result || [];
      if (sigs.length > 0) {
        // Last element = oldest signature = creation tx
        const oldest = sigs[sigs.length - 1];
        if (oldest?.blockTime) {
          console.log(`[allstar] ✓ Oldest signature blockTime for ${tokenMint.slice(0, 12)}: ${new Date(oldest.blockTime * 1000).toISOString()} (${sigs.length} sigs)`);
          return oldest.blockTime;
        }
      }
    }
  } catch (e) {
    console.warn(`[allstar] getSignaturesForAddress failed for ${tokenMint.slice(0, 12)}:`, e);
  }

  return null;
}

function formatMintAge(mintTimestamp: number): string {
  const ageMs = Date.now() - (mintTimestamp * 1000);
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
}

async function auditAllstarFamily(
  supabase: any,
  allstar: any,
  heliusApiKey: string,
  sinceHours: number
): Promise<MintHit[]> {
  // STRICT on-chain detection.
  //
  // A mint is only counted if:
  //   (a) the watched family wallet is the fee payer / first signer, AND
  //   (b) the transaction contains an actual SPL-Token `initializeMint` /
  //       `initializeMint2` instruction (top-level OR inner), OR a pump.fun
  //       `create` Anchor instruction (discriminator match).
  //
  // Helius `type=TOKEN_MINT` is NOT trusted — it includes `mintTo`, pool ops,
  // and tag-along participation, all of which produced false positives.
  const rpcUrl = getHeliusRpcUrl(heliusApiKey);
  const sinceSec = Math.floor(Date.now() / 1000) - sinceHours * 3600;
  const familyWallets: string[] = allstar.family_wallets || [allstar.master_wallet];
  const hits: MintHit[] = [];

  for (const wallet of familyWallets.slice(0, 30)) {
    try {
      // 1. Pull recent signatures for this wallet
      const sigsRes = await fetch(rpcUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress',
          params: [wallet, { limit: 50 }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!sigsRes.ok) continue;
      const sigs = ((await sigsRes.json())?.result || []) as Array<{ signature: string; blockTime?: number }>;

      for (const sigInfo of sigs) {
        // Window guard: skip anything older than the lookback window
        if (sigInfo.blockTime && sigInfo.blockTime < sinceSec) break; // sigs are newest→oldest

        await new Promise(r => setTimeout(r, 120));

        const txRes = await fetch(rpcUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'getTransaction',
            params: [sigInfo.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!txRes.ok) continue;
        const tx = (await txRes.json())?.result;
        if (!tx?.transaction?.message?.instructions) continue;

        const blockTime: number | undefined = tx.blockTime;
        if (!blockTime || blockTime < sinceSec) continue;

        // (a) Fee payer must be the watched family wallet
        const accountKeys = tx.transaction.message.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];
        if (accountKeys[0] !== wallet) continue;

        // (b) Look for initializeMint/initializeMint2 OR pump.fun create
        const topIx = tx.transaction.message.instructions || [];
        const innerIx: any[] = [];
        for (const inner of (tx.meta?.innerInstructions || [])) {
          for (const ix of (inner.instructions || [])) innerIx.push(ix);
        }
        const allIx = [...topIx, ...innerIx];

        let isPumpFunCreate = false;
        for (const ix of allIx) {
          if (ix.programId === PUMPFUN_PROGRAM) {
            const hex = ixDataToHex(ix.data).slice(0, 16).toLowerCase();
            if (hex === PUMPFUN_CREATE_DISCRIMINATOR_HEX) { isPumpFunCreate = true; break; }
          }
        }

        const mints = new Set<string>();
        for (const ix of allIx) {
          if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
            const m = ix.parsed.info?.mint;
            if (m) mints.add(m);
          }
        }

        if (mints.size === 0 && !isPumpFunCreate) continue;

        for (const tokenMint of mints) {
          // Dedupe against existing alert rows
          const { data: knownAlert } = await supabase
            .from('allstar_mint_alerts').select('id').eq('token_mint', tokenMint).maybeSingle();
          if (knownAlert) continue;

          const depth = wallet === allstar.master_wallet ? 0 :
                        wallet === allstar.kyc_root_wallet ? -1 : 1;
          const launchpad = isPumpFunCreate || tokenMint.endsWith('pump') ? 'pump.fun' : 'unknown';

          hits.push({
            tokenMint,
            creatorWallet: wallet,
            walletDepth: depth,
            launchpad,
            signature: sigInfo.signature,
            timestamp: blockTime,
            mintTimestamp: blockTime,
            mintAge: formatMintAge(blockTime),
          });
          console.log(`[allstar] ✅ VERIFIED MINT: ${tokenMint.slice(0,12)} by ${wallet.slice(0,8)} (launchpad=${launchpad}, sig=${sigInfo.signature.slice(0,12)})`);
        }
      }

      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.warn(`[allstar] Error scanning ${wallet.slice(0, 8)}...:`, e);
    }
  }

  return hits;
}

// ─── STEP 3: Create alerts + notifications (multi-channel) ───

const ALERT_EMAIL = 'wilsondavid@live.ca';

async function createAllstarAlert(
  supabase: any,
  allstar: any,
  hit: MintHit
): Promise<void> {
  // Determine alert level based on allstar tier
  // Higher tier = better dev, so higher = more critical alert
  const alertLevel = allstar.best_tier >= 6 ? 'critical' :
                     allstar.best_tier >= 4 ? 'high' : 'medium';

  const tierLabel = `T${allstar.best_tier}`;
  const tierStars = '⭐'.repeat(Math.min(allstar.best_tier, 8));
  const mcapLabel = allstar.best_mcap_achieved >= 1_000_000
    ? `$${(allstar.best_mcap_achieved / 1_000_000).toFixed(1)}M`
    : `$${(allstar.best_mcap_achieved / 1_000).toFixed(0)}K`;

  const ticker = hit.symbol || 'UNKNOWN';
  const tokenName = hit.name || ticker;
  const mintAddr = hit.tokenMint;
  const shortMint = mintAddr.slice(0, 8) + '...' + mintAddr.slice(-4);
  const devHandle = allstar.twitter_handle ? `@${allstar.twitter_handle}` : allstar.master_wallet.slice(0, 12) + '...';
  const launchpad = hit.launchpad || 'unknown';

  // Links
  const pumpUrl = `https://pump.fun/${mintAddr}`;
  const padreUrl = `https://padre.gg/token/${mintAddr}`;
  const dexUrl = `https://dexscreener.com/solana/${mintAddr}`;
  const solscanUrl = `https://solscan.io/token/${mintAddr}`;

  // Insert alert record with verified mint timestamp
  const mintDate = new Date(hit.mintTimestamp * 1000);

  // Build rich alert (also detects Mayhem launches that must NOT broadcast)
  const richAlert = await buildRichMintAlert(supabase, {
    tokenMint: mintAddr,
    creatorWallet: hit.creatorWallet,
    launchpad,
    eventLabel: null,
    mintTimestampMs: hit.mintTimestamp ? hit.mintTimestamp * 1000 : null,
    dev: {
      tier: allstar.best_tier ?? null,
      bestTokenSymbol: allstar.best_token_symbol ?? null,
      bestTokenMint: allstar.best_token_mint ?? null,
      bestMcap: allstar.best_mcap_achieved ?? null,
      twitterHandle: allstar.twitter_handle ?? null,
      familySize: allstar.total_wallet_family_size ?? null,
      kycRoot: allstar.kyc_root_wallet ?? null,
      familyName: null,
    },
    alertLevel,
    callerName: 'allstar-mint-auditor',
  });

  await assertDbWrite(
    supabase.from('allstar_mint_alerts').insert({
    allstar_id: allstar.id,
    developer_id: allstar.developer_id,
    token_mint: mintAddr,
    token_symbol: ticker,
    token_name: tokenName,
    creator_wallet: hit.creatorWallet,
    detecting_wallet: hit.creatorWallet,
    wallet_depth: hit.walletDepth,
    allstar_tier: allstar.best_tier,
    allstar_best_mcap: allstar.best_mcap_achieved,
    launchpad,
    alert_level: alertLevel,
    is_suppressed: richAlert.isMayhem,
    suppressed_reason: richAlert.isMayhem ? 'mayhem' : null,
    metadata: {
      twitter_handle: allstar.twitter_handle,
      kyc_root: allstar.kyc_root_wallet,
      best_token_symbol: allstar.best_token_symbol,
      signature: hit.signature,
      family_size: allstar.total_wallet_family_size,
      mint_timestamp: mintDate.toISOString(),
      mint_age: hit.mintAge,
      verified_onchain: !!hit.mintTimestamp,
      is_mayhem: richAlert.isMayhem,
    },
    }).select('id'),
    'allstar_mint_alerts',
    'INSERT'
  );

  // Admin notification (dashboard badge)
  const emoji = alertLevel === 'critical' ? '🌟🚨' : alertLevel === 'high' ? '⭐🔔' : '✨';
  await supabase.from('admin_notifications').insert({
    notification_type: 'allstar_mint',
    title: `${emoji} ALLSTAR DEV MINTED: $ ${ticker}`,
    message: `${tierLabel} dev ${devHandle} (best: $ ${allstar.best_token_symbol} → ${mcapLabel}) just launched $ ${ticker} on ${launchpad}`,
    metadata: {
      token_mint: mintAddr, allstar_id: allstar.id, allstar_tier: allstar.best_tier,
      creator_wallet: hit.creatorWallet, pump_url: pumpUrl, padre_url: padreUrl,
      // Deep link target → Mint Alerts sub-tab
      deep_link: `/super-admin?tab=allstars&sub=alerts&mint=${mintAddr}`,
      category: 'transactions',
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

  // ──────────────────────────────────────────────
  // CHANNELS 1+2: BlackBox group + DrRick DM (unified, deduped)
  // ──────────────────────────────────────────────
  try {
    // Enrich: live X profile (display_name + followers) and prior best-token ATH date.
    let devDisplayName: string | null = null;
    let devFollowersLabel = '';
    if (allstar.twitter_handle) {
      try {
        const { getXProfile, formatFollowers } = await import('../_shared/x-profile-lookup.ts');
        const prof = await getXProfile(supabase, allstar.twitter_handle);
        if (prof) {
          devDisplayName = prof.displayName;
          if (prof.followers && prof.followers > 0) {
            devFollowersLabel = `${formatFollowers(prof.followers)} followers`;
          }
        }
      } catch (e) {
        console.warn('[allstar] x-profile-lookup failed:', e);
      }
    }

    let bestAthDateLabel = '';
    if (allstar.best_token_mint) {
      try {
        const { data: bt } = await supabase
          .from('proven_dev_tokens')
          .select('ath_timestamp, mint_timestamp')
          .eq('token_mint', allstar.best_token_mint)
          .maybeSingle();
        const ts = bt?.ath_timestamp || bt?.mint_timestamp;
        if (ts) {
          bestAthDateLabel = new Date(ts).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
        }
      } catch (e) {
        console.warn('[allstar] proven-token date lookup failed:', e);
      }
    }

    const devLine = devDisplayName
      ? `👤 ${devDisplayName} (${devHandle})${devFollowersLabel ? ` — ${devFollowersLabel}` : ''}`
      : `👤 ${devHandle}${devFollowersLabel ? ` — ${devFollowersLabel}` : ''}`;
    const bestLine = bestAthDateLabel
      ? `🏆 Best prior: $ ${allstar.best_token_symbol} → ${mcapLabel} ATH (${bestAthDateLabel})`
      : `🏆 Best prior: $ ${allstar.best_token_symbol} → ${mcapLabel} ATH`;

    const tgMessage = [
      `🚀🌟 **A+ ALLSTAR DEV MINT ALERT** 🌟🚀`,
      ``,
      `${tierStars} **Tier ${allstar.best_tier} Developer**`,
      ``,
      devLine,
      bestLine,
      ``,
      `**Token:** $ ${ticker} (${tokenName})`,
      `**Mint:** \`${shortMint}\``,
      `**Launchpad:** ${launchpad}`,
      `**Creator:** \`${hit.creatorWallet.slice(0, 12)}...\``,
      allstar.twitter_handle ? `**Dev X:** [@${allstar.twitter_handle}](https://x.com/${allstar.twitter_handle})` : '',
      ``,
      `📊 **Dev Track Record:**`,
      `├ Best Token: $ ${allstar.best_token_symbol} → ${mcapLabel}`,
      `├ Proven Tokens: ${allstar.total_proven_tokens || '?'}`,
      `├ Wallet Family: ${allstar.total_wallet_family_size || 1} wallets`,
      allstar.kyc_root_wallet ? `├ KYC Root: \`${allstar.kyc_root_wallet.slice(0, 8)}...\`` : '',
      `└ Alert Level: **${alertLevel.toUpperCase()}**`,
      ``,
      `🔗 **Quick Links:**`,
      `├ [Pump.fun](${pumpUrl})`,
      `├ [Padre.gg](${padreUrl})`,
      `├ [DexScreener](${dexUrl})`,
      `└ [Solscan](${solscanUrl})`,
      ``,
      `⏰ Minted: **${hit.mintAge}** (${mintDate.toISOString().slice(0, 19).replace('T', ' ')} UTC)`,
      ``,
      `💡 _This dev previously launched $ ${allstar.best_token_symbol} to ${mcapLabel}. Move fast._`,
    ].filter(Boolean).join('\n');

    const dmMessage = [
      `🚀 ALLSTAR MINT — $ ${ticker}`,
      ``,
      devLine,
      bestLine,
      ``,
      `🆕 New mint: $ ${ticker} (${tokenName})`,
      `⏰ Minted: ${hit.mintAge}  •  Launchpad: ${launchpad}`,
      `🏷️ Tier: T${allstar.best_tier} (${alertLevel.toUpperCase()})`,
      ``,
      `Pump: ${pumpUrl}`,
      `Padre: ${padreUrl}`,
      `DexScreener: ${dexUrl}`,
      `Solscan: ${solscanUrl}`,
    ].join('\n');

    const { sendMintAlert } = await import('../_shared/mint-alert-notify.ts');
    if (richAlert.isMayhem) {
      console.log(`[allstar] 🛑 MAYHEM suppression — alert kept in queue but NOT announced for ${mintAddr.slice(0,8)}`);
    } else {
      await sendMintAlert(supabase, {
        tokenMint: mintAddr,
        blackboxMessage: richAlert.blackboxMessage,
        drrickMessage: richAlert.drrickMessage,
        sourceFunction: 'allstar-mint-auditor',
      });
    }
  } catch (e) {
    console.warn('[allstar] mint-alert notify failed:', e);
  }

  // ──────────────────────────────────────────────
  // CHANNEL 3: Email alert via admin-notify
  // ──────────────────────────────────────────────
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const { Resend } = await import('npm:resend@2.0.0');
      const resend = new Resend(resendApiKey);

      const emailHtml = `
        <div style="font-family: 'Courier New', monospace; max-width: 640px; margin: 0 auto; background: #0a0a0a; border: 2px solid #00ff88; border-radius: 12px; padding: 0; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%); padding: 16px 24px;">
            <h1 style="color: #000; margin: 0; font-size: 22px;">🚀 A+ ALLSTAR DEV MINT ALERT</h1>
            <p style="color: #000; margin: 4px 0 0; font-weight: bold;">${tierStars} Tier ${allstar.best_tier} Developer</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; color: #ffffff;">
              <tr><td style="padding: 6px 0; color: #888;">Token</td><td style="padding: 6px 0; font-weight: bold; color: #00ff88; font-size: 18px;">$${ticker} (${tokenName})</td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Mint</td><td style="padding: 6px 0;"><code style="background: #1a1a2e; padding: 2px 6px; border-radius: 4px; color: #fff;">${shortMint}</code></td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Launchpad</td><td style="padding: 6px 0; color: #fff;">${launchpad}</td></tr>
              <tr><td style="padding: 6px 0; color: #888;">Creator</td><td style="padding: 6px 0;"><code style="background: #1a1a2e; padding: 2px 6px; border-radius: 4px; color: #fff;">${hit.creatorWallet.slice(0, 16)}...</code></td></tr>
              ${allstar.twitter_handle ? `<tr><td style="padding: 6px 0; color: #888;">Dev X</td><td style="padding: 6px 0;"><a href="https://x.com/${allstar.twitter_handle}" style="color: #1da1f2;">@${allstar.twitter_handle}</a></td></tr>` : ''}
            </table>
            <hr style="border: 1px solid #333; margin: 16px 0;" />
            <h3 style="color: #00ff88; margin: 0 0 8px;">📊 Dev Track Record</h3>
            <table style="width: 100%; border-collapse: collapse; color: #ccc;">
              <tr><td style="padding: 4px 0;">Best Token</td><td style="padding: 4px 0;"><strong>$${allstar.best_token_symbol}</strong> → ${mcapLabel}</td></tr>
              <tr><td style="padding: 4px 0;">Proven Tokens</td><td style="padding: 4px 0;">${allstar.total_proven_tokens || '?'}</td></tr>
              <tr><td style="padding: 4px 0;">Wallet Family</td><td style="padding: 4px 0;">${allstar.total_wallet_family_size || 1} wallets</td></tr>
              <tr><td style="padding: 4px 0;">Alert Level</td><td style="padding: 4px 0; font-weight: bold; color: ${alertLevel === 'critical' ? '#ff4444' : alertLevel === 'high' ? '#ffaa00' : '#00ff88'};">${alertLevel.toUpperCase()}</td></tr>
            </table>
            <hr style="border: 1px solid #333; margin: 16px 0;" />
            <h3 style="color: #00ff88; margin: 0 0 12px;">🔗 Quick Links</h3>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <a href="${pumpUrl}" style="display: inline-block; padding: 10px 20px; background: #00ff88; color: #000; text-decoration: none; border-radius: 8px; font-weight: bold;">Pump.fun</a>
              <a href="${padreUrl}" style="display: inline-block; padding: 10px 20px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold;">Padre.gg</a>
              <a href="${dexUrl}" style="display: inline-block; padding: 10px 20px; background: #1a1a2e; color: #fff; text-decoration: none; border-radius: 8px; border: 1px solid #444; font-weight: bold;">DexScreener</a>
              <a href="${solscanUrl}" style="display: inline-block; padding: 10px 20px; background: #1a1a2e; color: #fff; text-decoration: none; border-radius: 8px; border: 1px solid #444; font-weight: bold;">Solscan</a>
            </div>
            <p style="color: #888; font-size: 12px; margin-top: 20px;">
              ⏰ ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC • BlackBox Farm AllStar System
            </p>
          </div>
        </div>
      `;

      await resend.emails.send({
        from: 'BlackBox Alerts <alerts@blackbox.farm>',
        to: [ALERT_EMAIL],
        subject: `🚀 ALLSTAR MINT: $${ticker} — T${allstar.best_tier} Dev (${mcapLabel} track record)`,
        html: emailHtml,
      });
      console.log(`[allstar] ✓ Email alert sent to ${ALERT_EMAIL}`);
    } else {
      console.warn('[allstar] No RESEND_API_KEY, skipping email');
    }
  } catch (e) {
    console.warn('[allstar] Email alert failed:', e);
  }

  // ──────────────────────────────────────────────
  // CHANNEL 4: SMS to admin (gated by feature flag)
  // ──────────────────────────────────────────────
  try {
    const { data: smsFlag } = await supabase
      .from('intelligence_feature_flags')
      .select('enabled')
      .eq('feature_name', 'allstar_mint_sms_alerts')
      .maybeSingle();
    if (smsFlag?.enabled) {
      const smsBody =
        `🚀 ALLSTAR MINT — $${ticker}\n` +
        `T${allstar.best_tier} ${devHandle}\n` +
        `Best: $${allstar.best_token_symbol} → ${mcapLabel}\n` +
        `Minted: ${hit.mintAge}\n` +
        `${pumpUrl}`;
      await sendAdminSms(smsBody);
      console.log('[allstar] ✓ SMS dispatched (flag ON)');
    } else {
      console.log('[allstar] SMS skipped (flag OFF)');
    }
  } catch (e) {
    console.warn('[allstar] SMS dispatch failed:', e);
  }

  console.log(`[allstar] 🚀 ALERT COMPLETE: ${tierLabel} dev ${allstar.master_wallet.slice(0, 8)}... minted $${ticker} (${alertLevel}) → TG+DM+Email`);
}

// ─── MAIN HANDLER ───

Deno.serve(withRunLog('allstar-mint-auditor', async (req) => {
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
      hours_lookback: requestedHoursLookback = MAX_MINT_ALERT_AGE_HOURS,
      force_requalify = false,
      // Manual add mode: provide a token_mint to add its dev to allstars
      manual_add_token_mint = null,
      // Background mode: kick off the audit and return immediately so the
      // client doesn't hit the 150s edge-runtime idle timeout.
      background = false,
    } = body;

    const effectiveHoursLookback = Math.min(
      MAX_MINT_ALERT_AGE_HOURS,
      Math.max(0.25, Number(requestedHoursLookback) || MAX_MINT_ALERT_AGE_HOURS),
    );

    if (effectiveHoursLookback !== Number(requestedHoursLookback)) {
      console.log(`[allstar] Clamped hours_lookback from ${requestedHoursLookback} to ${effectiveHoursLookback}h`);
    }

    // ─── MANUAL ADD MODE ───
    if (manual_add_token_mint) {
      console.log(`[allstar] Manual add requested for ${manual_add_token_mint}`);
      
      // Step 1: Resolve creator wallet
      let creatorWallet = await resolveCreator(manual_add_token_mint);
      
      // Fallback: check proven_dev_tokens or developer_tokens
      if (!creatorWallet) {
        const { data: proven } = await supabase
          .from('proven_dev_tokens')
          .select('dev_wallet')
          .eq('token_mint', manual_add_token_mint)
          .maybeSingle();
        creatorWallet = proven?.dev_wallet || null;
      }
      if (!creatorWallet) {
        const { data: devToken } = await supabase
          .from('developer_tokens')
          .select('developer_id')
          .eq('token_mint', manual_add_token_mint)
          .maybeSingle();
        if (devToken?.developer_id) {
          const { data: profile } = await supabase
            .from('developer_profiles')
            .select('master_wallet_address')
            .eq('id', devToken.developer_id)
            .maybeSingle();
          creatorWallet = profile?.master_wallet_address || null;
        }
      }

      if (!creatorWallet) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Could not resolve creator wallet for this token. Try adding the dev wallet directly.' 
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
      }

      // Step 2: Check if already in allstar registry
      const { data: existingAllstar } = await supabase
        .from('allstar_dev_registry')
        .select('id, master_wallet, best_tier, status')
        .eq('master_wallet', creatorWallet)
        .maybeSingle();

      if (existingAllstar) {
        return new Response(JSON.stringify({
          success: true,
          action: 'already_exists',
          message: `Dev ${creatorWallet.slice(0, 8)}... already in allstar registry (T${existingAllstar.best_tier}, ${existingAllstar.status})`,
          allstar_id: existingAllstar.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Step 3: Get token info from DexScreener
      let tokenSymbol = 'UNKNOWN';
      let tokenName = 'Unknown Token';
      let marketCap = 0;
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${manual_add_token_mint}`);
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          const pair = dexData.pairs?.[0];
          if (pair) {
            tokenSymbol = pair.baseToken?.symbol || 'UNKNOWN';
            tokenName = pair.baseToken?.name || 'Unknown Token';
            marketCap = pair.marketCap || pair.fdv || 0;
          }
        }
      } catch {}

      // Step 4: Find developer profile + build wallet family
      const { data: devProfile } = await supabase
        .from('developer_profiles')
        .select('id, twitter_handle, master_wallet_address')
        .eq('master_wallet_address', creatorWallet)
        .maybeSingle();

      let kycRoot: string | null = null;
      const familyWallets: string[] = [creatorWallet];

      if (devProfile) {
        const { data: kycWallet } = await supabase
          .from('developer_wallets')
          .select('wallet_address')
          .eq('developer_id', devProfile.id)
          .eq('wallet_type', 'kyc_root')
          .limit(1)
          .maybeSingle();
        kycRoot = kycWallet?.wallet_address || null;

        const { data: relatedWallets } = await supabase
          .from('developer_wallets')
          .select('wallet_address')
          .eq('developer_id', devProfile.id);
        for (const w of relatedWallets || []) {
          if (!familyWallets.includes(w.wallet_address)) familyWallets.push(w.wallet_address);
        }
      }

      // Also pull from reputation_mesh
      const { data: meshWallets } = await supabase
        .from('reputation_mesh')
        .select('target_id')
        .eq('source_id', creatorWallet)
        .in('relationship_type', ['funded_by', 'funds', 'same_entity', 'parent_wallet', 'child_wallet'])
        .limit(50);
      for (const mw of meshWallets || []) {
        if (mw.target_id && !familyWallets.includes(mw.target_id)) familyWallets.push(mw.target_id);
      }

      // Step 5: Determine tier from proven_dev_tokens or default to manual T1
      const { data: provenTokens } = await supabase
        .from('proven_dev_tokens')
        .select('tier, market_cap_ath')
        .eq('dev_wallet', creatorWallet)
        .order('tier', { ascending: false })
        .limit(1);

      const bestTier = provenTokens?.[0]?.tier || 1;
      const bestMcap = provenTokens?.[0]?.market_cap_ath || marketCap;

      // Step 6: Insert into allstar registry
      const { data: newAllstar, error: insertErr } = await supabase
        .from('allstar_dev_registry')
        .insert({
          developer_id: devProfile?.id || null,
          master_wallet: creatorWallet,
          twitter_handle: devProfile?.twitter_handle || null,
          kyc_root_wallet: kycRoot,
          best_tier: bestTier,
          best_token_mint: manual_add_token_mint,
          best_token_symbol: tokenSymbol,
          best_mcap_achieved: bestMcap,
          total_proven_tokens: provenTokens?.length || 1,
          total_wallet_family_size: familyWallets.length,
          family_wallets: familyWallets,
          status: 'active',
          notes: `Manually added via token ${tokenSymbol} (${manual_add_token_mint.slice(0, 12)}...)`,
        })
        .select('id')
        .single();

      if (insertErr) {
        return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
        });
      }

      console.log(`[allstar] ⭐ Manually added allstar: ${creatorWallet.slice(0, 8)}... via $${tokenSymbol} (${familyWallets.length} family wallets)`);

      return new Response(JSON.stringify({
        success: true,
        action: 'added',
        message: `Added dev ${creatorWallet.slice(0, 8)}... to allstar registry via $${tokenSymbol}`,
        allstar_id: newAllstar.id,
        creator_wallet: creatorWallet,
        family_wallets_count: familyWallets.length,
        tier: bestTier,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results = {
      creators_backfilled: 0,
      new_allstars_qualified: 0,
      allstars_audited: 0,
      new_mints_detected: 0,
      alerts_created: 0,
      total_family_wallets_scanned: 0,
      errors: [] as string[],
    };

    // Soft deadline so the background task always wraps up well within the
    // 25-min mark, leaving runway before the next */30 cron tick.
    const SOFT_DEADLINE_MS = 23 * 60 * 1000;
    const CONCURRENCY = 8;
    let allstarsToAudit: any[] = [];

    const auditOne = async (allstar: any) => {
      if (Date.now() - startTime > SOFT_DEADLINE_MS) {
        results.errors.push(`${allstar.master_wallet.slice(0, 8)}: deadline-skip`);
        return;
      }
      try {
        const familySize = (allstar.family_wallets || []).length;
        results.total_family_wallets_scanned += familySize;

        const hits = await auditAllstarFamily(supabase, allstar, heliusApiKey!, effectiveHoursLookback);
        results.allstars_audited++;

        for (const hit of hits) {
          await createAllstarAlert(supabase, allstar, hit);
          results.new_mints_detected++;
          results.alerts_created++;
        }

        await assertDbWrite(
          supabase
            .from('allstar_dev_registry')
            .update({
              last_audit_at: new Date().toISOString(),
              audit_count: (allstar.audit_count || 0) + 1,
            })
            .eq('id', allstar.id)
            .select('id'),
          'allstar_dev_registry',
          'UPDATE last_audit_at'
        );
      } catch (e: any) {
        results.errors.push(`${allstar.master_wallet.slice(0, 8)}: ${e.message}`);
      }
    };

    const auditQueue = async () => {
      // ─── PHASE 0: Backfill missing creator wallets ───
      console.log('[allstar] Phase 0: Backfilling creator wallets...');
      results.creators_backfilled = await backfillCreatorWallets(supabase);
      console.log(`[allstar] Backfilled ${results.creators_backfilled} creator wallets`);

      // ─── PHASE 1: Qualify new allstars ───
      console.log('[allstar] Phase 1: Qualifying allstars from proven_dev_tokens...');
      results.new_allstars_qualified = await qualifyAllstars(supabase);
      console.log(`[allstar] Qualified ${results.new_allstars_qualified} new allstars`);

      // ─── PHASE 2: Pull batch of allstars to audit ───
      console.log('[allstar] Phase 2: Auditing allstar wallet families...');
      const { data: batch } = await supabase
        .from('allstar_dev_registry')
        .select('*')
        .eq('status', 'active')
        .order('last_audit_at', { ascending: true, nullsFirst: true })
        .limit(audit_batch_size);
      allstarsToAudit = batch || [];
      console.log(`[allstar] Pulled ${allstarsToAudit.length} allstars to audit (batch_size=${audit_batch_size})`);

      const queue = [...(allstarsToAudit || [])];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
          const next = queue.shift();
          if (!next) break;
          await auditOne(next);
        }
      });
      await Promise.all(workers);
      const elapsedBg = Date.now() - startTime;
      console.log(`[allstar] ✅ Background sweep complete in ${elapsedBg}ms:`, results);
    };

    // Background mode: queue and return immediately so the client doesn't time out
    if (background) {
      // @ts-ignore - EdgeRuntime is a Deno deploy global
      try { EdgeRuntime.waitUntil(auditQueue()); } catch { auditQueue(); }
      return new Response(
        JSON.stringify({
          success: true,
          background: true,
          message: `Full sweep running in background (batch_size=${audit_batch_size}). Refresh the feed in 1-3 min.`,
          effective_hours_lookback: effectiveHoursLookback,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await auditQueue();

    const elapsed = Date.now() - startTime;
    console.log(`[allstar] ✅ Complete in ${elapsed}ms with ${effectiveHoursLookback}h max mint age:`, results);

    return new Response(
      JSON.stringify({ success: true, elapsed, effective_hours_lookback: effectiveHoursLookback, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[allstar] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}));
