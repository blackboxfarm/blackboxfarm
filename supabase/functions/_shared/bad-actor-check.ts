/**
 * BAD ACTOR CHECK — Shared helper
 *
 * Determines if a token/wallet/X-handle is associated with a known bad actor.
 * Used by /holders, /bubblemap, and Telegram bot commands to render a
 * prominent red alert. Full breakdown (KYC, launch history, mesh, socials)
 * is gated behind paid subscription tiers.
 *
 * Sources checked (in priority order):
 *  1. pumpfun_blacklist (token mint, creator wallet, x handle as identifier)
 *  2. dev_wallet_reputation (trust_level: scammer | serial_rugger | blacklisted)
 *  3. reputation_mesh (linked to blacklisted entity via funding chain)
 *  4. x_communities recycled_band (likely | confirmed)
 */

export type BadActorLevel = 'critical' | 'high' | 'warn' | 'clean';

export interface BadActorAlert {
  isBadActor: boolean;
  level: BadActorLevel;
  // Short, public-safe headline (no doxxing detail)
  headline: string;
  // Plain reason categories (e.g. "blacklisted_dev", "serial_rugger", "mesh_linked")
  reasons: string[];
  // Which subjects triggered: token | creator | x_handle
  subjects: Array<'token' | 'creator' | 'x_handle'>;
  resolvedCreatorWallet: string | null;
  resolvedXHandle: string | null;
  // Subscriber-only payload (null for non-subs)
  details: BadActorDetails | null;
}

export interface BadActorDetails {
  blacklistEntries: Array<{
    identifier: string;
    entry_type: string | null;
    blacklist_reason: string | null;
    risk_level: string | null;
    tags: string[] | null;
  }>;
  devReputation: {
    wallet: string;
    trust_level: string | null;
    reputation_score: number | null;
    tokens_launched: number | null;
    tokens_rugged: number | null;
    dev_pattern: string | null;
  } | null;
  meshLinks: Array<{
    relationship: string;
    linked_id: string;
    linked_type: string | null;
    blacklisted_root: string | null;
    blacklisted_reason: string | null;
  }>;
  recycledCommunities: Array<{
    community_id: string;
    name: string | null;
    recycled_band: string | null;
    recycled_score: number | null;
  }>;
  launchHistory: Array<{
    token_mint: string;
    token_symbol: string | null;
    outcome: string | null;
  }>;
}

async function resolveCreatorAndHandle(
  supabase: any,
  tokenMint: string | null
): Promise<{ creator: string | null; xHandle: string | null }> {
  if (!tokenMint) return { creator: null, xHandle: null };
  let creator: string | null = null;
  let xHandle: string | null = null;

  try {
    const { data } = await supabase
      .from('pumpfun_watchlist')
      .select('creator_wallet, twitter_handle')
      .eq('token_mint', tokenMint)
      .limit(1)
      .maybeSingle();
    if (data) {
      creator = data.creator_wallet || null;
      xHandle = data.twitter_handle || null;
    }
  } catch (_) { /* ignore */ }

  if (!creator) {
    try {
      const { data } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet')
        .eq('token_mint', tokenMint)
        .limit(1)
        .maybeSingle();
      if (data?.creator_wallet) creator = data.creator_wallet;
    } catch (_) { /* ignore */ }
  }

  if (!xHandle) {
    try {
      const { data } = await supabase
        .from('token_social_links')
        .select('platform, handle, url')
        .eq('token_mint', tokenMint)
        .eq('platform', 'twitter')
        .limit(1)
        .maybeSingle();
      if (data?.handle) xHandle = String(data.handle).replace(/^@/, '');
    } catch (_) { /* ignore */ }
  }

  return { creator, xHandle };
}

