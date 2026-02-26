import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpiderStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail: string;
  timestamp?: string;
}

interface SpiderResult {
  verdict: 'red' | 'green' | 'yellow';
  verdictReason: string;
  inputType: 'token' | 'wallet' | 'handle';
  inputQuery: string;
  resolvedCreator: string | null;
  creatorSource: string | null;
  tokenInfo: { name?: string; symbol?: string; mint?: string; imageUri?: string } | null;
  existingReputation: {
    blacklisted: boolean;
    whitelisted: boolean;
    trustLevel: string | null;
    reputationScore: number | null;
    tokensRugged: number;
    blacklistReason: string | null;
    whitelistReason: string | null;
  };
  genealogy: {
    kycRoot: string | null;
    parents: string[];
    satellites: string[];
    depth: number;
  };
  discoveredTokens: Array<{
    mint: string;
    name: string | null;
    symbol: string | null;
    status: string | null;
    createdAt: string | null;
  }>;
  discoveredSocials: Array<{
    type: string;
    identifier: string;
    relationship: string;
    source: string;
  }>;
  meshUpdates: {
    blacklistAdded: number;
    whitelistAdded: number;
    meshLinksAdded: number;
    reputationUpdated: boolean;
  };
  steps: SpiderStep[];
}

function parseXUrl(input: string): string | null {
  // Match https://x.com/handle, https://twitter.com/handle, x.com/handle etc
  const xUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(@?[\w]+)\/?(?:\?.*)?$/i;
  const match = input.match(xUrlPattern);
  if (match) return match[1].replace('@', '');
  return null;
}

function normalizeQuery(raw: string): { cleaned: string; originalUrl: string | null } {
  const trimmed = raw.trim();
  
  // Check if it's an X/Twitter URL
  const xHandle = parseXUrl(trimmed);
  if (xHandle) {
    return { cleaned: `@${xHandle}`, originalUrl: trimmed };
  }
  
  // Already an @handle
  if (trimmed.startsWith('@')) {
    return { cleaned: trimmed, originalUrl: null };
  }
  
  return { cleaned: trimmed, originalUrl: null };
}

