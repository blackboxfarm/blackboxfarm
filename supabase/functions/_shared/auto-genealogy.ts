/**
 * AUTO-GENEALOGY TRACER
 * 
 * Solscan-style "Funded by" tracer: linear recursive walk that follows the
 * single largest funder of each wallet until it reaches a known CEX deposit
 * address (KYC root) or runs out of upstream SOL transfers.
 * 
 * Cost-equivalent to Solscan: 1 Helius enhanced-tx call per hop, ~20 hops max.
 * Branching is intentionally narrow (top-1, with top-2 near the root) to avoid
 * exponential RPC explosions while still allowing some near-source diversity.
 * 
 * Also cross-links X accounts from launchpad_creator_profiles.
 * 
 * Rate-limit aware: adds delays between RPC calls.
 */

import { getHeliusRpcUrl } from './helius-client.ts';
import { getCexName } from './cex-wallets.ts';
import { solscanDiscoverFunders } from './solscan-intelligence.ts';

const MAX_DEPTH = 20;          // Solscan-style reach; KYC roots usually 8–15 hops
const MIN_SOL = 0.01;          // Catch dust-funded temp wallets (1¢-ish at $85 SOL)
const NEAR_ROOT_BRANCH_DEPTH = 3; // depth ≤ 3 → follow top-2 funders
const SIG_LOOKBACK = 50;       // pull 50 sigs, parse top 25
const SIG_PARSE_LIMIT = 25;

interface ParentWallet {
  wallet: string;
  depth: number;
  amountSol: number;
  cexName?: string;
}

export type TrailEndReason =
  | 'hit_cex'                       // success — KYC root found
  | 'depth_cap'                     // reached MAX_DEPTH without a CEX
  | 'no_funders_above_threshold'    // wallet has no incoming SOL ≥ MIN_SOL
  | 'unclassified_funder'           // funder exists but isn't in any of our maps
  | 'rpc_error'                     // Helius/RPC call failed
  | 'cycle_detected'                // walked back into a visited wallet
  | 'in_progress';                  // not yet terminated (initial state)

interface GenealogyResult {
  parentWallets: ParentWallet[];
  xAccounts: string[];
  cexSources: string[];
  trailEndReason: TrailEndReason;
  trailEndedAtDepth: number;
  trailEndedAtWallet: string | null;
}

/**
 * Trace upstream funders for a wallet using Helius RPC, Solscan-style.
 * Walks the single biggest "Funded by" link recursively until it hits a CEX
 * (success) or exhausts the trail. Returns parent wallets, discovered X
 * accounts, CEX sources, and an explicit trail-end reason.
 */
export async function traceParentWallets(
  supabase: any,
  wallet: string,
  source: string,
  opts?: { maxDepth?: number },
): Promise<GenealogyResult> {
  const result: GenealogyResult = {
    parentWallets: [],
    xAccounts: [],
    cexSources: [],
    trailEndReason: 'in_progress',
    trailEndedAtDepth: 0,
    trailEndedAtWallet: null,
  };

  const visited = new Set<string>();
  const effectiveMaxDepth = Math.max(1, Math.min(MAX_DEPTH, opts?.maxDepth ?? MAX_DEPTH));

  try {
    await traceDepth(wallet, 1, visited, result, effectiveMaxDepth);
  } catch (err) {
    console.error(`[auto-genealogy] Error tracing ${wallet.slice(0, 8)}...: ${err}`);
    if (result.trailEndReason === 'in_progress') {
      result.trailEndReason = 'rpc_error';
      result.trailEndedAtWallet = wallet;
    }
  }

  console.log(`[auto-genealogy] Trail for ${wallet.slice(0, 8)}... ended: ${result.trailEndReason} at depth ${result.trailEndedAtDepth} (${result.parentWallets.length} hops, ${result.cexSources.length} CEX)`);

  // Cross-link X accounts from known profiles
  try {
    const allWallets = [wallet, ...result.parentWallets.map(p => p.wallet)];
    const { data: profiles } = await supabase
      .from('dev_wallet_reputation')
      .select('wallet_address, twitter_accounts')
      .in('wallet_address', allWallets);

    if (profiles) {
      for (const p of profiles) {
        if (p.twitter_accounts && Array.isArray(p.twitter_accounts)) {
          result.xAccounts.push(...p.twitter_accounts);
        }
      }
    }

    // Also check launchpad_creator_profiles for X handles
    const { data: creatorProfiles } = await supabase
      .from('pumpfun_watchlist')
      .select('metadata')
      .in('creator_wallet', allWallets)
      .not('metadata', 'is', null)
      .limit(20);

    if (creatorProfiles) {
      for (const cp of creatorProfiles) {
        const meta = cp.metadata;
        if (meta?.twitter) result.xAccounts.push(meta.twitter);
        if (meta?.x_handle) result.xAccounts.push(meta.x_handle);
      }
    }

    // Deduplicate X accounts
    result.xAccounts = [...new Set(result.xAccounts.filter(Boolean))];
  } catch (err) {
    console.warn(`[auto-genealogy] X account lookup error: ${err}`);
  }

  return result;
}

