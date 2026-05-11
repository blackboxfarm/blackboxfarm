import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { createApiLogger } from '../_shared/api-logger.ts';
import { assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { isCexWallet, getCexName } from '../_shared/cex-wallets.ts';
import { getCexNameAny, getCexNameCached, getEntityCached, recordCexWallet, warmCexCache } from '../_shared/cex-wallets-db.ts';
import { solscanCheckAccountLabel, solscanDiscoverFunders } from '../_shared/solscan-intelligence.ts';
import { classifyEntityFromLabel } from '../_shared/kyc-entity-classifier.ts';

import { enableHeliusTracking } from "../_shared/helius-fetch-interceptor.ts";
enableHeliusTracking("mesh-kyc-deep-search");

const CEX_KEYWORDS = ['binance', 'coinbase', 'okx', 'bybit', 'kraken', 'kucoin', 'huobi', 'gate.io', 'ftx', 'gemini', 'bitfinex', 'crypto.com', 'mexc'];

interface HeliusFundedByResult {
  funder: string;
  funderName: string | null;
  funderType: string | null;
  amount: number;
  amountRaw: string;
  signature: string;
  timestamp: number;
  slot: number;
}

/**
 * Identify whether a funder is a KYC-attributable entity (CEX, bridge,
 * on-ramp, custodian, MM desk, aggregator). Returns the matched entity or
 * null if the funder looks like an ordinary wallet.
 */
function identifyKycEntity(
  funderAddress: string,
  funderName: string | null,
  funderType: string | null,
): { name: string; type: string } | null {
  // 1) curated file dictionary + DB cache (warmed at handler start)
  const cached = getEntityCached(funderAddress);
  if (cached) return cached;
  // 2) Helius hint — exchange/cex marker
  if (funderType === 'exchange' || funderType === 'cex') {
    const fromName = classifyEntityFromLabel(funderName);
    if (fromName) return fromName;
    return { name: funderName || 'exchange', type: 'cex' };
  }
  // 3) classify by display name (broader than CEX-only)
  const fromName = classifyEntityFromLabel(funderName);
  if (fromName) return fromName;
  return null;
}

/** Map a Solscan-returned label string ("Binance 2", "Coinbase 5") to a canonical CEX name. */
function canonicalCexFromLabel(label: string | null): string | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  const match = CEX_KEYWORDS.find(k => lower.includes(k));
  if (!match) return null;
  // Title-case + special-case fixups
  if (match === 'gate.io') return 'Gate.io';
  if (match === 'crypto.com') return 'Crypto.com';
  if (match === 'htx' || match === 'huobi') return 'HTX';
  return match.charAt(0).toUpperCase() + match.slice(1);
}

async function heliusFundedBy(
  walletAddress: string,
  apiKey: string,
  errors: string[]
): Promise<HeliusFundedByResult | null> {
  // Safety net: reject malformed addresses before burning Helius credits
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!base58Regex.test(walletAddress)) {
    const msg = `Invalid Base58 wallet address: ${walletAddress.slice(0, 16)}... — rejecting to save API credits`;
    console.error(`[mesh-kyc-deep-search] ${msg}`);
    errors.push(msg);
    return null;
  }
  // Extra heuristic: all-lowercase 40+ char addresses are likely corrupted mints
  if (walletAddress.length > 40 && walletAddress === walletAddress.toLowerCase()) {
    const msg = `Suspiciously all-lowercase address: ${walletAddress.slice(0, 16)}... — likely corrupted Base58`;
    console.error(`[mesh-kyc-deep-search] ${msg}`);
    errors.push(msg);
    return null;
  }
  try {
    const logger = createApiLogger({
      serviceName: 'helius',
      endpoint: '/v1/wallet/funded-by',
      tokenMint: walletAddress,
      functionName: 'mesh-kyc-deep-search',
      requestType: 'oracle_spider',
      credits: 1,
    });

    const resp = await fetch(
      `https://api.helius.xyz/v1/wallet/${walletAddress}/funded-by?api-key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (resp.status === 404) {
      await logger.complete(404, 'No funding transaction found');
      return null;
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      await logger.complete(resp.status, `Helius funded-by ${resp.status}: ${body.slice(0, 200)}`);
      errors.push(`Helius funded-by ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }

    await logger.complete(resp.status);
    const data: HeliusFundedByResult = await resp.json();
    console.log(`[KYCDeep] Helius funded-by: ${walletAddress.slice(0, 8)}... → funder=${data.funder?.slice(0, 8)} name="${data.funderName || 'unknown'}" type="${data.funderType || 'unknown'}" amount=${data.amount} SOL`);
    return data;
  } catch (e) {
    const msg = `Helius funded-by error: ${e instanceof Error ? e.message : 'timeout'}`;
    errors.push(msg);
    console.error(`[KYCDeep] ${msg}`);
    return null;
  }
}

