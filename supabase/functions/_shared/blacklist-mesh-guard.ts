/**
 * BLACKLIST MESH GUARD
 * 
 * Authoritative backend enforcement for blacklist + reputation mesh checks.
 * Used by flipit-execute and flipit-preflight to block trades for:
 * - Directly blacklisted token mints
 * - Blacklisted creator wallets
 * - Creator wallets flagged as scammer/serial_rugger in dev_wallet_reputation
 * - Creator wallets linked to blacklisted entities via reputation_mesh funding chains
 * - Unresolved creators on pump.fun tokens (fail-closed)
 */

export interface MeshGuardResult {
  blocked: boolean;
  reason: string | null;
  level: 'critical' | 'high' | 'medium' | 'mesh_linked' | 'clean';
  source: 'token_blacklist' | 'creator_blacklist' | 'dev_reputation' | 'mesh_link' | 'unresolved_creator' | null;
  creatorWallet: string | null;
  creatorSource: string | null;
}

/**
 * Resolve creator wallet for a token using internal DB fallbacks.
 * Used when the external launchpad API (pump.fun) fails.
 */
async function resolveCreatorWallet(
  supabase: any,
  tokenMint: string
): Promise<{ wallet: string | null; source: string | null }> {
  // 1. Try pumpfun_watchlist
  try {
    const { data } = await supabase
      .from('pumpfun_watchlist')
      .select('creator_wallet')
      .eq('token_mint', tokenMint)
      .limit(1)
      .maybeSingle();
    if (data?.creator_wallet) {
      return { wallet: data.creator_wallet, source: 'pumpfun_watchlist' };
    }
  } catch (e) {
    console.warn('[mesh-guard] watchlist lookup failed:', e);
  }

  // 2. Try token_lifecycle
  try {
    const { data } = await supabase
      .from('token_lifecycle')
      .select('creator_wallet')
      .eq('token_mint', tokenMint)
      .limit(1)
      .maybeSingle();
    if (data?.creator_wallet) {
      return { wallet: data.creator_wallet, source: 'token_lifecycle' };
    }
  } catch (e) {
    console.warn('[mesh-guard] lifecycle lookup failed:', e);
  }

  return { wallet: null, source: null };
}

/**
 * Run the full blacklist mesh guard check.
 * Returns blocked=true with reason if the trade should be prevented.
 */
export async function runMeshGuard(
  supabase: any,
  tokenMint: string,
  creatorWalletHint?: string | null
): Promise<MeshGuardResult> {
  const clean: MeshGuardResult = {
    blocked: false, reason: null, level: 'clean',
    source: null, creatorWallet: null, creatorSource: null
  };

  try {
    // 1. Check token mint in pumpfun_blacklist
    const { data: tokenBl } = await supabase
      .from('pumpfun_blacklist')
      .select('identifier, risk_level, blacklist_reason')
      .eq('identifier', tokenMint)
      .eq('is_active', true)
      .maybeSingle();

    if (tokenBl && (tokenBl.risk_level === 'high' || tokenBl.risk_level === 'critical')) {
      return {
        blocked: true,
        reason: `Token blacklisted: ${tokenBl.blacklist_reason || tokenBl.risk_level}`,
        level: tokenBl.risk_level === 'critical' ? 'critical' : 'high',
        source: 'token_blacklist',
        creatorWallet: null,
        creatorSource: null
      };
    }

    // 2. Resolve creator wallet
    let creatorWallet = creatorWalletHint || null;
    let creatorSource: string | null = creatorWalletHint ? 'provided' : null;

    if (!creatorWallet) {
      const resolved = await resolveCreatorWallet(supabase, tokenMint);
      creatorWallet = resolved.wallet;
      creatorSource = resolved.source;
    }

    // 3. Fail-closed for pump tokens with unresolved creator
    if (!creatorWallet && tokenMint.endsWith('pump')) {
      return {
        blocked: true,
        reason: 'Creator wallet unresolved for pump.fun token — blocked for safety',
        level: 'high',
        source: 'unresolved_creator',
        creatorWallet: null,
        creatorSource: null
      };
    }

    if (!creatorWallet) {
      // Non-pump token with no creator — can't run deeper checks, allow
      return { ...clean, creatorWallet: null, creatorSource: null };
    }

    // 4. Check creator wallet in pumpfun_blacklist
    const { data: creatorBl } = await supabase
      .from('pumpfun_blacklist')
      .select('identifier, risk_level, blacklist_reason')
      .eq('identifier', creatorWallet)
      .eq('is_active', true)
      .maybeSingle();

    if (creatorBl && (creatorBl.risk_level === 'high' || creatorBl.risk_level === 'critical')) {
      return {
        blocked: true,
        reason: `Creator wallet blacklisted: ${creatorBl.blacklist_reason || creatorBl.risk_level}`,
        level: creatorBl.risk_level === 'critical' ? 'critical' : 'high',
        source: 'creator_blacklist',
        creatorWallet,
        creatorSource
      };
    }

    // 5. Check dev_wallet_reputation for scammer/serial_rugger
    const { data: devRep } = await supabase
      .from('dev_wallet_reputation')
      .select('trust_level, tokens_rugged, reputation_score')
      .eq('wallet_address', creatorWallet)
      .maybeSingle();

    if (devRep && (devRep.trust_level === 'scammer' || devRep.trust_level === 'serial_rugger')) {
      return {
        blocked: true,
        reason: `Dev flagged as ${devRep.trust_level} (${devRep.tokens_rugged || 0} rugs, score: ${devRep.reputation_score || 0})`,
        level: 'critical',
        source: 'dev_reputation',
        creatorWallet,
        creatorSource
      };
    }

    // 6. Check reputation_mesh for funding chain links to blacklisted entities
    const { data: meshLinks } = await supabase
      .from('reputation_mesh')
      .select('source_id, linked_id, relationship')
      .or(`source_id.eq.${creatorWallet},linked_id.eq.${creatorWallet}`)
      .in('relationship', ['directly_funded', 'indirectly_funded', 'funded_by', 'same_kyc_root', 'satellite_of'])
      .limit(10);

    if (meshLinks && meshLinks.length > 0) {
      const linkedIds = meshLinks.map((l: any) =>
        l.source_id === creatorWallet ? l.linked_id : l.source_id
      );

      const { data: linkedBl } = await supabase
        .from('pumpfun_blacklist')
        .select('identifier, blacklist_reason, risk_level')
        .in('identifier', linkedIds)
        .eq('is_active', true)
        .limit(1);

      if (linkedBl && linkedBl.length > 0) {
        const link = meshLinks[0];
        const bl = linkedBl[0];
        return {
          blocked: true,
          reason: `Dev linked to blacklisted entity via ${link.relationship.replace(/_/g, ' ')}. Root: ${bl.identifier.slice(0, 8)}... (${bl.blacklist_reason || 'blacklisted'})`,
          level: 'mesh_linked' as any,
          source: 'mesh_link',
          creatorWallet,
          creatorSource
        };
      }
    }

    // All checks passed
    return { ...clean, creatorWallet, creatorSource };
  } catch (err) {
    console.error('[mesh-guard] Guard error:', err);
    // Fail open on unexpected errors to not break trading
    return { ...clean, reason: `Guard error: ${err}` };
  }
}
