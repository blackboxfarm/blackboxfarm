/**
 * autopsy-dev-context
 *
 * Builds a DevDossier for a creator wallet by aggregating:
 *   - direct dev_behavior_scores + dev_wallet_reputation
 *   - prior tokens by the same wallet (pumpfun_watchlist)
 *   - cluster siblings via wallet_family_members + developer_genealogy
 *   - prior tokens across ALL cluster wallets
 *   - allstar status
 *
 * The dossier is fed into classifyDeath() and into the writer's user prompt so the
 * report can reason about repeat-pattern actors even when the immediate on-chain
 * footprint is ambiguous.
 */

import type { DevDossier } from './autopsy-taxonomy.ts';
import { discoverFundingChain } from './funding-resolver.ts';
import { isCexWallet, getCexName } from './cex-wallets.ts';
import { heliusRpcFetch } from './helius-client.ts';
import { getSolPriceQuick } from './sol-price-cache.ts';

export async function buildDevDossier(
  supabase: any,
  creatorWallet: string | null | undefined,
): Promise<DevDossier> {
  const dossier: DevDossier = {
    wallet: creatorWallet ?? null,
    cluster_wallets: [],
    prior_tokens: [],
    cluster_history_summary: {
      total_prior_tokens: 0,
      dead_count: 0,
      rug_count: 0,
      soft_rug_count: 0,
      natural_cycle_count: 0,
      allstar_count: 0,
    },
    reputation_verdict: 'clean',
    primary_evidence_strings: [],
  };

  if (!creatorWallet) return dossier;

  // ── Cluster discovery via wallet_family_members ─────────────
  let clusterWallets: string[] = [creatorWallet];
  let kycRoot: string | null = null;
  try {
    const { data: fam } = await supabase
      .from('wallet_family_members')
      .select('wallet_address, family_id, is_kyc_root')
      .eq('wallet_address', creatorWallet)
      .limit(1)
      .maybeSingle();
    if (fam?.family_id) {
      const { data: siblings } = await supabase
        .from('wallet_family_members')
        .select('wallet_address, is_kyc_root')
        .eq('family_id', fam.family_id)
        .limit(50);
      if (siblings) {
        clusterWallets = Array.from(new Set([creatorWallet, ...siblings.map((s: any) => s.wallet_address)]));
        const root = siblings.find((s: any) => s.is_kyc_root);
        if (root) kycRoot = root.wallet_address;
      }
    }
  } catch { /* table may not exist in all envs */ }

  // ── Genealogy fallback for KYC root ────────────────────────
  if (!kycRoot) {
    try {
      const { data: gen } = await supabase
        .from('developer_genealogy')
        .select('master_wallet_address')
        .eq('master_wallet_address', creatorWallet)
        .maybeSingle();
      if (gen?.master_wallet_address) kycRoot = gen.master_wallet_address;
    } catch { /* ignore */ }
  }

  dossier.cluster_wallets = clusterWallets;
  dossier.kyc_root = kycRoot;
  if (kycRoot) (dossier as any).kyc_source = 'wallet_family_members';

  // ── Funding-chain fallback: if no KYC root from mesh, walk the funder graph
  // until we hit a CEX (real KYC) or run out of hops.
  if (!kycRoot) {
    try {
      const chain = await discoverFundingChain(creatorWallet, 8);
      if (chain.kycRoot) {
        dossier.kyc_root = chain.kycRoot;
        (dossier as any).kyc_source = chain.kycRootLabel ? `cex_${chain.kycRootLabel}` : 'funding_chain';
        (dossier as any).funding_chain = chain.chain.map(c => ({
          funder: c.funder,
          label: c.funderName ?? c.funderType ?? null,
          amount_sol: c.amountSol,
          is_cex: c.isCex,
        }));
      } else if (chain.chain.length > 0) {
        // No CEX terminus, but we DID find at least one funder hop.
        const last = chain.chain[chain.chain.length - 1];
        dossier.kyc_root = last.funder;
        (dossier as any).kyc_source = isCexWallet(last.funder)
          ? `cex_${getCexName(last.funder) ?? 'unknown'}`
          : 'funding_chain_partial';
        (dossier as any).funding_chain = chain.chain.map(c => ({
          funder: c.funder,
          label: c.funderName ?? c.funderType ?? null,
          amount_sol: c.amountSol,
          is_cex: c.isCex,
        }));
      }
    } catch (e) {
      console.warn('[dev-context] funding chain fallback failed:', (e as Error).message);
    }
  }

  // ── Dev realised value: SOL still sitting in dev wallet right now ──
  // A dev who "abandoned" a token while holding $3K of SOL in their pump.fun
  // profile is the smoking gun for "they cashed out, they didn't lose."
  try {
    const balRes = await heliusRpcFetch('getBalance', [creatorWallet]).catch(() => null);
    const lamports = balRes?.result?.value ?? null;
    if (typeof lamports === 'number' && lamports > 0) {
      const sol = lamports / 1_000_000_000;
      const solUsd = await getSolPriceQuick().catch(() => 0);
      const usd = solUsd > 0 ? sol * solUsd : null;
      (dossier as any).dev_wallet_sol_balance = sol;
      (dossier as any).dev_realized_value_usd = usd;
      if (usd && usd >= 500) {
        dossier.primary_evidence_strings = [
          ...(dossier.primary_evidence_strings ?? []),
          `Dev wallet currently holds ${sol.toFixed(2)} SOL (~$${Math.round(usd).toLocaleString()}) — funds were not lost.`,
        ];
      }
    }
  } catch (e) {
    console.warn('[dev-context] dev balance read failed:', (e as Error).message);
  }

  // ── Prior tokens across all cluster wallets ────────────────
  try {
    const { data: prior } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, market_cap_usd, price_ath_usd, status, removal_reason, creator_wallet')
      .in('creator_wallet', clusterWallets)
      .order('first_seen_at', { ascending: false })
      .limit(50);

    for (const t of prior ?? []) {
      dossier.prior_tokens!.push({
        wallet: t.creator_wallet,
        mint: t.token_mint,
        ath_mcap_usd: t.price_ath_usd ?? t.market_cap_usd ?? null,
        status: t.status ?? null,
        death_cause: t.removal_reason ?? null,
      });
    }
  } catch { /* ignore */ }

  // ── Allstar detections across cluster ──────────────────────
  let allstarCount = 0;
  try {
    const { data: stars } = await supabase
      .from('allstar_mint_alerts')
      .select('id')
      .in('creator_wallet', clusterWallets);
    allstarCount = stars?.length ?? 0;
  } catch { /* ignore */ }

  // ── Direct reputation rollup ───────────────────────────────
  let rugCount = 0;
  let softRugCount = 0;
  try {
    const { data: reps } = await supabase
      .from('dev_wallet_reputation')
      .select('wallet_address, tokens_rugged, tokens_abandoned, total_tokens_launched')
      .in('wallet_address', clusterWallets);
    for (const r of reps ?? []) {
      rugCount += Number(r.tokens_rugged ?? 0);
      softRugCount += Number(r.tokens_abandoned ?? 0);
    }
  } catch { /* ignore */ }

  // ── Summarize ──────────────────────────────────────────────
  const priors = dossier.prior_tokens ?? [];
  const deadCount = priors.filter(p => p.status && /dead|removed|rug/i.test(p.status || '')).length;
  const naturalCount = priors.filter(p => /natural|cycle|graduated/i.test(p.status || '')).length;

  dossier.cluster_history_summary = {
    total_prior_tokens: priors.length,
    dead_count: deadCount,
    rug_count: rugCount,
    soft_rug_count: softRugCount,
    natural_cycle_count: naturalCount,
    allstar_count: allstarCount,
  };

  // ── Verdict ────────────────────────────────────────────────
  const totalRugs = rugCount + softRugCount;
  if (totalRugs >= 3) dossier.reputation_verdict = 'serial_rugger';
  else if (totalRugs >= 2 || deadCount >= 3) dossier.reputation_verdict = 'repeat_offender';
  else if (totalRugs >= 1 || deadCount >= 1) dossier.reputation_verdict = 'mixed';
  else dossier.reputation_verdict = 'clean';

  // ── Evidence strings (ready-made for the .md) ──────────────
  const ev: string[] = [];
  if (kycRoot && kycRoot !== creatorWallet) ev.push(`KYC root identified: ${kycRoot}`);
  if (clusterWallets.length > 1) ev.push(`Cluster size: ${clusterWallets.length} linked wallets`);
  if (priors.length > 0) ev.push(`Cluster has launched ${priors.length} tokens; ${deadCount} dead, ${rugCount} rugged, ${softRugCount} abandoned.`);
  if (allstarCount > 0) ev.push(`Cluster has ${allstarCount} allstar detection${allstarCount > 1 ? 's' : ''}.`);
  if (dossier.reputation_verdict === 'serial_rugger') ev.push(`SERIAL RUGGER pattern: ${totalRugs} prior rugs/abandonments across cluster.`);
  else if (dossier.reputation_verdict === 'clean' && priors.length === 0) ev.push('Clean dossier — first traceable token from this wallet/cluster.');
  dossier.primary_evidence_strings = ev;

  // ── Cluster lifetime marketing spend (boosts + dex paid) ───
  try {
    const clusterMints = (dossier.prior_tokens ?? []).map(p => p.mint).filter(Boolean);
    if (clusterMints.length > 0) {
      const [{ data: bh }, { data: po }] = await Promise.all([
        supabase.from('token_boost_history')
          .select('token_mint, total_amount')
          .in('token_mint', clusterMints),
        supabase.from('token_paid_orders')
          .select('token_mint, order_type, status')
          .in('token_mint', clusterMints)
          .eq('status', 'approved'),
      ]);
      const peakByMint = new Map<string, number>();
      for (const r of bh ?? []) {
        const m = r.token_mint as string;
        const v = Number(r.total_amount ?? 0);
        if (!peakByMint.has(m) || v > (peakByMint.get(m) ?? 0)) peakByMint.set(m, v);
      }
      const dexPaidMints = new Set(
        (po ?? [])
          .filter((o: any) => o.order_type === 'tokenProfile' || o.order_type === 'communityTakeover')
          .map((o: any) => o.token_mint),
      );
      const lifetimePeak = Array.from(peakByMint.values()).reduce((a, b) => a + b, 0);
      dossier.cluster_marketing_spend = {
        lifetime_boost_peak: lifetimePeak,
        tokens_with_boosts: Array.from(peakByMint.values()).filter(v => v > 0).length,
        tokens_with_dex_paid: dexPaidMints.size,
      };
      if (lifetimePeak > 0) {
        dossier.primary_evidence_strings = [
          ...(dossier.primary_evidence_strings ?? []),
          `Cluster has invested in marketing across prior tokens: peak boost tier sum ${lifetimePeak}, ${dexPaidMints.size} dex-paid token(s).`,
        ];
      }
    }
  } catch (e) { console.warn('[dev-context] marketing spend rollup failed:', (e as Error).message); }

  return dossier;
}