/**
 * Solscan-first per-hop funder discovery. Uses
 *   1) /v2.0/account/transfer (top SOL funder) — solscanDiscoverFunders
 *   2) /v2.0/account/detail   (CEX label on the funder) — solscanCheckAccountLabel
 * Returns null if Solscan can't identify a funder so the caller can fall back
 * to Helius. Cuts Helius usage drastically: every chain step that Solscan can
 * resolve costs 1–2 cheap Solscan credits instead of a Helius funded-by call.
 */
async function solscanFundedBy(
  walletAddress: string,
  errors: string[]
): Promise<HeliusFundedByResult | null> {
  try {
    const funders = await solscanDiscoverFunders(walletAddress, errors, 1);
    if (!funders || funders.length === 0) return null;
    const top = funders[0];
    if (!top?.wallet) return null;

    // Cheap label probe on the funder so we can short-circuit if it's a CEX.
    let funderName: string | null = null;
    let funderType: string | null = null;
    try {
      const label = await solscanCheckAccountLabel(top.wallet, errors);
      if (label?.label) funderName = label.label;
      if (label?.isCex) funderType = 'exchange';
    } catch { /* non-fatal */ }

    return {
      funder: top.wallet,
      funderName,
      funderType,
      amount: top.amountSol || 0,
      amountRaw: String(Math.round((top.amountSol || 0) * 1e9)),
      signature: top.txSignature || '',
      timestamp: top.timestamp || 0,
      slot: 0,
    };
  } catch (e) {
    const msg = `Solscan funded-by error: ${e instanceof Error ? e.message : 'timeout'}`;
    errors.push(msg);
    return null;
  }
}

/**
 * Per-hop funder lookup: Solscan first (cheap), Helius fallback (expensive).
 */
async function tryFundedBy(
  walletAddress: string,
  heliusApiKey: string,
  errors: string[]
): Promise<HeliusFundedByResult | null> {
  const viaSolscan = await solscanFundedBy(walletAddress, errors);
  if (viaSolscan) {
    console.log(`[KYCDeep] ⚡ Solscan-hop ${walletAddress.slice(0, 8)} → funder ${viaSolscan.funder.slice(0, 8)} (${viaSolscan.funderName || 'unlabeled'})`);
    return viaSolscan;
  }
  return await heliusFundedBy(walletAddress, heliusApiKey, errors);
}

/**
 * Discover sibling wallets: "Who else did this funder send SOL to?"
 * This exposes bundle/coordinated wallet networks.
 */