async function traceDepth(
  wallet: string,
  depth: number,
  visited: Set<string>,
  result: GenealogyResult,
  maxDepth: number = MAX_DEPTH,
): Promise<void> {
  if (visited.has(wallet)) {
    if (result.trailEndReason === 'in_progress') {
      result.trailEndReason = 'cycle_detected';
      result.trailEndedAtDepth = depth;
      result.trailEndedAtWallet = wallet;
    }
    return;
  }
  if (depth > maxDepth) {
    if (result.trailEndReason === 'in_progress') {
      result.trailEndReason = 'depth_cap';
      result.trailEndedAtDepth = depth - 1;
      result.trailEndedAtWallet = wallet;
    }
    return;
  }
  visited.add(wallet);

  // Check if CEX — successful KYC root reached
  const cex = getCexName(wallet);
  if (cex) {
    result.cexSources.push(cex);
    result.trailEndReason = 'hit_cex';
    result.trailEndedAtDepth = depth;
    result.trailEndedAtWallet = wallet;
    return;
  }

  // Rate limit: small delay between calls
  if (depth > 1) await new Promise(r => setTimeout(r, 200));

  try {
    const rpcUrl = getHeliusRpcUrl();

    // ── Phase 0b: SOLSCAN PRO v2.0 FAST PATH ──
    // Try /v2.0/account/transfer first (1 call, pre-parsed). Fallback to
    // Helius enhanced-tx API only if Solscan returns empty/errors.
    let funders = new Map<string, number>();
    try {
      const solscanFunders = await solscanDiscoverFunders(wallet, [], 1);
      for (const f of solscanFunders) {
        if (f.amountSol >= MIN_SOL && f.wallet !== wallet) {
          funders.set(f.wallet, (funders.get(f.wallet) || 0) + f.amountSol);
        }
      }
      if (funders.size > 0) {
        console.log(`[auto-genealogy] Solscan-Pro hop d=${depth} ${wallet.slice(0,8)} → ${funders.size} funders`);
      }
    } catch (e) {
      console.warn(`[auto-genealogy] Solscan-Pro hop failed for ${wallet.slice(0,8)}: ${e}`);
    }

    if (funders.size === 0) {
    // Get recent signatures (50, parse top 25)
    const sigResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'genealogy-sigs',
        method: 'getSignaturesForAddress',
        params: [wallet, { limit: SIG_LOOKBACK }],
      }),
    });

    if (!sigResp.ok) {
      console.warn(`[auto-genealogy] RPC sigs failed for ${wallet.slice(0, 8)}: ${sigResp.status}`);
      if (result.trailEndReason === 'in_progress') {
        result.trailEndReason = 'rpc_error';
        result.trailEndedAtDepth = depth;
        result.trailEndedAtWallet = wallet;
      }
      return;
    }

    const sigData = await sigResp.json();
    const signatures = sigData.result?.slice(0, SIG_PARSE_LIMIT) || [];

    if (signatures.length === 0) {
      if (result.trailEndReason === 'in_progress') {
        result.trailEndReason = 'no_funders_above_threshold';
        result.trailEndedAtDepth = depth;
        result.trailEndedAtWallet = wallet;
      }
      return;
    }

    // Use Helius enhanced transactions API for better native transfer parsing
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusKey) {
      if (result.trailEndReason === 'in_progress') {
        result.trailEndReason = 'rpc_error';
        result.trailEndedAtDepth = depth;
        result.trailEndedAtWallet = wallet;
      }
      return;
    }

    const enhancedResp = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${heliusKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: signatures.map((s: any) => s.signature),
        }),
      },
    );

    if (!enhancedResp.ok) {
      console.warn(`[auto-genealogy] Helius enhanced API failed: ${enhancedResp.status}`);
      if (result.trailEndReason === 'in_progress') {
        result.trailEndReason = 'rpc_error';
        result.trailEndedAtDepth = depth;
        result.trailEndedAtWallet = wallet;
      }
      return;
    }

    const enhancedTxs = await enhancedResp.json();

    for (const tx of enhancedTxs) {
      if (!tx.nativeTransfers) continue;
      for (const transfer of tx.nativeTransfers) {
        if (transfer.toUserAccount === wallet && transfer.fromUserAccount !== wallet) {
          const amountSol = transfer.amount / 1e9;
          if (amountSol >= MIN_SOL) {
            const existing = funders.get(transfer.fromUserAccount) || 0;
            funders.set(transfer.fromUserAccount, existing + amountSol);
          }
        }
      }
    }
    } // end Helius fallback block

    // Linear walk: follow the single biggest funder (top-2 near the root for diversity).
    // Matches Solscan's "Funded by" recursive click pattern.
    const branchWidth = depth <= NEAR_ROOT_BRANCH_DEPTH ? 2 : 1;
    const topFunders = [...funders.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, branchWidth);

    if (topFunders.length === 0) {
      if (result.trailEndReason === 'in_progress') {
        result.trailEndReason = 'no_funders_above_threshold';
        result.trailEndedAtDepth = depth;
        result.trailEndedAtWallet = wallet;
      }
      return;
    }

    // ── CEX-priority short-circuit ──
    // Before chasing the largest funder, scan ALL funders at this hop for a known
    // CEX address. Catches the common pattern where a small "seed" CEX deposit is
    // dwarfed by a larger peer-to-peer top-up. If found, lock the KYC root and stop.
    for (const [funderWallet, amount] of funders.entries()) {
      const cexHit = getCexName(funderWallet);
      if (cexHit) {
        result.parentWallets.push({
          wallet: funderWallet,
          depth,
          amountSol: amount,
          cexName: cexHit,
        });
        result.cexSources.push(cexHit);
        result.trailEndReason = 'hit_cex';
        result.trailEndedAtDepth = depth;
        result.trailEndedAtWallet = funderWallet;
        return;
      }
    }

    for (const [funderWallet, amount] of topFunders) {
      const funderCex = getCexName(funderWallet) ?? undefined;
      result.parentWallets.push({
        wallet: funderWallet,
        depth,
        amountSol: amount,
        cexName: funderCex,
      });

      // Recurse deeper
      await traceDepth(funderWallet, depth + 1, visited, result, maxDepth);
    }

    // If we walked all branches without success/explicit termination, the funders
    // existed but none classified as CEX or had upstream funders → unclassified.
    if (result.trailEndReason === 'in_progress') {
      result.trailEndReason = 'unclassified_funder';
      result.trailEndedAtDepth = depth;
      result.trailEndedAtWallet = topFunders[0][0];
    }
  } catch (err) {
    console.warn(`[auto-genealogy] Trace error at depth ${depth}: ${err}`);
    if (result.trailEndReason === 'in_progress') {
      result.trailEndReason = 'rpc_error';
      result.trailEndedAtDepth = depth;
      result.trailEndedAtWallet = wallet;
    }
  }
}

