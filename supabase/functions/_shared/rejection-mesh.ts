/**
 * REJECTION-TO-MESH UTILITY
 * 
 * When a token is rejected for bad-actor reasons (dev exit, bump bot, contract risk, etc.),
 * this utility feeds all known intel about the token into the blacklist mesh:
 * - dev_wallet_reputation: upsert creator wallet with rejection count
 * - reputation_mesh: link creator -> token, creator -> socials, creator -> parent wallets
 * - pumpfun_blacklist: auto-blacklist repeat offenders
 * - auto-genealogy: trace 2-3 depth parent wallets via Helius
 * 
 * Only mesh-worthy rejections are processed (not cosmetic/market condition rejections).
 */

import { traceParentWallets, meshGenealogyResults } from './auto-genealogy.ts';

// Rejection reasons that indicate bad actors and should be meshed
const MESH_WORTHY_REASONS = new Set([
  'dev_full_exit', 'dev_sold_crashed', 'dev_sold_graduated', 'dev_launched_new', 'dev_sold',
  'bump_bot_detected', 'bump_bot',
  'non_standard_supply', 'mint_authority', 'freeze_authority', 'critical_rugcheck',
  'mint_authority_active', 'freeze_authority_active',
  'known_abused_ticker', 'known_scammer', 'blacklisted_dev', 'serial_launcher',
  'larp_detected', 'larp_confirmed', 'fake_socials',
  'blacklist_mesh_match', 'mesh_flagged_dev', 'mesh_flagged_parent',
]);

interface RejectionMeshParams {
  token_mint: string;
  token_symbol?: string | null;
  token_name?: string | null;
  creator_wallet?: string | null;
  rejection_reasons: string[];
  metadata?: any;
  bundle_score?: number | null;
  rugcheck_score?: number | null;
  holder_count?: number | null;
  market_cap_usd?: number | null;
  socials_count?: number | null;
  bump_bot_detected?: boolean;
  source: string;
  skip_genealogy?: boolean;
}

export function hasMeshWorthyReasons(reasons: string[]): boolean {
  return reasons.some(r => {
    const normalized = r.toLowerCase().trim();
    if (MESH_WORTHY_REASONS.has(normalized)) return true;
    for (const meshReason of MESH_WORTHY_REASONS) {
      if (normalized.startsWith(meshReason)) return true;
    }
    return false;
  });
}

function classifyRejectionTags(reasons: string[]): string[] {
  const tags: Set<string> = new Set();
  for (const r of reasons) {
    const lower = r.toLowerCase();
    if (lower.includes('dev_full_exit') || lower.includes('dev_sold')) tags.add('dev_dump');
    if (lower.includes('bump_bot')) tags.add('bump_bot');
    if (lower.includes('non_standard') || lower.includes('authority')) tags.add('contract_risk');
    if (lower.includes('rugcheck') || lower.includes('critical')) tags.add('high_rugcheck');
    if (lower.includes('abused_ticker') || lower.includes('known')) tags.add('known_bad_actor');
    if (lower.includes('larp') || lower.includes('fake')) tags.add('larp_fraud');
    if (lower.includes('serial') || lower.includes('launched_new')) tags.add('serial_launcher');
    if (lower.includes('crashed')) tags.add('pump_and_dump');
    if (lower.includes('blacklist_mesh_match') || lower.includes('mesh_flagged')) tags.add('mesh_recidivist');
    if (lower.includes('blacklisted_dev')) tags.add('known_bad_actor');
  }
  return Array.from(tags);
}