async function discoverSiblings(
  funderWallet: string,
  apiKey: string,
  knownWallets: Set<string>,
  maxSiblings: number = 30
): Promise<Array<{ wallet: string; amountSol: number }>> {
  const siblings: Array<{ wallet: string; amountSol: number }> = [];
  
  try {
    // Use Helius enhanced transactions to find outgoing SOL transfers
    const resp = await fetch(`https://api.helius.xyz/v0/addresses/${funderWallet}/transactions?api-key=${apiKey}&type=TRANSFER&limit=100`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) return siblings;

    const txs: any[] = await resp.json();
    const recipientMap = new Map<string, number>();

    for (const tx of txs) {
      // Check native transfers (SOL movements)
      const nativeTransfers = tx.nativeTransfers || [];
      for (const nt of nativeTransfers) {
        if (nt.fromUserAccount === funderWallet && nt.toUserAccount !== funderWallet) {
          const recipient = nt.toUserAccount;
          const amountSol = (nt.amount || 0) / 1e9;
          if (amountSol >= 0.01) { // Min 0.01 SOL to be meaningful
            recipientMap.set(recipient, (recipientMap.get(recipient) || 0) + amountSol);
          }
        }
      }
    }

    // Sort by amount and take top siblings
    const sorted = [...recipientMap.entries()]
      .filter(([wallet]) => !knownWallets.has(wallet))
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSiblings);

    for (const [wallet, amountSol] of sorted) {
      siblings.push({ wallet, amountSol });
    }

    console.log(`[KYCDeep] Siblings of ${funderWallet.slice(0, 8)}: ${siblings.length} recipients found (${txs.length} txs scanned)`);
  } catch (e) {
    console.warn(`[KYCDeep] Sibling discovery failed for ${funderWallet.slice(0, 8)}: ${e}`);
  }

  return siblings;
}