/**
 * Feed genealogy results into the mesh tables.
 * Call this after traceParentWallets returns.
 */
export async function meshGenealogyResults(
  supabase: any,
  targetWallet: string,
  genealogy: GenealogyResult,
  source: string,
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Update dev_wallet_reputation with discovered upstream wallets
  const upstreamAddresses = genealogy.parentWallets.map(p => p.wallet);
  const cexHit = genealogy.parentWallets.find((p) => p.cexName);
  const trailFields = {
    trail_end_reason: genealogy.trailEndReason,
    trail_end_kyc_root: cexHit?.wallet ?? null,
    trail_end_at: now,
  };

  if (upstreamAddresses.length > 0) {
    const { data: existing } = await supabase
      .from('dev_wallet_reputation')
      .select('id, upstream_wallets, twitter_accounts')
      .eq('wallet_address', targetWallet)
      .maybeSingle();

    if (existing) {
      const mergedUpstream = [...new Set([
        ...(existing.upstream_wallets || []),
        ...upstreamAddresses,
      ])];
      const mergedTwitter = [...new Set([
        ...(existing.twitter_accounts || []),
        ...genealogy.xAccounts,
      ])];

      await supabase
        .from('dev_wallet_reputation')
        .update({
          upstream_wallets: mergedUpstream,
          twitter_accounts: mergedTwitter,
          updated_at: now,
          ...trailFields,
        })
        .eq('id', existing.id);
    } else {
      // No reputation row yet — create a minimal one so we can record the trail end.
      await supabase
        .from('dev_wallet_reputation')
        .insert({
          wallet_address: targetWallet,
          upstream_wallets: upstreamAddresses,
          twitter_accounts: genealogy.xAccounts,
          trust_level: 'under_investigation',
          first_seen_at: now,
          last_activity_at: now,
          notes: `Auto-created by ${source} — trail ended: ${genealogy.trailEndReason}`,
          ...trailFields,
        });
    }
  } else if (genealogy.trailEndReason !== 'in_progress') {
    // Even with no upstream wallets, record the dead-end so we don't retrace.
    const { data: existing } = await supabase
      .from('dev_wallet_reputation')
      .select('id')
      .eq('wallet_address', targetWallet)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('dev_wallet_reputation')
        .update({ ...trailFields, updated_at: now })
        .eq('id', existing.id);
    }
  }

  // 2. Insert reputation_mesh links
  const meshLinks: any[] = [];

  // Parent wallet -> target wallet links
  for (const parent of genealogy.parentWallets) {
    meshLinks.push({
      source_type: 'wallet',
      source_id: parent.wallet,
      linked_type: 'wallet',
      linked_id: targetWallet,
      relationship: parent.depth === 1 ? 'directly_funded' : 'indirectly_funded',
      confidence: parent.depth === 1 ? 90 : 70,
      evidence: `${parent.cexName ? `CEX: ${parent.cexName}, ` : ''}${parent.amountSol.toFixed(2)} SOL at depth ${parent.depth}`,
      discovered_via: `auto-genealogy:${source}`,
    });
  }

  // X account -> wallet links
  for (const handle of genealogy.xAccounts.slice(0, 10)) {
    meshLinks.push({
      source_type: 'x_account',
      source_id: handle,
      linked_type: 'wallet',
      linked_id: targetWallet,
      relationship: 'linked_to_dev',
      confidence: 65,
      evidence: `X account discovered via auto-genealogy trace`,
      discovered_via: `auto-genealogy:${source}`,
    });
  }

  // Insert all links (ignore duplicates)
  for (const link of meshLinks) {
    const { error } = await supabase.from('reputation_mesh').insert(link);
    if (error && !error.message?.includes('duplicate') && !error.code?.includes('23505')) {
      console.warn(`[auto-genealogy] Mesh insert error: ${error.message}`);
    }
  }

  // 3. Auto-create reputation entries for parent wallets
  for (const parent of genealogy.parentWallets) {
    if (parent.cexName) continue; // Skip CEX wallets

    const { data: exists } = await supabase
      .from('dev_wallet_reputation')
      .select('id')
      .eq('wallet_address', parent.wallet)
      .maybeSingle();

    if (!exists) {
      await supabase.from('dev_wallet_reputation').insert({
        wallet_address: parent.wallet,
        total_tokens_launched: 0,
        trust_level: 'under_investigation',
        first_seen_at: now,
        last_activity_at: now,
        downstream_wallets: [targetWallet],
        notes: `Auto-discovered as depth-${parent.depth} funder of ${targetWallet.slice(0, 8)}... via ${source}`,
        metadata: { source: `auto-genealogy:${source}`, funded_amount_sol: parent.amountSol },
      });
    } else {
      // Update existing with downstream link
      const { data: rep } = await supabase
        .from('dev_wallet_reputation')
        .select('downstream_wallets')
        .eq('id', exists.id)
        .single();

      if (rep) {
        const downstream = [...new Set([...(rep.downstream_wallets || []), targetWallet])];
        await supabase
          .from('dev_wallet_reputation')
          .update({ downstream_wallets: downstream, updated_at: now })
          .eq('id', exists.id);
      }
    }
  }

  const parentCount = genealogy.parentWallets.length;
  const xCount = genealogy.xAccounts.length;
  const cexCount = genealogy.cexSources.length;
  console.log(`[auto-genealogy] ✅ Meshed ${targetWallet.slice(0, 8)}...: ${parentCount} parents, ${xCount} X accounts, ${cexCount} CEX sources`);
}