function detectInputType(query: string): 'token' | 'wallet' | 'handle' {
  if (query.startsWith('@')) return 'handle';
  if (query.length >= 32 && query.length <= 44 && /^[A-HJ-NP-Za-km-z1-9]+$/.test(query)) {
    return 'token';
  }
  return 'handle';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, forceVerdict, reason, autoUpdate = true } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query required (token mint, wallet, or @handle)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { cleaned: cleanQuery, originalUrl } = normalizeQuery(query.trim());
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const heliusKey = Deno.env.get('HELIUS_API_KEY');

    const steps: SpiderStep[] = [];
    const addStep = (name: string, status: SpiderStep['status'], detail: string) => {
      steps.push({ name, status, detail, timestamp: new Date().toISOString() });
    };

    const inputType = detectInputType(cleanQuery);
    addStep('Input Detection', 'done', 
      `Detected as: ${inputType}${originalUrl ? ` (parsed from URL: ${originalUrl.slice(0, 30)}...)` : ''} → ${cleanQuery}`);

    // ── STEP 1: Resolve creator wallet ──
    let creatorWallet: string | null = null;
    let creatorSource: string | null = null;
    let tokenInfo: SpiderResult['tokenInfo'] = null;
    let inputIsToken = false;

    if (inputType === 'handle') {
      addStep('Handle Resolution', 'running', `Looking up ${cleanQuery}`);
      const handle = cleanQuery.replace('@', '');

      // Check reputation_mesh for linked wallets
      const { data: meshLinks } = await supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, source_type, linked_type, relationship')
        .or(`source_id.eq.${handle},linked_id.eq.${handle}`)
        .limit(20);

      if (meshLinks && meshLinks.length > 0) {
        const walletLink = meshLinks.find((l: any) =>
          (l.source_type === 'wallet' || l.linked_type === 'wallet')
        );
        if (walletLink) {
          creatorWallet = walletLink.source_type === 'wallet' ? walletLink.source_id : walletLink.linked_id;
          creatorSource = 'reputation_mesh';
        }
      }

      // Check x_communities
      if (!creatorWallet) {
        const { data: communities } = await supabase
          .from('x_communities')
          .select('admin_handles, mod_handles, linked_wallets')
          .or(`admin_handles.cs.{${handle}},mod_handles.cs.{${handle}}`)
          .limit(5);

        if (communities && communities.length > 0) {
          for (const comm of communities) {
            if (comm.linked_wallets && comm.linked_wallets.length > 0) {
              creatorWallet = comm.linked_wallets[0];
              creatorSource = 'x_community';
              break;
            }
          }
        }
      }

      addStep('Handle Resolution', creatorWallet ? 'done' : 'error',
        creatorWallet ? `Resolved to wallet: ${creatorWallet.slice(0, 8)}...` : 'No wallet found for this handle');

    } else {
      // Token or Wallet input
      addStep('Entity Resolution', 'running', 'Resolving entity type...');

      // First check if it's a known token
      const { data: watchlistToken } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, creator_wallet, token_name, token_symbol, image_uri')
        .eq('token_mint', cleanQuery)
        .maybeSingle();

      if (watchlistToken) {
        inputIsToken = true;
        creatorWallet = watchlistToken.creator_wallet;
        creatorSource = 'pumpfun_watchlist';
        tokenInfo = {
          mint: watchlistToken.token_mint,
          name: watchlistToken.token_name,
          symbol: watchlistToken.token_symbol,
          imageUri: watchlistToken.image_uri,
        };
        addStep('Entity Resolution', 'done', `Token: ${watchlistToken.token_symbol || 'Unknown'} → Creator: ${creatorWallet?.slice(0, 8)}...`);
      } else {
        // Check token_lifecycle
        const { data: lifecycle } = await supabase
          .from('token_lifecycle')
          .select('token_mint, creator_wallet, token_name, token_symbol')
          .eq('token_mint', cleanQuery)
          .maybeSingle();

        if (lifecycle) {
          inputIsToken = true;
          creatorWallet = lifecycle.creator_wallet;
          creatorSource = 'token_lifecycle';
          tokenInfo = { mint: lifecycle.token_mint, name: lifecycle.token_name, symbol: lifecycle.token_symbol };
          addStep('Entity Resolution', 'done', `Token found in lifecycle → Creator: ${creatorWallet?.slice(0, 8)}...`);
        } else {
          // Try pump.fun API for token creator
          try {
            const pfRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${cleanQuery}`, {
              headers: { 'Accept': 'application/json' }
            });
            if (pfRes.ok) {
              const pfData = await pfRes.json();
              if (pfData.creator) {
                inputIsToken = true;
                creatorWallet = pfData.creator;
                creatorSource = 'pump.fun_api';
                tokenInfo = { mint: cleanQuery, name: pfData.name, symbol: pfData.symbol, imageUri: pfData.image_uri };
                addStep('Entity Resolution', 'done', `Pump.fun token: ${pfData.symbol} → Creator: ${creatorWallet?.slice(0, 8)}...`);
              }
            }
          } catch (e) {
            console.warn('[spider] Pump.fun API failed:', e);
          }

          // If still not found, treat as wallet address
          if (!creatorWallet) {
            creatorWallet = cleanQuery;
            creatorSource = 'direct_wallet_input';
            addStep('Entity Resolution', 'done', `Treating as wallet address: ${cleanQuery.slice(0, 8)}...`);
          }
        }
      }
    }

    if (!creatorWallet) {
      return new Response(JSON.stringify({
        verdict: 'yellow',
        verdictReason: 'Could not resolve any wallet from this input',
        inputType,
        inputQuery: cleanQuery,
        resolvedCreator: null,
        creatorSource: null,
        tokenInfo,
        existingReputation: { blacklisted: false, whitelisted: false, trustLevel: null, reputationScore: null, tokensRugged: 0, blacklistReason: null, whitelistReason: null },
        genealogy: { kycRoot: null, parents: [], satellites: [], depth: 0 },
        discoveredTokens: [],
        discoveredSocials: [],
        meshUpdates: { blacklistAdded: 0, whitelistAdded: 0, meshLinksAdded: 0, reputationUpdated: false },
        steps,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── STEP 2: Cross-reference against blacklist/whitelist/reputation ──
    addStep('Cross-Reference', 'running', 'Checking blacklist, whitelist, and reputation...');

    const [blacklistRes, whitelistRes, reputationRes] = await Promise.all([
      supabase.from('pumpfun_blacklist')
        .select('identifier, risk_level, blacklist_reason, entry_type')
        .eq('identifier', creatorWallet)
        .eq('is_active', true)
        .maybeSingle(),
      supabase.from('pumpfun_whitelist')
        .select('identifier, trust_level, whitelist_reason, entry_type')
        .eq('identifier', creatorWallet)
        .eq('is_active', true)
        .maybeSingle(),
      supabase.from('dev_wallet_reputation')
        .select('trust_level, reputation_score, tokens_rugged, total_tokens')
        .eq('wallet_address', creatorWallet)
        .maybeSingle(),
    ]);

    // Also check if the token itself is blacklisted
    let tokenBlacklisted = false;
    let tokenBlacklistReason: string | null = null;
    if (inputIsToken && tokenInfo?.mint) {
      const { data: tokenBl } = await supabase
        .from('pumpfun_blacklist')
        .select('blacklist_reason')
        .eq('identifier', tokenInfo.mint)
        .eq('is_active', true)
        .maybeSingle();
      if (tokenBl) {
        tokenBlacklisted = true;
        tokenBlacklistReason = tokenBl.blacklist_reason;
      }
    }

    const isBlacklisted = !!blacklistRes.data || tokenBlacklisted;
    const isWhitelisted = !!whitelistRes.data;
    const rep = reputationRes.data;
    const isRepBad = rep && (rep.trust_level === 'scammer' || rep.trust_level === 'serial_rugger' || rep.trust_level === 'blacklisted');
    const isRepGood = rep && (rep.trust_level === 'trusted' || rep.trust_level === 'legitimate_builder' || rep.trust_level === 'success');

    const existingReputation = {
      blacklisted: isBlacklisted,
      whitelisted: isWhitelisted,
      trustLevel: rep?.trust_level || null,
      reputationScore: rep?.reputation_score || null,
      tokensRugged: rep?.tokens_rugged || 0,
      blacklistReason: blacklistRes.data?.blacklist_reason || tokenBlacklistReason || null,
      whitelistReason: whitelistRes.data?.whitelist_reason || null,
    };

    // Determine verdict
    let verdict: 'red' | 'green' | 'yellow' = 'yellow';
    let verdictReason = 'New/unknown entity — indexed as neutral';

    if (forceVerdict) {
      verdict = forceVerdict;
      verdictReason = reason 
        ? `Manual submission: ${reason}` 
        : `Manually classified as ${forceVerdict === 'red' ? 'BAD ACTOR' : 'GOOD ACTOR'}`;
    } else if (isBlacklisted || isRepBad) {
      verdict = 'red';
      verdictReason = isBlacklisted
        ? `Known bad actor: ${existingReputation.blacklistReason || 'Blacklisted'}`
        : `Dev flagged as ${rep?.trust_level} (${rep?.tokens_rugged || 0} rugs, score: ${rep?.reputation_score || 0})`;
    } else if (isWhitelisted || isRepGood) {
      verdict = 'green';
      verdictReason = isWhitelisted
        ? `Trusted entity: ${existingReputation.whitelistReason || 'Whitelisted'}`
        : `Dev trusted as ${rep?.trust_level} (score: ${rep?.reputation_score || 0})`;
    }

    addStep('Cross-Reference', 'done', `Verdict: ${verdict.toUpperCase()} — ${verdictReason.slice(0, 60)}`);

    // ── STEP 3: Genealogy trace ──
    addStep('Genealogy Trace', 'running', 'Tracing funding chain...');
    const genealogy = { kycRoot: null as string | null, parents: [] as string[], satellites: [] as string[], depth: 0 };

    if (heliusKey) {
      try {
        // Trace parent wallets (who funded this creator)
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
        let currentWallet = creatorWallet;

        for (let depth = 0; depth < 3; depth++) {
          const sigRes = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'getSignaturesForAddress',
              params: [currentWallet, { limit: 50 }]
            })
          });

          if (!sigRes.ok) break;
          const sigData = await sigRes.json();
          const signatures = sigData?.result || [];
          if (signatures.length === 0) break;

          // Get oldest signature (first funding tx)
          const oldestSig = signatures[signatures.length - 1]?.signature;
          if (!oldestSig) break;

          const txRes = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'getTransaction',
              params: [oldestSig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            })
          });

          if (!txRes.ok) break;
          const txData = await txRes.json();
          const tx = txData?.result;
          if (!tx) break;

          // Find the funder (first account that isn't the current wallet and sent SOL)
          const accounts = tx.transaction?.message?.accountKeys || [];
          const preBalances = tx.meta?.preBalances || [];
          const postBalances = tx.meta?.postBalances || [];

          let funder: string | null = null;
          for (let i = 0; i < accounts.length; i++) {
            const pubkey = typeof accounts[i] === 'string' ? accounts[i] : accounts[i]?.pubkey;
            if (pubkey === currentWallet) continue;
            if (preBalances[i] > postBalances[i] && (preBalances[i] - postBalances[i]) > 1000000) { // sent > 0.001 SOL
              funder = pubkey;
              break;
            }
          }

          if (!funder) break;

          // Check if funder is a known CEX
          const knownCEXes = [
            '5tzFkiKscjHsFKrxv2aNJchkHR', // Binance hot wallets prefix
            'AC5RDfQFmDS1deWZos9', // Coinbase
          ];
          const isCEX = knownCEXes.some(prefix => funder!.startsWith(prefix));

          genealogy.parents.push(funder);
          genealogy.depth = depth + 1;

          if (isCEX) {
            genealogy.kycRoot = funder;
            break;
          }

          // Check if this parent is in blacklist/whitelist
          const { data: parentBl } = await supabase
            .from('pumpfun_blacklist')
            .select('blacklist_reason')
            .eq('identifier', funder)
            .eq('is_active', true)
            .maybeSingle();

          if (parentBl && verdict === 'yellow') {
            verdict = 'red';
            verdictReason = `Funded by blacklisted wallet: ${funder.slice(0, 8)}... (${parentBl.blacklist_reason || 'blacklisted'})`;
          }

          currentWallet = funder;
        }

        // Find satellite wallets (wallets this creator has funded)
        const satRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1,
            method: 'getSignaturesForAddress',
            params: [creatorWallet, { limit: 100 }]
          })
        });

        if (satRes.ok) {
          // We just note the genealogy was traced - full satellite detection
          // would require parsing all transactions which is expensive
          genealogy.kycRoot = genealogy.parents.length > 0
            ? genealogy.parents[genealogy.parents.length - 1]
            : creatorWallet;
        }

      } catch (e) {
        console.error('[spider] Genealogy trace error:', e);
        addStep('Genealogy Trace', 'error', `Trace failed: ${e}`);
      }
    } else {
      // Check DB for existing genealogy data
      const { data: existingMesh } = await supabase
        .from('reputation_mesh')
        .select('source_id, linked_id, relationship')
        .or(`source_id.eq.${creatorWallet},linked_id.eq.${creatorWallet}`)
        .in('relationship', ['directly_funded', 'indirectly_funded', 'funded_by', 'satellite_of'])
        .limit(20);

      if (existingMesh && existingMesh.length > 0) {
        for (const link of existingMesh) {
          const other = link.source_id === creatorWallet ? link.linked_id : link.source_id;
          if (link.relationship === 'funded_by' || link.relationship === 'directly_funded') {
            genealogy.parents.push(other);
          } else {
            genealogy.satellites.push(other);
          }
        }
        genealogy.depth = genealogy.parents.length;
        genealogy.kycRoot = genealogy.parents.length > 0 ? genealogy.parents[genealogy.parents.length - 1] : null;
      }
    }

    addStep('Genealogy Trace', 'done',
      `Depth: ${genealogy.depth}, Parents: ${genealogy.parents.length}, KYC Root: ${genealogy.kycRoot?.slice(0, 8) || 'N/A'}`);

    // ── STEP 4: Discover all tokens by creator ──
    addStep('Token Discovery', 'running', 'Finding all tokens by this creator...');
    const discoveredTokens: SpiderResult['discoveredTokens'] = [];

    // From pumpfun_watchlist
    const { data: watchlistTokens } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_name, token_symbol, status, first_seen_at')
      .eq('creator_wallet', creatorWallet)
      .order('first_seen_at', { ascending: false })
      .limit(50);

    if (watchlistTokens) {
      for (const t of watchlistTokens) {
        discoveredTokens.push({
          mint: t.token_mint,
          name: t.token_name,
          symbol: t.token_symbol,
          status: t.status,
          createdAt: t.first_seen_at,
        });
      }
    }

    // From developer_tokens
    const { data: devTokens } = await supabase
      .from('developer_tokens')
      .select('token_mint, token_name, token_symbol, lifecycle_status, created_at')
      .eq('creator_wallet', creatorWallet)
      .order('created_at', { ascending: false })
      .limit(50);

    if (devTokens) {
      const existingMints = new Set(discoveredTokens.map(t => t.mint));
      for (const t of devTokens) {
        if (!existingMints.has(t.token_mint)) {
          discoveredTokens.push({
            mint: t.token_mint,
            name: t.token_name,
            symbol: t.token_symbol,
            status: t.lifecycle_status,
            createdAt: t.created_at,
          });
        }
      }
    }

    // Also check tokens by parent/satellite wallets
    const allRelatedWallets = [...genealogy.parents, ...genealogy.satellites];
    if (allRelatedWallets.length > 0) {
      const { data: relatedTokens } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, token_name, token_symbol, status, first_seen_at, creator_wallet')
        .in('creator_wallet', allRelatedWallets.slice(0, 10))
        .limit(30);

      if (relatedTokens) {
        const existingMints = new Set(discoveredTokens.map(t => t.mint));
        for (const t of relatedTokens) {
          if (!existingMints.has(t.token_mint)) {
            discoveredTokens.push({
              mint: t.token_mint,
              name: `${t.token_name} [via ${t.creator_wallet?.slice(0, 6)}...]`,
              symbol: t.token_symbol,
              status: t.status,
              createdAt: t.first_seen_at,
            });
          }
        }
      }
    }

    addStep('Token Discovery', 'done', `Found ${discoveredTokens.length} tokens across ${1 + allRelatedWallets.length} wallets`);

    // ── STEP 5: Discover socials ──
    addStep('Social Discovery', 'running', 'Finding linked social accounts...');
    const discoveredSocials: SpiderResult['discoveredSocials'] = [];

    // From reputation_mesh
    const { data: socialMesh } = await supabase
      .from('reputation_mesh')
      .select('source_id, linked_id, source_type, linked_type, relationship')
      .or(`source_id.eq.${creatorWallet},linked_id.eq.${creatorWallet}`)
      .limit(30);

    if (socialMesh) {
      for (const link of socialMesh) {
        const isSource = link.source_id === creatorWallet;
        const otherId = isSource ? link.linked_id : link.source_id;
        const otherType = isSource ? link.linked_type : link.source_type;
        if (otherType === 'x_account' || otherType === 'x_community' || otherType === 'telegram') {
          discoveredSocials.push({
            type: otherType,
            identifier: otherId,
            relationship: link.relationship,
            source: 'reputation_mesh',
          });
        }
      }
    }

    // Check pumpfun_watchlist for twitter/website
    if (inputIsToken && tokenInfo?.mint) {
      const { data: tokenSocials } = await supabase
        .from('pumpfun_watchlist')
        .select('twitter_url, website_url, telegram_url')
        .eq('token_mint', tokenInfo.mint)
        .maybeSingle();

      if (tokenSocials) {
        if (tokenSocials.twitter_url) {
          const handle = tokenSocials.twitter_url.replace(/https?:\/\/(x\.com|twitter\.com)\//, '').replace(/\/$/, '');
          discoveredSocials.push({ type: 'x_account', identifier: `@${handle}`, relationship: 'token_social', source: 'watchlist' });
        }
        if (tokenSocials.telegram_url) {
          discoveredSocials.push({ type: 'telegram', identifier: tokenSocials.telegram_url, relationship: 'token_social', source: 'watchlist' });
        }
        if (tokenSocials.website_url) {
          discoveredSocials.push({ type: 'website', identifier: tokenSocials.website_url, relationship: 'token_social', source: 'watchlist' });
        }
      }
    }

    // Check x_communities for linked communities
    const { data: linkedComms } = await supabase
      .from('x_communities')
      .select('community_id, community_name, admin_handles, mod_handles')
      .or(`admin_handles.cs.{${creatorWallet}},linked_wallets.cs.{${creatorWallet}}`)
      .limit(5);

    if (linkedComms) {
      for (const comm of linkedComms) {
        discoveredSocials.push({
          type: 'x_community',
          identifier: comm.community_name || comm.community_id,
          relationship: 'community',
          source: 'x_communities',
        });
        // Add admin/mod handles
        for (const admin of (comm.admin_handles || [])) {
          discoveredSocials.push({ type: 'x_account', identifier: `@${admin}`, relationship: 'admin', source: 'x_community' });
        }
        for (const mod of (comm.mod_handles || []).slice(0, 10)) {
          discoveredSocials.push({ type: 'x_account', identifier: `@${mod}`, relationship: 'mod', source: 'x_community' });
        }
      }
    }

    addStep('Social Discovery', 'done', `Found ${discoveredSocials.length} social links`);

    // ── STEP 6: Auto-update meshes ──
    const meshUpdates = { blacklistAdded: 0, whitelistAdded: 0, meshLinksAdded: 0, reputationUpdated: false };

    if (autoUpdate) {
      addStep('Mesh Update', 'running', `Updating meshes for ${verdict} verdict...`);

      try {
        // Update dev_wallet_reputation
        const repTrustLevel = verdict === 'red' ? 'scammer' : verdict === 'green' ? 'trusted' : 'neutral';
        const { data: existingRep } = await supabase
          .from('dev_wallet_reputation')
          .select('id, trust_level')
          .eq('wallet_address', creatorWallet)
          .maybeSingle();

        if (existingRep) {
          // Don't downgrade scammer/serial_rugger/blacklisted
          const protectedLevels = ['scammer', 'serial_rugger', 'blacklisted'];
          if (!protectedLevels.includes(existingRep.trust_level) || verdict === 'red') {
            await supabase.from('dev_wallet_reputation')
              .update({ trust_level: repTrustLevel, total_tokens: discoveredTokens.length })
              .eq('id', existingRep.id);
            meshUpdates.reputationUpdated = true;
          }
        } else {
          await supabase.from('dev_wallet_reputation').insert({
            wallet_address: creatorWallet,
            trust_level: repTrustLevel,
            total_tokens: discoveredTokens.length,
            tokens_rugged: 0,
            reputation_score: verdict === 'red' ? 0 : verdict === 'green' ? 80 : 50,
          });
          meshUpdates.reputationUpdated = true;
        }

        // Update blacklist/whitelist
        if (verdict === 'red') {
          // Add creator wallet to blacklist if not already there
          const allWalletsToBlacklist = [creatorWallet, ...genealogy.parents, ...genealogy.satellites];
          for (const wallet of [...new Set(allWalletsToBlacklist)]) {
            const { data: existing } = await supabase
              .from('pumpfun_blacklist')
              .select('id')
              .eq('identifier', wallet)
              .maybeSingle();

            if (!existing) {
              await supabase.from('pumpfun_blacklist').insert({
                entry_type: wallet === creatorWallet ? 'dev_wallet' : 'funding_wallet',
                identifier: wallet,
                risk_level: wallet === creatorWallet ? 'critical' : 'high',
                blacklist_reason: verdictReason,
                tags: ['spider_discovered'],
                source: 'oracle_spider',
                enrichment_status: 'complete',
              });
              meshUpdates.blacklistAdded++;
            }
          }

          // Blacklist ALL discovered tokens by this actor
          const allTokenMints = new Set<string>();
          if (inputIsToken && tokenInfo?.mint) allTokenMints.add(tokenInfo.mint);
          for (const dt of discoveredTokens) allTokenMints.add(dt.mint);

          for (const mint of allTokenMints) {
            const { data: existingToken } = await supabase
              .from('pumpfun_blacklist')
              .select('id')
              .eq('identifier', mint)
              .maybeSingle();

            if (!existingToken) {
              await supabase.from('pumpfun_blacklist').insert({
                entry_type: 'token_address',
                identifier: mint,
                risk_level: 'critical',
                blacklist_reason: reason || `Token by blacklisted actor: ${creatorWallet.slice(0, 8)}...`,
                tags: ['spider_discovered'],
                linked_wallets: [creatorWallet],
                source: 'oracle_spider',
                enrichment_status: 'complete',
              });
              meshUpdates.blacklistAdded++;
            }
          }
        } else if (verdict === 'green') {
          // Add creator to whitelist if not already there
          const { data: existing } = await supabase
            .from('pumpfun_whitelist')
            .select('id')
            .eq('identifier', creatorWallet)
            .maybeSingle();

          if (!existing) {
            await supabase.from('pumpfun_whitelist').insert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              trust_level: 'high',
              whitelist_reason: verdictReason,
              tags: ['spider_discovered'],
              tokens_launched: discoveredTokens.length,
              tokens_successful: discoveredTokens.filter(t => t.status === 'graduated' || t.status === 'success').length,
              source: 'oracle_spider',
            });
            meshUpdates.whitelistAdded++;
          }
        }

        // Add reputation_mesh links for all discovered relationships
        const meshInserts: any[] = [];

        // Creator → Token links
        for (const token of discoveredTokens.slice(0, 20)) {
          meshInserts.push({
            source_type: 'wallet',
            source_id: creatorWallet,
            linked_type: 'token',
            linked_id: token.mint,
            relationship: 'created',
            confidence: 95,
            discovered_by: 'oracle_spider',
          });
        }

        // Creator → Social links
        for (const social of discoveredSocials.slice(0, 15)) {
          meshInserts.push({
            source_type: 'wallet',
            source_id: creatorWallet,
            linked_type: social.type,
            linked_id: social.identifier,
            relationship: social.relationship,
            confidence: 80,
            discovered_by: 'oracle_spider',
          });
        }

        // Genealogy links
        for (const parent of genealogy.parents) {
          meshInserts.push({
            source_type: 'wallet',
            source_id: parent,
            linked_type: 'wallet',
            linked_id: creatorWallet,
            relationship: 'directly_funded',
            confidence: 90,
            discovered_by: 'oracle_spider',
          });
        }

        if (meshInserts.length > 0) {
          // Use upsert to avoid duplicates
          const { error: meshError } = await supabase
            .from('reputation_mesh')
            .upsert(meshInserts, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });

          if (!meshError) {
            meshUpdates.meshLinksAdded = meshInserts.length;
          } else {
            // Try individual inserts for those without conflicts
            let inserted = 0;
            for (const insert of meshInserts) {
              const { error } = await supabase.from('reputation_mesh').insert(insert);
              if (!error) inserted++;
            }
            meshUpdates.meshLinksAdded = inserted;
          }
        }

        addStep('Mesh Update', 'done',
          `BL+${meshUpdates.blacklistAdded} WL+${meshUpdates.whitelistAdded} Mesh+${meshUpdates.meshLinksAdded} Rep:${meshUpdates.reputationUpdated ? 'updated' : 'unchanged'}`);

      } catch (e) {
        console.error('[spider] Mesh update error:', e);
        addStep('Mesh Update', 'error', `Update failed: ${e}`);
      }
    }

    // ── STEP 7: Trigger deeper scans (fire and forget) ──
    addStep('Deep Scans', 'running', 'Triggering background enrichment...');
    try {
      // Trigger genealogy scanner for deeper trace
      supabase.functions.invoke('wallet-genealogy-scanner', {
        body: { wallet: creatorWallet, depth: 3 }
      }).catch(() => {});

      // Trigger community enricher if we found X links
      const xHandles = discoveredSocials.filter(s => s.type === 'x_account').map(s => s.identifier.replace('@', ''));
      if (xHandles.length > 0) {
        supabase.functions.invoke('x-community-enricher', {
          body: { handles: xHandles.slice(0, 5) }
        }).catch(() => {});
      }

      addStep('Deep Scans', 'done', 'Background enrichment triggered');
    } catch (e) {
      addStep('Deep Scans', 'error', `Failed to trigger: ${e}`);
    }

    const result: SpiderResult = {
      verdict,
      verdictReason,
      inputType,
      inputQuery: cleanQuery,
      resolvedCreator: creatorWallet,
      creatorSource,
      tokenInfo,
      existingReputation,
      genealogy,
      discoveredTokens,
      discoveredSocials,
      meshUpdates,
      steps,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[oracle-master-spider] Error:', err);
    return new Response(JSON.stringify({ error: `Spider failed: ${err}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