export async function feedRejectionToMesh(supabase: any, params: RejectionMeshParams): Promise<void> {
  const { token_mint, token_symbol, token_name, creator_wallet, rejection_reasons, source, skip_genealogy } = params;

  if (!hasMeshWorthyReasons(rejection_reasons)) return;
  if (!creator_wallet) {
    console.log(`[rejection-mesh] No creator wallet for ${token_symbol || token_mint} — skipping mesh`);
    return;
  }

  const tags = classifyRejectionTags(rejection_reasons);
  const now = new Date().toISOString();

  try {
    // 1. Upsert dev_wallet_reputation
    const { data: existingRep } = await supabase
      .from('dev_wallet_reputation')
      .select('id, total_tokens_launched, tokens_rugged, tokens_abandoned, trust_level, fantasy_loss_count, twitter_accounts, upstream_wallets, downstream_wallets')
      .eq('wallet_address', creator_wallet)
      .maybeSingle();

    if (existingRep) {
      const isRug = tags.includes('dev_dump') || tags.includes('pump_and_dump');
      const updates: any = { last_activity_at: now, last_analyzed_at: now, updated_at: now };
      if (isRug) {
        updates.tokens_rugged = (existingRep.tokens_rugged || 0) + 1;
      } else {
        updates.tokens_abandoned = (existingRep.tokens_abandoned || 0) + 1;
      }
      updates.total_tokens_launched = (existingRep.total_tokens_launched || 0) + 1;

      const totalBad = (updates.tokens_rugged ?? existingRep.tokens_rugged ?? 0) + 
                       (updates.tokens_abandoned ?? existingRep.tokens_abandoned ?? 0);
      if (totalBad >= 5) { updates.trust_level = 'serial_rugger'; updates.is_serial_spammer = true; }
      else if (totalBad >= 3) { updates.trust_level = 'repeat_loser'; }
      else if (isRug) { updates.trust_level = 'scammer'; }

      await supabase.from('dev_wallet_reputation').update(updates).eq('id', existingRep.id);
    } else {
      const isRug = tags.includes('dev_dump') || tags.includes('pump_and_dump');
      await supabase.from('dev_wallet_reputation').insert({
        wallet_address: creator_wallet,
        total_tokens_launched: 1,
        tokens_rugged: isRug ? 1 : 0,
        tokens_abandoned: isRug ? 0 : 1,
        trust_level: isRug ? 'scammer' : 'suspicious',
        first_seen_at: now, last_activity_at: now, last_analyzed_at: now,
        notes: `Auto-created from ${source}: ${rejection_reasons.join(', ')}`,
        metadata: { source, first_token: token_mint, first_symbol: token_symbol },
      });
    }

    // 2. Reputation mesh links
    const meshLinks: any[] = [];

    meshLinks.push({
      source_type: 'wallet', source_id: creator_wallet,
      linked_type: 'token', linked_id: token_mint,
      relationship: 'created_rejected_token', confidence: 95,
      evidence: `Rejected: ${rejection_reasons.join(', ')}`, discovered_via: source,
    });

    if (existingRep?.upstream_wallets && Array.isArray(existingRep.upstream_wallets)) {
      for (const parentWallet of existingRep.upstream_wallets.slice(0, 5)) {
        meshLinks.push({
          source_type: 'wallet', source_id: parentWallet,
          linked_type: 'wallet', linked_id: creator_wallet,
          relationship: 'funded_rejected_dev', confidence: 80,
          evidence: `Parent wallet of rejected dev (${token_symbol || token_mint})`, discovered_via: source,
        });
      }
    }

    if (existingRep?.twitter_accounts && Array.isArray(existingRep.twitter_accounts)) {
      for (const handle of existingRep.twitter_accounts.slice(0, 5)) {
        meshLinks.push({
          source_type: 'x_account', source_id: handle,
          linked_type: 'wallet', linked_id: creator_wallet,
          relationship: 'linked_to_rejected_dev', confidence: 70,
          evidence: `X account linked to dev who created rejected token ${token_symbol || token_mint}`, discovered_via: source,
        });
      }
    }

    for (const link of meshLinks) {
      const { error: meshErr } = await supabase.from('reputation_mesh').insert(link);
      if (meshErr && !meshErr.message?.includes('duplicate') && !meshErr.code?.includes('23505')) {
        console.warn(`[rejection-mesh] Mesh insert error: ${meshErr.message}`);
      }
    }

    // 3. Auto-blacklist repeat offenders
    const totalBad = (existingRep?.tokens_rugged || 0) + (existingRep?.tokens_abandoned || 0) + 1;
    if (totalBad >= 3) {
      const { data: existing } = await supabase
        .from('pumpfun_blacklist')
        .select('id')
        .eq('identifier', creator_wallet)
        .eq('entry_type', 'wallet')
        .maybeSingle();

      if (!existing) {
        await supabase.from('pumpfun_blacklist').insert({
          entry_type: 'wallet', identifier: creator_wallet,
          linked_token_mints: [token_mint],
          risk_level: totalBad >= 5 ? 'critical' : 'high',
          blacklist_reason: `Auto-blacklisted: ${totalBad} bad tokens (${tags.join(', ')})`,
          tags, source, auto_classified: true,
          classification_score: Math.min(totalBad * 20, 100), is_active: true,
        });
        console.log(`[rejection-mesh] 🚫 Auto-blacklisted wallet ${creator_wallet.slice(0, 8)}... (${totalBad} bad tokens)`);
      } else {
        const { data: blEntry } = await supabase
          .from('pumpfun_blacklist')
          .select('linked_token_mints, tags')
          .eq('id', existing.id)
          .single();
        if (blEntry) {
          const mints = Array.from(new Set([...(blEntry.linked_token_mints || []), token_mint]));
          const allTags = Array.from(new Set([...(blEntry.tags || []), ...tags]));
          await supabase.from('pumpfun_blacklist')
            .update({ linked_token_mints: mints, tags: allTags, updated_at: now })
            .eq('id', existing.id);
        }
      }
    }

    // 4. AUTO-GENEALOGY: Trace 2-3 depth parent wallets via Helius
    // Skipped during backfill to conserve Helius credits
    if (!skip_genealogy) {
      try {
        const genealogy = await traceParentWallets(supabase, creator_wallet, source);
        if (genealogy.parentWallets.length > 0 || genealogy.xAccounts.length > 0) {
          await meshGenealogyResults(supabase, creator_wallet, genealogy, source);
        }
      } catch (gErr) {
        console.warn(`[rejection-mesh] Genealogy trace failed for ${creator_wallet.slice(0, 8)}...: ${gErr}`);
      }
    }

    console.log(`[rejection-mesh] ✅ Meshed ${token_symbol || token_mint} (${creator_wallet.slice(0, 8)}...) — tags: ${tags.join(', ')}`);
  } catch (err) {
    console.error(`[rejection-mesh] Error meshing ${token_mint}: ${err}`);
  }
}
