/**
 * X-Handle Reverse Lookup (shared)
 *
 * Given a Twitter/X handle, walks the mesh DB to surface:
 *   - linked dev wallets + reputation
 *   - linked tokens + lifecycle status
 *   - linked X communities (with role)
 *   - allstar / blacklist flags
 *   - recycled-handle history
 *
 * Used by the Telegram bot DM router to answer "is @handle a known dev?".
 */

export interface XLookupDev {
  wallet: string;
  truncated: string;
  trustLevel: string | null;
  reputationScore: number | null;
  tokensLaunched: number | null;
  tokensRugged: number | null;
  tokensSuccessful: number | null;
  isAllstar: boolean;
  allstarBestMcap: number | null;
  allstarBestSymbol: string | null;
  riskTier: string | null;
  dumpVelocity: number | null;
}

export interface XLookupToken {
  mint: string;
  symbol: string | null;
  status: string | null; // alive | dying | dead
  deathCause: string | null;
  autopsySlug: string | null;
}

export interface XLookupCommunity {
  id: string;
  name: string;
  role: 'admin' | 'mod';
  recycled: boolean;
  previousNames: string[];
}

export interface XLookupResult {
  handle: string;
  found: boolean;
  verdict: 'allstar' | 'bad_actor' | 'mixed' | 'unknown' | 'clean';
  devs: XLookupDev[];
  tokens: XLookupToken[];
  communities: XLookupCommunity[];
  recycledHandles: string[]; // previous handles that pointed at the same wallets/tokens
  kycRoots: string[];
  stats: { wallets: number; tokens: number; communities: number };
}

function truncateAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export async function xHandleReverseLookup(
  supabase: any,
  rawHandle: string,
): Promise<XLookupResult> {
  const handle = rawHandle.trim().replace(/^@/, '').toLowerCase();

  const empty: XLookupResult = {
    handle,
    found: false,
    verdict: 'unknown',
    devs: [],
    tokens: [],
    communities: [],
    recycledHandles: [],
    kycRoots: [],
    stats: { wallets: 0, tokens: 0, communities: 0 },
  };

  if (!/^[a-z0-9_]{2,15}$/i.test(handle)) return empty;

  // 1. Mesh links — wallets/tokens/communities tied to this handle
  const { data: meshLinks } = await supabase
    .from('reputation_mesh')
    .select('linked_type, linked_id, relationship, confidence')
    .eq('source_type', 'x_account')
    .ilike('source_id', handle);

  // 2. Communities where handle is admin/mod
  const { data: communities } = await supabase
    .from('x_communities')
    .select('id, community_name, admin_usernames, moderator_usernames, previous_names')
    .or(`admin_usernames.cs.{${handle}},moderator_usernames.cs.{${handle}}`);

  // 3. Token social links — recycled handle history
  const { data: socialLinks } = await supabase
    .from('token_social_links')
    .select('token_mint, x_handle, previous_handles')
    .or(`x_handle.ilike.${handle},previous_handles.cs.{${handle}}`);

  const walletSet = new Set<string>();
  const tokenSet = new Set<string>();
  const recycledSet = new Set<string>();

  (meshLinks || []).forEach((m: any) => {
    if (m.linked_type === 'wallet') walletSet.add(m.linked_id);
    if (m.linked_type === 'token') tokenSet.add(m.linked_id);
  });

  (socialLinks || []).forEach((s: any) => {
    if (s.token_mint) tokenSet.add(s.token_mint);
    (s.previous_handles || []).forEach((p: string) => {
      if (p && p.toLowerCase() !== handle) recycledSet.add(p.toLowerCase());
    });
  });

  const wallets = Array.from(walletSet);
  const tokens = Array.from(tokenSet);

  // 4. Reputation enrichment
  const [repRes, allstarRes, behaviorRes, lifecycleRes] = await Promise.all([
    wallets.length
      ? supabase
          .from('dev_wallet_reputation')
          .select('wallet_address, reputation_score, trust_level, total_tokens_launched, tokens_rugged, tokens_successful')
          .in('wallet_address', wallets)
      : Promise.resolve({ data: [] }),
    wallets.length
      ? supabase
          .from('allstar_dev_registry')
          .select('master_wallet, kyc_root_wallet, best_mcap_achieved, best_token_symbol, status')
          .in('master_wallet', wallets)
      : Promise.resolve({ data: [] }),
    wallets.length
      ? supabase
          .from('dev_behavior_scores')
          .select('wallet_address, risk_tier, dump_velocity_score')
          .in('wallet_address', wallets)
      : Promise.resolve({ data: [] }),
    tokens.length
      ? supabase
          .from('token_lifecycle')
          .select('token_mint, status, death_cause, autopsy_slug, symbol')
          .in('token_mint', tokens)
      : Promise.resolve({ data: [] }),
  ]);

  const repByWallet = new Map<string, any>();
  (repRes.data || []).forEach((r: any) => repByWallet.set(r.wallet_address, r));
  const allstarByWallet = new Map<string, any>();
  (allstarRes.data || []).forEach((a: any) => allstarByWallet.set(a.master_wallet, a));
  const behaviorByWallet = new Map<string, any>();
  (behaviorRes.data || []).forEach((b: any) => behaviorByWallet.set(b.wallet_address, b));
  const lifecycleByMint = new Map<string, any>();
  (lifecycleRes.data || []).forEach((l: any) => lifecycleByMint.set(l.token_mint, l));

  const kycRoots = new Set<string>();
  const devs: XLookupDev[] = wallets.map((w) => {
    const rep = repByWallet.get(w);
    const all = allstarByWallet.get(w);
    const beh = behaviorByWallet.get(w);
    if (all?.kyc_root_wallet) kycRoots.add(all.kyc_root_wallet);
    return {
      wallet: w,
      truncated: truncateAddr(w),
      trustLevel: rep?.trust_level ?? null,
      reputationScore: rep?.reputation_score ?? null,
      tokensLaunched: rep?.total_tokens_launched ?? null,
      tokensRugged: rep?.tokens_rugged ?? null,
      tokensSuccessful: rep?.tokens_successful ?? null,
      isAllstar: !!all,
      allstarBestMcap: all?.best_mcap_achieved ?? null,
      allstarBestSymbol: all?.best_token_symbol ?? null,
      riskTier: beh?.risk_tier ?? null,
      dumpVelocity: beh?.dump_velocity_score ?? null,
    };
  });

  const tokenList: XLookupToken[] = tokens.map((mint) => {
    const lc = lifecycleByMint.get(mint);
    return {
      mint,
      symbol: lc?.symbol ?? null,
      status: lc?.status ?? null,
      deathCause: lc?.death_cause ?? null,
      autopsySlug: lc?.autopsy_slug ?? null,
    };
  });

  const communityList: XLookupCommunity[] = (communities || []).map((c: any) => {
    const isAdmin = (c.admin_usernames || []).map((u: string) => u.toLowerCase()).includes(handle);
    const previousNames = Array.isArray(c.previous_names) ? c.previous_names : [];
    return {
      id: c.id,
      name: c.community_name || 'Unknown',
      role: isAdmin ? 'admin' : 'mod',
      recycled: previousNames.length > 0,
      previousNames,
    };
  });

  // Verdict heuristic
  const hasAllstar = devs.some((d) => d.isAllstar);
  const hasBad = devs.some(
    (d) => d.trustLevel === 'rugger' || d.trustLevel === 'bad_actor' ||
           d.riskTier === 'high' || (d.tokensRugged ?? 0) >= 2,
  );
  let verdict: XLookupResult['verdict'] = 'unknown';
  if (hasAllstar && hasBad) verdict = 'mixed';
  else if (hasAllstar) verdict = 'allstar';
  else if (hasBad) verdict = 'bad_actor';
  else if (devs.length > 0) verdict = 'clean';

  const found = devs.length > 0 || tokenList.length > 0 || communityList.length > 0;

  return {
    handle,
    found,
    verdict,
    devs,
    tokens: tokenList,
    communities: communityList,
    recycledHandles: Array.from(recycledSet),
    kycRoots: Array.from(kycRoots),
    stats: {
      wallets: devs.length,
      tokens: tokenList.length,
      communities: communityList.length,
    },
  };
}