// Deep KYC root search: traces funding chain upward (depth 5+) AND discovers sibling wallets
// Now powered by Helius /v1/wallet/{address}/funded-by + enhanced transactions
Deno.serve(withRunLog('mesh-kyc-deep-search', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) throw new Error('HELIUS_API_KEY not configured');

    const { walletAddress, maxDepth, discoverBundle } = await req.json();
    if (!walletAddress) throw new Error('walletAddress required');

    const depth = Math.min(maxDepth || 5, 8);
    const shouldDiscoverBundle = discoverBundle !== false; // Default: true
    console.log(`[KYCDeep] Starting depth-${depth} Helius trace for ${walletAddress} (bundle discovery: ${shouldDiscoverBundle})`);

    // Warm DB-backed CEX dictionary so isKnownCex hits the latest labels
    // (file dictionary + every wallet ever discovered via Solscan label).
    try { await warmCexCache(); } catch { /* non-fatal */ }

    // ═══ SOLSCAN-DIRECT FAST PATH ═══
    // Solscan Pro v2 already returns the wallet's "funded_by" label in a single
    // /account/detail call. If that label is a known CEX, we can return a KYC
    // root in 1 API hit instead of walking up to 8 hops via Helius.
    try {
      const solscanErrors: string[] = [];
      const fast = await solscanCheckAccountLabel(walletAddress, solscanErrors);
      const directCex = canonicalCexFromLabel(fast.label);
      if (fast.isCex && directCex) {
        console.log(`[KYCDeep] ⚡ Solscan-direct hit: ${walletAddress.slice(0, 8)}... funded_by="${fast.label}" → ${directCex}`);

        // Self-expand the dictionary so future calls don't even need Solscan.
        // We tag this wallet's *funder* as the CEX address only if we can later
        // trace it; for now we just record the direct relationship in the mesh.
        await assertUpsert(supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'wallet',
            source_id: walletAddress,
            linked_type: 'kyc_root',
            linked_id: directCex,
            relationship: 'is_kyc_root',
            confidence: 95,
            discovered_via: 'mesh-kyc-deep-search:solscan-direct',
            discovered_at: new Date().toISOString(),
            evidence: { source: 'solscan-account-detail', rawLabel: fast.label, tags: fast.tags },
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true }), 'reputation_mesh');

        // ═══ CRITICAL: Persist KYC verification on the developer profile ═══
        // Without this, master_token_directory.kyc_verified stays false forever
        // because the matview reads developer_profiles.kyc_verified, not reputation_mesh.
        await assertUpsert(supabase
          .from('developer_profiles')
          .upsert({
            master_wallet_address: walletAddress,
            kyc_verified: true,
            kyc_source: `solscan_direct:${directCex}`,
            kyc_verification_date: new Date().toISOString(),
            kyc_last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'master_wallet_address', ignoreDuplicates: false }), 'developer_profiles');

        // ── KYC Discovery Log (fast path) ──
        {
          const { data: toks } = await supabase
            .from('master_token_directory')
            .select('token_mint')
            .eq('creator_wallet', walletAddress)
            .limit(50);
          const tokenList = (toks ?? []).map(t => t.token_mint as string);
          await assertUpsert(supabase.from('kyc_discovery_log').upsert({
            dev_wallet: walletAddress,
            kyc_wallet: walletAddress,
            kyc_label: directCex,
            kyc_source: `solscan_direct:${directCex}`,
            chain: [{ wallet: walletAddress, depth: 0, funderName: directCex, funderType: 'cex' }],
            chain_depth: 0,
            tokens: tokenList,
            token_count: tokenList.length,
            discovered_via: 'mesh-kyc-deep-search:solscan-direct',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'dev_wallet,kyc_wallet', ignoreDuplicates: true }), 'kyc_discovery_log');
        }

        return new Response(
          JSON.stringify({
            walletAddress,
            kycRoot: walletAddress,        // wallet itself is the leaf node funded by CEX
            kycRootLabel: directCex,
            kycRootCex: directCex,
            chainDepth: 0,
            walletsTraced: 1,
            meshLinksAdded: 1,
            siblingCount: 0,
            chain: [],
            siblings: [],
            fastPath: 'solscan-direct',
            errors: solscanErrors,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (fast.label) {
        console.log(`[KYCDeep] Solscan-direct: ${walletAddress.slice(0, 8)} has label "${fast.label}" but not a known CEX — falling through to BFS`);
      }
    } catch (e) {
      console.warn('[KYCDeep] Solscan-direct fast path failed, falling through:', e);
    }

    const visited = new Set<string>();
    const chain: Array<{ wallet: string; funder: string; funderName: string | null; funderType: string | null; amountSol: number; depth: number }> = [];
    const errors: string[] = [];
    let kycRoot: string | null = null;
    let kycRootLabel: string | null = null;
    let meshLinksAdded = 0;
    const siblingWallets: Array<{ wallet: string; amountSol: number; fundedBy: string }> = [];

    const knownCexWallets = new Set<string>();

    // BFS upward through funding chain
    const queue: Array<{ wallet: string; depth: number }> = [{ wallet: walletAddress, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.wallet) || current.depth >= depth) continue;
      visited.add(current.wallet);

      console.log(`[KYCDeep] Tracing depth ${current.depth}: ${current.wallet.slice(0, 12)}...`);

      const funding = await tryFundedBy(current.wallet, heliusApiKey, errors);

      if (!funding) {
        if (current.depth > 0 && !kycRoot) {
          kycRoot = current.wallet;
          console.log(`[KYCDeep] Potential KYC root at depth ${current.depth}: ${current.wallet.slice(0, 12)} (no further funders)`);
        }
        continue;
      }

      chain.push({
        wallet: current.wallet,
        funder: funding.funder,
        funderName: funding.funderName,
        funderType: funding.funderType,
        amountSol: funding.amount,
        depth: current.depth + 1,
      });

      {
        const entity = identifyKycEntity(funding.funder, funding.funderName, funding.funderType);
        if (entity) {
          knownCexWallets.add(funding.funder);
          kycRoot = current.wallet;
          kycRootLabel = entity.name;
          (globalThis as any).__lastEntityType = entity.type;
          console.log(`[KYCDeep] 🏦 ${entity.type.toUpperCase()}-funded KYC root: ${current.wallet.slice(0, 12)} (funded by "${entity.name}" ${funding.funder.slice(0, 8)})`);
          // Self-expand: record this funder under correct entity_type.
          if (!getEntityCached(funding.funder)) {
            await recordCexWallet({
              wallet: funding.funder,
              cexName: entity.name,
              cexLabel: funding.funderName || entity.name,
              source: `mesh-kyc-deep-search:${entity.type}`,
              verified: false,
              entityType: entity.type,
            });
          }
          continue;
        }
      }

      // Write mesh link for the funding relationship — assertUpsert throws on failure
      await assertUpsert(supabase
        .from('reputation_mesh')
        .upsert({
          source_type: 'wallet',
          source_id: funding.funder,
          linked_type: 'wallet',
          linked_id: current.wallet,
          relationship: 'funded_by',
          confidence: Math.min(95, 60 + funding.amount * 5),
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true }), 'reputation_mesh');
      meshLinksAdded++;

      // ═══ SIBLING DISCOVERY: Find other wallets funded by this same funder ═══
      if (shouldDiscoverBundle && !knownCexWallets.has(funding.funder) && current.depth <= 5) {
        const siblings = await discoverSiblings(funding.funder, heliusApiKey, visited, 50);
        
        for (const sib of siblings) {
          siblingWallets.push({ ...sib, fundedBy: funding.funder });
          
          // Write sibling mesh links — assert throws on failure
          await assertUpsert(supabase
            .from('reputation_mesh')
            .upsert({
              source_type: 'wallet',
              source_id: funding.funder,
              linked_type: 'wallet',
              linked_id: sib.wallet,
              relationship: 'funded_by',
              confidence: Math.min(90, 50 + sib.amountSol * 3),
              discovered_via: 'mesh-kyc-deep-search:sibling',
              discovered_at: new Date().toISOString(),
              evidence: { amountSol: sib.amountSol, siblingOf: current.wallet },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true }), 'reputation_mesh');
          meshLinksAdded++;
        }

        if (siblings.length > 0) {
          console.log(`[KYCDeep] 🕸️ Found ${siblings.length} sibling wallets funded by ${funding.funder.slice(0, 8)}`);
        }
      }

      if (!visited.has(funding.funder) && !knownCexWallets.has(funding.funder)) {
        queue.push({ wallet: funding.funder, depth: current.depth + 1 });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    // If we found a KYC root, mark it in the mesh
    if (kycRoot && kycRoot !== walletAddress) {
      // ═══ MINT-AS-WALLET GUARD ═══
      // Defensive: if walletAddress is actually a mint (ends in `pump`/`bonk`),
      // skip writing it as a wallet under same_kyc_root — that would make the
      // bubble map render it twice (gold token + green wallet bubble).
      const isMint = (id: string) =>
        typeof id === 'string' && (id.endsWith('pump') || id.endsWith('bonk'));
      await assertUpsert(supabase
        .from('reputation_mesh')
        .upsert({
          source_type: 'wallet',
          source_id: kycRoot,
          linked_type: 'kyc_root',
          linked_id: kycRoot,
          relationship: 'is_kyc_root',
          confidence: 95,
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true }), 'reputation_mesh');
      meshLinksAdded++;

      if (!isMint(walletAddress)) {
        await assertUpsert(supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'kyc_root',
            source_id: kycRoot,
            linked_type: 'wallet',
            linked_id: walletAddress,
            relationship: 'same_kyc_root',
            confidence: 85,
            discovered_via: 'mesh-kyc-deep-search',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true }), 'reputation_mesh');
        meshLinksAdded++;
      }

      // Mark intermediate wallets AND sibling wallets under same KYC root
      const allWalletsUnderKyc = [
        ...chain.map(c => c.wallet),
        ...siblingWallets.map(s => s.wallet),
      ];
      
      for (const wallet of allWalletsUnderKyc) {
        if (wallet === kycRoot) continue;
        if (isMint(wallet)) continue; // skip mint addresses misclassified as wallets
        await assertUpsert(supabase
          .from('reputation_mesh')
          .upsert({
            source_type: 'kyc_root',
            source_id: kycRoot,
            linked_type: 'wallet',
            linked_id: wallet,
            relationship: 'same_kyc_root',
            confidence: 70,
            discovered_via: 'mesh-kyc-deep-search',
            discovered_at: new Date().toISOString(),
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true }), 'reputation_mesh');
        meshLinksAdded++;
      }
    }

    console.log(`[KYCDeep] Done: ${chain.length} chain links, ${siblingWallets.length} siblings, KYC root: ${kycRoot?.slice(0, 12) || 'not found'} (${kycRootLabel || 'N/A'}), ${meshLinksAdded} mesh links added`);

    // Prefer our own curated label over Helius's "funderName" — guarantees
    // we always say "Binance" instead of "Binance Hot Wallet 7" or null.
    const ourEntity = kycRoot ? getEntityCached(kycRoot) : null;
    const ourCexLabel = ourEntity?.name ?? null;
    const finalKycLabel = ourCexLabel ?? kycRootLabel ?? null;
    const finalEntityType: string =
      (globalThis as any).__lastEntityType ?? ourEntity?.type ?? (kycRoot ? 'cex' : 'unknown');

    // ═══ CRITICAL: Persist KYC outcome on the developer profile ═══
    // - On hit: kyc_verified=true so master_token_directory matview flips green.
    // - On miss: still stamp kyc_last_checked_at so the backfill loop can move on
    //   to the next wallet instead of re-tracing this one every run.
    const profilePayload: Record<string, unknown> = {
      master_wallet_address: walletAddress,
      kyc_last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (kycRoot) {
      profilePayload.kyc_verified = true;
      profilePayload.kyc_source = finalKycLabel
        ? `${finalEntityType}_chain:${finalKycLabel}`
        : `${finalEntityType}_chain`;
      profilePayload.kyc_source_type = finalEntityType;
      profilePayload.kyc_trail_status = 'verified';
      profilePayload.kyc_verification_date = new Date().toISOString();
    } else {
      // No KYC root found within depth budget. Tag the trail outcome so the
      // UI can distinguish "we couldn't trace" from "self-custody origin".
      // chain.length === 0 → no funding info at any depth → likely self-custody.
      // chain.length > 0 but exhausted → depth limit hit, may resolve later.
      profilePayload.kyc_trail_status = chain.length === 0 ? 'trail_no_kyc' : 'trail_incomplete';
    }
    await assertUpsert(supabase
      .from('developer_profiles')
      .upsert(profilePayload, { onConflict: 'master_wallet_address', ignoreDuplicates: false }),
      'developer_profiles');

    // ── KYC Discovery Log (BFS path) ──
    if (kycRoot) {
      {
        const { data: toks } = await supabase
          .from('master_token_directory')
          .select('token_mint')
          .eq('creator_wallet', walletAddress)
          .limit(50);
        const tokenList = (toks ?? []).map(t => t.token_mint as string);
        await assertUpsert(supabase.from('kyc_discovery_log').upsert({
          dev_wallet: walletAddress,
          kyc_wallet: kycRoot,
          kyc_label: finalKycLabel,
          kyc_source: profilePayload.kyc_source as string ?? null,
          chain: chain.map(c => ({
            wallet: c.wallet, funder: c.funder, funderName: c.funderName,
            funderType: c.funderType, amountSol: c.amountSol, depth: c.depth,
          })),
          chain_depth: chain.length,
          tokens: tokenList,
          token_count: tokenList.length,
          discovered_via: 'mesh-kyc-deep-search',
          discovered_at: new Date().toISOString(),
        }, { onConflict: 'dev_wallet,kyc_wallet', ignoreDuplicates: true }), 'kyc_discovery_log');
      }
    }

    return new Response(
      JSON.stringify({
        walletAddress,
        kycRoot,
        kycRootLabel: finalKycLabel,
        kycRootCex: ourCexLabel, // explicit: name from our curated list (null if not in our DB)
        chainDepth: chain.length,
        walletsTraced: visited.size,
        meshLinksAdded,
        siblingCount: siblingWallets.length,
        chain: chain.map(c => ({
          wallet: c.wallet,
          funder: c.funder,
          funderName: c.funderName,
          funderType: c.funderType,
          amountSol: c.amountSol,
          depth: c.depth,
        })),
        siblings: siblingWallets.slice(0, 20).map(s => ({
          wallet: s.wallet,
          amountSol: s.amountSol,
          fundedBy: s.fundedBy,
        })),
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[KYCDeep] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}));

