/**
 * AUTO-GENEALOGY TRACER
 * 
 * Lightweight parent wallet discovery (2-3 depth) that runs automatically
 * when a wallet enters the rejection mesh. Uses Helius RPC to find
 * incoming SOL transfers and builds a funding pyramid.
 * 
 * Also cross-links X accounts from launchpad_creator_profiles.
 * 
 * Rate-limit aware: adds delays between RPC calls.
 */

import { getHeliusRpcUrl } from './helius-client.ts';

// Known CEX hot wallets — stop tracing when we hit one
const CEX_WALLETS: Record<string, string> = {
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': 'Binance',
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': 'Binance',
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS': 'Coinbase',
  'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE': 'Coinbase',
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S': 'Coinbase',
  'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz': 'Kraken',
  'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2': 'Bybit',
  '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD': 'OKX',
  'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6': 'KuCoin',
};

const MAX_DEPTH = 3;
const MIN_SOL = 0.1;

interface ParentWallet {
  wallet: string;
  depth: number;
  amountSol: number;
  cexName?: string;
}

interface GenealogyResult {
  parentWallets: ParentWallet[];
  xAccounts: string[];
  cexSources: string[];
}

/**
 * Trace 2-3 depth parent wallets for a given wallet using Helius RPC.
 * Returns parent wallets, discovered X accounts, and CEX sources.
 */
export async function traceParentWallets(
  supabase: any,
  wallet: string,
  source: string,
): Promise<GenealogyResult> {
  const result: GenealogyResult = {
    parentWallets: [],
    xAccounts: [],
    cexSources: [],
  };

  const visited = new Set<string>();

  try {
    await traceDepth(wallet, 1, visited, result);
  } catch (err) {
    console.error(`[auto-genealogy] Error tracing ${wallet.slice(0, 8)}...: ${err}`);
  }

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
): Promise<void> {
  if (depth > MAX_DEPTH || visited.has(wallet)) return;
  visited.add(wallet);

  // Check if CEX
  const cex = CEX_WALLETS[wallet];
  if (cex) {
    result.cexSources.push(cex);
    return;
  }

  // Rate limit: small delay between calls
  if (depth > 1) await new Promise(r => setTimeout(r, 200));

  try {
    const rpcUrl = getHeliusRpcUrl();

    // Get recent signatures
    const sigResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'genealogy-sigs',
        method: 'getSignaturesForAddress',
        params: [wallet, { limit: 20 }],
      }),
    });

    if (!sigResp.ok) {
      console.warn(`[auto-genealogy] RPC sigs failed for ${wallet.slice(0, 8)}: ${sigResp.status}`);
      return;
    }

    const sigData = await sigResp.json();
    const signatures = sigData.result?.slice(0, 10) || [];

    if (signatures.length === 0) return;

    // Fetch parsed transactions
    const txResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'genealogy-txs',
        method: 'getTransaction',
        params: [signatures[0].signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });

    // Use Helius enhanced transactions API for better native transfer parsing
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusKey) return;

    const enhancedResp = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${heliusKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: signatures.slice(0, 10).map((s: any) => s.signature),
        }),
      },
    );

    if (!enhancedResp.ok) {
      console.warn(`[auto-genealogy] Helius enhanced API failed: ${enhancedResp.status}`);
      return;
    }

    const enhancedTxs = await enhancedResp.json();

    // Find incoming SOL transfers
    const funders = new Map<string, number>(); // wallet -> total SOL received

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

    // Sort by amount, take top 3 funders
    const topFunders = [...funders.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [funderWallet, amount] of topFunders) {
      result.parentWallets.push({
        wallet: funderWallet,
        depth,
        amountSol: amount,
        cexName: CEX_WALLETS[funderWallet],
      });

      // Recurse deeper
      await traceDepth(funderWallet, depth + 1, visited, result);
    }
  } catch (err) {
    console.warn(`[auto-genealogy] Trace error at depth ${depth}: ${err}`);
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
        })
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