export async function runBadActorCheck(
  supabase: any,
  input: { tokenMint?: string | null; walletAddress?: string | null; xHandle?: string | null }
): Promise<BadActorAlert> {
  const tokenMint = (input.tokenMint || '').trim() || null;
  let walletAddress = (input.walletAddress || '').trim() || null;
  let xHandle = (input.xHandle || '').trim().replace(/^@/, '') || null;

  // Auto-resolve creator + handle from token if not provided
  if (tokenMint && (!walletAddress || !xHandle)) {
    const resolved = await resolveCreatorAndHandle(supabase, tokenMint);
    if (!walletAddress) walletAddress = resolved.creator;
    if (!xHandle) xHandle = resolved.xHandle;
  }

  const subjects: Array<'token' | 'creator' | 'x_handle'> = [];
  const reasons: string[] = [];
  let level: BadActorLevel = 'clean';

  const blacklistEntries: BadActorDetails['blacklistEntries'] = [];
  let devReputation: BadActorDetails['devReputation'] = null;
  const meshLinks: BadActorDetails['meshLinks'] = [];
  const recycledCommunities: BadActorDetails['recycledCommunities'] = [];
  const launchHistory: BadActorDetails['launchHistory'] = [];

  // Build identifiers list to check against blacklist
  const identifiers: Array<{ id: string; subject: 'token' | 'creator' | 'x_handle' }> = [];
  if (tokenMint) identifiers.push({ id: tokenMint, subject: 'token' });
  if (walletAddress) identifiers.push({ id: walletAddress, subject: 'creator' });
  if (xHandle) {
    identifiers.push({ id: xHandle, subject: 'x_handle' });
    identifiers.push({ id: `@${xHandle}`, subject: 'x_handle' });
  }

  if (identifiers.length > 0) {
    try {
      const ids = identifiers.map((x) => x.id);
      const { data: bls } = await supabase
        .from('pumpfun_blacklist')
        .select('identifier, entry_type, blacklist_reason, risk_level, tags')
        .in('identifier', ids)
        .eq('is_active', true);
      if (bls && bls.length > 0) {
        for (const bl of bls) {
          blacklistEntries.push(bl as any);
          const match = identifiers.find((x) => x.id === bl.identifier);
          if (match && !subjects.includes(match.subject)) subjects.push(match.subject);
          const tag = match?.subject === 'token'
            ? 'blacklisted_token'
            : match?.subject === 'creator'
            ? 'blacklisted_dev'
            : 'blacklisted_x_handle';
          if (!reasons.includes(tag)) reasons.push(tag);
          if (bl.risk_level === 'critical') level = 'critical';
          else if (level !== 'critical') level = 'high';
        }
      }
    } catch (_) { /* ignore */ }
  }

  // Dev wallet reputation
  if (walletAddress) {
    try {
      const { data: dr } = await supabase
        .from('dev_wallet_reputation')
        .select('wallet_address, trust_level, reputation_score, total_tokens_launched, tokens_rugged, dev_pattern')
        .eq('wallet_address', walletAddress)
        .maybeSingle();
      if (dr) {
        devReputation = {
          wallet: dr.wallet_address,
          trust_level: dr.trust_level,
          reputation_score: dr.reputation_score,
          tokens_launched: dr.total_tokens_launched,
          tokens_rugged: dr.tokens_rugged,
          dev_pattern: dr.dev_pattern,
        };
        if (['scammer', 'serial_rugger', 'blacklisted'].includes(dr.trust_level)) {
          if (!subjects.includes('creator')) subjects.push('creator');
          if (!reasons.includes(dr.trust_level)) reasons.push(dr.trust_level);
          level = 'critical';
        } else if (dr.dev_pattern && ['serial_spammer', 'fee_farmer'].includes(dr.dev_pattern)) {
          if (!subjects.includes('creator')) subjects.push('creator');
          if (!reasons.includes(dr.dev_pattern)) reasons.push(dr.dev_pattern);
          if (level === 'clean' || level === 'warn') level = 'high';
        }
      }
    } catch (_) { /* ignore */ }
  }

  // Mesh links to blacklisted entities
  if (walletAddress) {
    try {
      const { data: mesh } = await supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, source_type, linked_type, relationship')
        .or(`source_id.eq.${walletAddress},linked_id.eq.${walletAddress}`)
        .in('relationship', ['directly_funded', 'indirectly_funded', 'funded_by', 'same_kyc_root', 'satellite_of'])
        .limit(20);
      if (mesh && mesh.length > 0) {
        const linkedIds = mesh.map((l: any) => (l.source_id === walletAddress ? l.linked_id : l.source_id));
        const { data: linkedBl } = await supabase
          .from('pumpfun_blacklist')
          .select('identifier, blacklist_reason, risk_level')
          .in('identifier', linkedIds)
          .eq('is_active', true);
        if (linkedBl && linkedBl.length > 0) {
          for (const link of mesh) {
            const otherId = link.source_id === walletAddress ? link.linked_id : link.source_id;
            const otherType = link.source_id === walletAddress ? link.linked_type : link.source_type;
            const bl = linkedBl.find((b: any) => b.identifier === otherId);
            if (bl) {
              meshLinks.push({
                relationship: link.relationship,
                linked_id: otherId,
                linked_type: otherType,
                blacklisted_root: bl.identifier,
                blacklisted_reason: bl.blacklist_reason,
              });
            }
          }
          if (meshLinks.length > 0) {
            if (!subjects.includes('creator')) subjects.push('creator');
            if (!reasons.includes('mesh_linked')) reasons.push('mesh_linked');
            if (level === 'clean' || level === 'warn') level = 'high';
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  // Recycled X community
  if (xHandle) {
    try {
      const { data: comms } = await supabase
        .from('x_communities')
        .select('community_id, name, recycled_band, recycled_score, admin_usernames')
        .or(`admin_usernames.cs.{${xHandle}},admin_usernames.cs.{@${xHandle}}`)
        .in('recycled_band', ['likely', 'confirmed'])
        .limit(5);
      if (comms && comms.length > 0) {
        for (const c of comms) {
          recycledCommunities.push({
            community_id: c.community_id,
            name: c.name,
            recycled_band: c.recycled_band,
            recycled_score: c.recycled_score,
          });
        }
        if (!subjects.includes('x_handle')) subjects.push('x_handle');
        if (!reasons.includes('recycled_community')) reasons.push('recycled_community');
        if (level === 'clean') level = 'warn';
      }
    } catch (_) { /* ignore */ }
  }

  // Past launches (only for subscribers — but always fetch for details payload)
  if (walletAddress) {
    try {
      const { data: dt } = await supabase
        .from('developer_tokens')
        .select('token_mint, token_symbol, outcome')
        .eq('creator_wallet', walletAddress)
        .limit(50);
      if (dt) launchHistory.push(...(dt as any));
    } catch (_) { /* ignore */ }
  }

  const isBadActor = level !== 'clean';

  // Build short headline (public-safe, no doxxing)
  let headline = '';
  if (!isBadActor) {
    headline = '';
  } else if (level === 'critical') {
    if (subjects.includes('creator')) headline = '⚠ KNOWN BAD ACTOR DEVELOPER';
    else if (subjects.includes('token')) headline = '⚠ BLACKLISTED TOKEN';
    else if (subjects.includes('x_handle')) headline = '⚠ FLAGGED X HANDLE';
    else headline = '⚠ BAD ACTOR DETECTED';
  } else if (level === 'high') {
    headline = subjects.includes('creator')
      ? '⚠ HIGH-RISK DEVELOPER — Linked to bad actors'
      : '⚠ HIGH-RISK ENTITY';
  } else {
    headline = '⚠ CAUTION — Recycled / suspicious community';
  }

  return {
    isBadActor,
    level,
    headline,
    reasons,
    subjects,
    resolvedCreatorWallet: walletAddress,
    resolvedXHandle: xHandle,
    details: {
      blacklistEntries,
      devReputation,
      meshLinks,
      recycledCommunities,
      launchHistory,
    },
  };
}
