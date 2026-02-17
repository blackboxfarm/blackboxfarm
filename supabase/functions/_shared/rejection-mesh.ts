/**
 * REJECTION-TO-MESH UTILITY
 * 
 * When a token is rejected for bad-actor reasons (dev exit, bump bot, contract risk, etc.),
 * this utility feeds all known intel about the token into the blacklist mesh:
 * - dev_wallet_reputation: upsert creator wallet with rejection count
 * - reputation_mesh: link creator -> token, creator -> socials, creator -> parent wallets
 * - pumpfun_blacklist: auto-blacklist repeat offenders
 * 
 * Only mesh-worthy rejections are processed (not cosmetic/market condition rejections).
 */

// Rejection reasons that indicate bad actors and should be meshed
const MESH_WORTHY_REASONS = new Set([
  // Dev exits
  'dev_full_exit', 'dev_sold_crashed', 'dev_sold_graduated', 'dev_launched_new', 'dev_sold',
  // Bump bots / manipulation
  'bump_bot_detected', 'bump_bot',
  // Contract risks
  'non_standard_supply', 'mint_authority', 'freeze_authority', 'critical_rugcheck',
  'mint_authority_active', 'freeze_authority_active',
  // Known bad actors
  'known_abused_ticker', 'known_scammer', 'blacklisted_dev', 'serial_launcher',
  // LARP / fraud
  'larp_detected', 'larp_confirmed', 'fake_socials',
]);

interface RejectionMeshParams {
  token_mint: string;
  token_symbol?: string | null;
  token_name?: string | null;
  creator_wallet?: string | null;
  rejection_reasons: string[];
  // Optional enrichment data available at rejection time
  metadata?: any;
  bundle_score?: number | null;
  rugcheck_score?: number | null;
  holder_count?: number | null;
  market_cap_usd?: number | null;
  socials_count?: number | null;
  bump_bot_detected?: boolean;
  // Pipeline source
  source: string; // 'enricher' | 'watchlist-monitor' | 'sell-monitor' | 'backfill'
}

/**
 * Determines if a set of rejection reasons contains any mesh-worthy signals
 */
export function hasMeshWorthyReasons(reasons: string[]): boolean {
  return reasons.some(r => {
    const normalized = r.toLowerCase().trim();
    // Direct match
    if (MESH_WORTHY_REASONS.has(normalized)) return true;
    // Partial match for compound reasons like "bump_bot_detected:40%_micro_txs"
    for (const meshReason of MESH_WORTHY_REASONS) {
      if (normalized.startsWith(meshReason)) return true;
    }
    return false;
  });
}

/**
 * Classify rejection reasons into mesh tags
 */
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
  }
  return Array.from(tags);
}

/**
 * Main function: feed rejection intel into the mesh
 */