/**
 * Format a Telegram-friendly Markdown message from a lookup result.
 * Tickers are obfuscated by the caller (so this stays pure presentation).
 */
export function formatXLookupForTelegram(
  result: XLookupResult,
  obfuscate: (s: string | null | undefined) => string,
): string {
  if (!result.found) {
    return `🔍 *@${result.handle}*\n\n` +
      `No mesh links found yet.\n\n` +
      `Tip: paste a token CA so the system indexes its socials, then try again.`;
  }

  const verdictEmoji: Record<string, string> = {
    allstar: '⭐ ALLSTAR DEV',
    bad_actor: '⚠️ BAD ACTOR',
    mixed: '🟡 MIXED HISTORY',
    clean: '🟢 NO RED FLAGS',
    unknown: '❓ UNKNOWN',
  };

  const lines: string[] = [];
  lines.push(`🔍 *@${result.handle}*`);
  lines.push(
    `${result.stats.wallets} wallet(s) · ${result.stats.tokens} token(s) · ${result.stats.communities} community(ies)`,
  );
  lines.push('');
  lines.push(`*Verdict:* ${verdictEmoji[result.verdict]}`);

  if (result.kycRoots.length) {
    lines.push(`*KYC Root:* \`${truncateAddr(result.kycRoots[0])}\``);
  }

  if (result.devs.length) {
    lines.push('');
    lines.push('*Top Dev Wallets:*');
    result.devs.slice(0, 3).forEach((d) => {
      const tags: string[] = [];
      if (d.isAllstar) tags.push('⭐');
      if (d.trustLevel) tags.push(d.trustLevel);
      if (d.riskTier) tags.push(`risk:${d.riskTier}`);
      const stats: string[] = [];
      if (d.tokensLaunched != null) stats.push(`${d.tokensLaunched} launched`);
      if (d.tokensRugged != null && d.tokensRugged > 0) stats.push(`${d.tokensRugged} rugged`);
      if (d.tokensSuccessful != null && d.tokensSuccessful > 0) stats.push(`${d.tokensSuccessful} success`);
      if (d.allstarBestMcap) stats.push(`ATH $${formatMcap(d.allstarBestMcap)}`);
      lines.push(
        `• \`${d.truncated}\` ${tags.length ? `[${tags.join(', ')}]` : ''}` +
        (stats.length ? `\n   ${stats.join(' · ')}` : ''),
      );
    });
  }

  if (result.tokens.length) {
    lines.push('');
    lines.push('*Recent Tokens:*');
    result.tokens.slice(0, 5).forEach((t) => {
      const sym = obfuscate(t.symbol);
      const status = t.status === 'dead'
        ? `💀 dead${t.deathCause ? ` (${t.deathCause})` : ''}`
        : t.status === 'dying'
          ? '🩸 dying'
          : '🟢 alive';
      let line = `• ${sym} — ${status}`;
      if (t.autopsySlug) {
        line += `\n   [Autopsy](https://blackbox.farm/autopsies/${t.autopsySlug})`;
      }
      lines.push(line);
    });
    if (result.tokens.length > 5) {
      lines.push(`_…and ${result.tokens.length - 5} more_`);
    }
  }

  if (result.communities.length) {
    lines.push('');
    lines.push('*Communities:*');
    result.communities.slice(0, 5).forEach((c) => {
      let line = `• ${c.name} (${c.role})`;
      if (c.recycled) {
        line += ` ♻️ recycled — was: ${c.previousNames.slice(0, 2).join(', ')}`;
      }
      lines.push(line);
    });
  }

  if (result.recycledHandles.length) {
    lines.push('');
    lines.push(
      `♻️ *Recycled handle warning* — same wallets/tokens previously used: ${result.recycledHandles.slice(0, 3).map((h) => `@${h}`).join(', ')}`,
    );
  }

  lines.push('');
  lines.push(`🔗 [Visual mesh](https://blackbox.farm/bubblemap?x=${result.handle})`);
  return lines.join('\n');
}

function formatMcap(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function truncateAddrInline(addr: string): string {
  return truncateAddr(addr);
}