export async function feedRejectionToMesh(supabase: any, params: RejectionMeshParams): Promise<void> {
  const { token_mint, token_symbol, token_name, creator_wallet, rejection_reasons, source } = params;

  // Only process mesh-worthy rejections
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
      // Update existing — increment counters
      const isRug = tags.includes('dev_dump') || tags.includes('pump_and_dump');
      const updates: any = {
        last_activity_at: now,
        last_analyzed_at: now,
        updated_at: now,
      };
      if (isRug) {
        updates.tokens_rugged = (existingRep.tokens_rugged || 0) + 1;
      } else {
        updates.tokens_abandoned = (existingRep.tokens_abandoned || 0) + 1;
      }
      updates.total_tokens_launched = (existingRep.total_tokens_launched || 0) + 1;

      // Auto-classify trust level based on accumulation
      const totalBad = (updates.tokens_rugged ?? existingRep.tokens_rugged ?? 0) + 
                       (updates.tokens_abandoned ?? existingRep.tokens_abandoned ?? 0);
      if (totalBad >= 5) {
        updates.trust_level = 'serial_rugger';
        updates.is_serial_spammer = true;
      } else if (totalBad >= 3) {
        updates.trust_level = 'repeat_loser';
      } else if (isRug) {
        updates.trust_level = 'scammer';
      }

      await supabase.from('dev_wallet_reputation').update(updates).eq('id', existingRep.id);
    } else {
      // Create new entry
      const isRug = tags.includes('dev_dump') || tags.includes('pump_and_dump');
      await supabase.from('dev_wallet_reputation').insert({
        wallet_address: creator_wallet,
        total_tokens_launched: 1,
        tokens_rugged: isRug ? 1 : 0,
        tokens_abandoned: isRug ? 0 : 1,
        trust_level: isRug ? 'scammer' : 'suspicious',
        first_seen_at: now,
        last_activity_at: now,
        last_analyzed_at: now,
        notes: `Auto-created from ${source}: ${rejection_reasons.join(', ')}`,
        metadata: { source, first_token: token_mint, first_symbol: token_symbol },
      });
    }

    // 2. Add reputation_mesh links
    const meshLinks: any[] = [];

    // Creator -> Token (rejected)
    meshLinks.push({
      source_type: 'wallet',
      source_id: creator_wallet,
      linked_type: 'token',
      linked_id: token_mint,
      relationship: 'created_rejected_token',
      confidence: 95,
      evidence: `Rejected: ${rejection_reasons.join(', ')}`,
      discovered_via: source,
    });

    // If we have upstream wallets from the existing rep, link them
    if (existingRep?.upstream_wallets && Array.isArray(existingRep.upstream_wallets)) {
      for (const parentWallet of existingRep.upstream_wallets.slice(0, 5)) {
        meshLinks.push({
          source_type: 'wallet',
          source_id: parentWallet,
          linked_type: 'wallet',
          linked_id: creator_wallet,
          relationship: 'funded_rejected_dev',
          confidence: 80,
          evidence: `Parent wallet of rejected dev (${token_symbol || token_mint})`,
          discovered_via: source,
        });
      }
    }

    // If we have twitter accounts, link them
    if (existingRep?.twitter_accounts && Array.isArray(existingRep.twitter_accounts)) {
      for (const handle of existingRep.twitter_accounts.slice(0, 5)) {
        meshLinks.push({
          source_type: 'x_account',
          source_id: handle,
          linked_type: 'wallet',
          linked_id: creator_wallet,
          relationship: 'linked_to_rejected_dev',
          confidence: 70,
          evidence: `X account linked to dev who created rejected token ${token_symbol || token_mint}`,
          discovered_via: source,
        });
      }
    }

    // Insert mesh links (skip duplicates via conflict check)
    for (const link of meshLinks) {
      const { error: meshErr } = await supabase.from('reputation_mesh').insert(link);
      if (meshErr) {
        // Ignore duplicate key violations, log others
        if (!meshErr.message?.includes('duplicate') && !meshErr.code?.includes('23505')) {
          console.warn(`[rejection-mesh] Mesh insert error: ${meshErr.message}`);
        }
      }
    }

    // 3. Auto-blacklist repeat offenders
    const totalBad = (existingRep?.tokens_rugged || 0) + (existingRep?.tokens_abandoned || 0) + 1;
    if (totalBad >= 3) {
      // Check if already blacklisted
      const { data: existing } = await supabase
        .from('pumpfun_blacklist')
        .select('id')
        .eq('identifier', creator_wallet)
        .eq('entry_type', 'wallet')
        .maybeSingle();

      if (!existing) {
        await supabase.from('pumpfun_blacklist').insert({
          entry_type: 'wallet',
          identifier: creator_wallet,
          linked_token_mints: [token_mint],
          risk_level: totalBad >= 5 ? 'critical' : 'high',
          blacklist_reason: `Auto-blacklisted: ${totalBad} bad tokens (${tags.join(', ')})`,
          tags: tags,
          source: source,
          auto_classified: true,
          classification_score: Math.min(totalBad * 20, 100),
          is_active: true,
        });
        console.log(`[rejection-mesh] 🚫 Auto-blacklisted wallet ${creator_wallet.slice(0, 8)}... (${totalBad} bad tokens)`);
      } else {
        // Update existing blacklist entry with new token
        await supabase.rpc('', {}).catch(() => {}); // no-op; update manually
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

    console.log(`[rejection-mesh] ✅ Meshed ${token_symbol || token_mint} (${creator_wallet.slice(0, 8)}...) — tags: ${tags.join(', ')}`);
  } catch (err) {
    console.error(`[rejection-mesh] Error meshing ${token_mint}: ${err}`);
  }
}
