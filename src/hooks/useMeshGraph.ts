import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RedFlag {
  type: 'unlinked_cluster' | 'recycled_identity' | 'rotated_handle' | 'circular_funding';
  severity: 'high' | 'critical';
  shortLabel: string;
  explanation: string;
}

export interface MeshNode {
  id: string;
  type: string;
  label: string;       // Friendly display label ($TICKER, @handle, "KYC Root")
  fullId: string;      // Raw ID for tooltip (full address)
  val: number;
  redFlags?: RedFlag[];
  role?: 'admin' | 'mod' | null;  // For x_account nodes: their role in community
  isDev?: boolean;     // True if this wallet created a token
  displayName?: string; // For x_account: the account's display name from evidence
}

export interface MeshLink {
  source: string;
  target: string;
  relationship: string;
  confidence: number;
}

export interface MeshGraphData {
  nodes: MeshNode[];
  links: MeshLink[];
}

export interface SpiderStatus {
  active: boolean;
  stage: string;
  inputType?: string;
  meshLinksAdded?: number;
  score?: number;
  trafficLight?: string;
  recommendation?: string;
  error?: string;
  diagnostics?: string[]; // NEW: detailed step-by-step logs
}

// Color palette for entity types
export const ENTITY_COLORS: Record<string, string> = {
  wallet: '#22c55e',
  token: '#eab308',
  x_account: '#3b82f6',
  x_user: '#2563eb',
  x_community: '#6366f1',
  telegram: '#06b6d4',
  telegram_channel: '#0891b2',
  kyc_root: '#ffffff',
  discord: '#8b5cf6',
  github: '#a3a3a3',
  twitch: '#a855f7',
  website: '#f97316',
  reddit: '#ef4444',
  youtube: '#dc2626',
  medium: '#737373',
};

export const ENTITY_LABELS: Record<string, string> = {
  wallet: '💰 Wallet',
  token: '🪙 Token',
  x_account: '🐦 X Handle',
  x_user: '🔵 X User ID',
  x_community: '👥 X Community',
  telegram: '📡 Telegram',
  telegram_channel: '📡 TG Channel',
  kyc_root: '🏦 KYC Root',
  discord: '💬 Discord',
  github: '🐙 GitHub',
  twitch: '🎮 Twitch',
  website: '🌐 Website',
  reddit: '🔴 Reddit',
  youtube: '📺 YouTube',
  medium: '📝 Medium',
};

const getNodeLabel = (id: string, type: string, evidence?: any) => {
  // Try to extract friendly names from evidence metadata
  if (evidence) {
    if (type === 'token') {
      const symbol = evidence.symbol || evidence.ticker || evidence.token_symbol;
      if (symbol) return `$${symbol.replace(/^\$/, '').toUpperCase()}`;
      const name = evidence.token_name || evidence.name;
      if (name && name.length <= 20) return name;
    }
    if (type === 'x_community') {
      const name = evidence.community_name || evidence.name || evidence.title;
      if (name) return name.length > 18 ? name.slice(0, 16) + '…' : name;
      // handle-as-community fallback
      if (evidence.fallback === 'handle_as_community' && evidence.handle) {
        return `@${evidence.handle} (community)`;
      }
    }
    if (type === 'telegram_channel') {
      const title = evidence.channel_title || evidence.title || evidence.name;
      if (title) {
        const prefix = evidence.is_recycled ? '♻️ ' : '';
        const label = title.length > 16 ? title.slice(0, 14) + '…' : title;
        return `${prefix}${label}`;
      }
    }
    if (type === 'kyc_root') {
      const exchange = evidence.exchange || evidence.platform || evidence.kyc_provider;
      if (exchange) return `KYC ${exchange}`;
    }
    if (type === 'website') {
      try {
        const url = new URL(id.startsWith('http') ? id : `https://${id}`);
        return url.hostname.replace(/^www\./, '');
      } catch { /* fall through */ }
    }
  }

  // Default friendly labels by type
  if (type === 'token') return `$${id.length > 8 ? id.slice(0, 6) + '…' : id}`;
  if (type === 'x_account') return `@${id.replace(/^@/, '')}`;
  if (type === 'x_community' && id.startsWith('handle:')) return `@${id.slice(7)} (community)`;
  if (type === 'x_user') return `X:${id.length > 12 ? id.slice(0, 10) + '…' : id}`;
  if (type === 'telegram_channel') return `TG ${id.length > 12 ? id.slice(0, 10) + '…' : id}`;
  if (type === 'kyc_root') return `KYC ${id.length > 12 ? id.slice(0, 8) + '…' : id}`;
  if (type === 'website') {
    try {
      const url = new URL(id.startsWith('http') ? id : `https://${id}`);
      return url.hostname.replace(/^www\./, '');
    } catch { /* fall through */ }
  }
  if (id.length > 16) return `${id.slice(0, 6)}…${id.slice(-4)}`;
  return id;
};

export function useMeshGraph(initialEntityId?: string) {
  const [focusedEntity, setFocusedEntity] = useState<{ id: string; type: string } | null>(
    initialEntityId ? { id: initialEntityId, type: 'unknown' } : null
  );
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(Object.keys(ENTITY_COLORS)));
  const [spiderStatus, setSpiderStatus] = useState<SpiderStatus>({ active: false, stage: '' });
  
  // Track spider attempts with cooldown-based retry (resets after 5 minutes)
  const spiderAttemptsRef = useRef<Map<string, { count: number; lastAttempt: number }>>(new Map());

  // Strip type prefix (e.g., "wallet:ABC..." → "ABC...") for DB queries
  const stripPrefix = (id: string) => {
    const colonIdx = id.indexOf(':');
    return colonIdx >= 0 ? id.slice(colonIdx + 1) : id;
  };
  
  const entityIds = [...expandedEntities].map(stripPrefix);
  if (focusedEntity) entityIds.push(focusedEntity.id);
  const uniqueIds = [...new Set(entityIds)];

  // Reverse community lookup: when searching an X handle, find all communities they admin/mod
  const reverseCommunityLookupDone = useRef<Set<string>>(new Set());

  const { data: graphData, isLoading, refetch } = useQuery({
    queryKey: ['mesh-graph', uniqueIds.sort().join(','), [...typeFilters].sort().join(',')],
    queryFn: async (): Promise<MeshGraphData> => {
      if (uniqueIds.length === 0) {
        return { nodes: [], links: [] };
      }

      const allLinks: any[] = [];

      // ═══ REVERSE COMMUNITY LOOKUP for X handles ═══
      // If focused entity looks like an X handle, check x_communities for admin/mod membership
      // and auto-upsert mesh links so they show up immediately
      if (focusedEntity?.type === 'x_account' || focusedEntity?.type === 'x_user') {
        const handle = focusedEntity.id.replace(/^@/, '').toLowerCase();
        if (!reverseCommunityLookupDone.current.has(handle)) {
          reverseCommunityLookupDone.current.add(handle);
          try {
            // 1) Communities where the handle is admin/mod
            const { data: directCommunities } = await supabase
              .from('x_communities')
              .select('community_id, name, admin_usernames, moderator_usernames, linked_token_mints')
              .or(`admin_usernames.cs.{"${handle}"},moderator_usernames.cs.{"${handle}"}`);

            // 2) Tokens that reference the handle as their X account, then any
            //    community that lists those tokens in linked_token_mints.
            const { data: socialRows } = await supabase
              .from('token_social_links')
              .select('mint')
              .ilike('extracted_handle', handle)
              .limit(50);
            const handleMints: string[] = Array.from(new Set(((socialRows || []) as any[])
              .map((r) => (r as any).mint).filter(Boolean)));

            let tokenCommunities: any[] = [];
            if (handleMints.length > 0) {
              const { data: tc } = await supabase
                .from('x_communities')
                .select('community_id, name, admin_usernames, moderator_usernames, linked_token_mints')
                .overlaps('linked_token_mints', handleMints);
              tokenCommunities = tc || [];
            }

            // Merge by community_id
            const merged = new Map<string, any>();
            for (const c of [...(directCommunities || []), ...tokenCommunities]) {
              merged.set((c as any).community_id, c);
            }
            const communities = Array.from(merged.values());

            if (communities && communities.length > 0) {
              console.log(`[MeshGraph] Reverse community lookup found ${communities.length} communities for @${handle}`);
              const upserts: any[] = [];
              const now = new Date().toISOString();

              for (const comm of communities) {
                const isAdmin = (comm.admin_usernames || []).map((u: string) => u.toLowerCase()).includes(handle);
                const isMod = (comm.moderator_usernames || []).map((u: string) => u.toLowerCase()).includes(handle);
                const relationship = isAdmin ? 'community_admin' : isMod ? 'community_mod' : 'member_of';

                // Link handle → community
                upserts.push({
                  source_id: comm.community_id,
                  source_type: 'x_community',
                  linked_id: handle,
                  linked_type: 'x_account',
                  relationship,
                  confidence: 95,
                  evidence: { source: 'reverse_lookup', community_name: comm.name },
                  discovered_at: now,
                });

                // Also link community → any linked tokens
                const tokens = comm.linked_token_mints || [];
                for (const mint of tokens) {
                  // Restrict to mints we know are tied to this handle to avoid
                  // dragging in every other token a recycled community ever held.
                  if (handleMints.length > 0 && !handleMints.includes(mint) && !isAdmin && !isMod) continue;
                  upserts.push({
                    source_id: comm.community_id,
                    source_type: 'x_community',
                    linked_id: mint,
                    linked_type: 'token',
                    relationship: 'community_for',
                    confidence: 90,
                    evidence: { source: 'reverse_lookup' },
                    discovered_at: now,
                  });
                }
              }

              if (upserts.length > 0) {
                await supabase
                  .from('reputation_mesh')
                  .upsert(upserts, { onConflict: 'source_id,linked_id,relationship', ignoreDuplicates: true });
                console.log(`[MeshGraph] Upserted ${upserts.length} reverse community links`);
              }
            }
          } catch (err) {
            console.warn('[MeshGraph] Reverse community lookup failed:', err);
          }
        }
      }

      // ═══ COMMUNITY ID LOOKUP ═══
      // If focused entity is an X Community, look up its data and auto-create mesh links
      if (focusedEntity?.type === 'x_community') {
        const commId = focusedEntity.id;
        if (!reverseCommunityLookupDone.current.has(`comm_${commId}`)) {
          reverseCommunityLookupDone.current.add(`comm_${commId}`);
          try {
            const { data: comm } = await supabase
              .from('x_communities')
              .select('community_id, name, admin_usernames, moderator_usernames, linked_token_mints')
              .eq('community_id', commId)
              .maybeSingle();

            if (comm) {
              console.log(`[MeshGraph] Community lookup found: ${comm.name}, admins: ${(comm.admin_usernames || []).length}, mods: ${(comm.moderator_usernames || []).length}`);
              const upserts: any[] = [];
              const now = new Date().toISOString();

              // Link community → admins
              for (const admin of (comm.admin_usernames || [])) {
                const handle = admin.toLowerCase();
                upserts.push({
                  source_id: commId,
                  source_type: 'x_community',
                  linked_id: handle,
                  linked_type: 'x_account',
                  relationship: 'community_admin',
                  confidence: 95,
                  evidence: { source: 'community_lookup', community_name: comm.name },
                  discovered_at: now,
                });
              }

              // Link community → mods
              for (const mod of (comm.moderator_usernames || [])) {
                const handle = mod.toLowerCase();
                upserts.push({
                  source_id: commId,
                  source_type: 'x_community',
                  linked_id: handle,
                  linked_type: 'x_account',
                  relationship: 'community_mod',
                  confidence: 95,
                  evidence: { source: 'community_lookup', community_name: comm.name },
                  discovered_at: now,
                });
              }

              // Link community → tokens
              for (const mint of (comm.linked_token_mints || [])) {
                upserts.push({
                  source_id: commId,
                  source_type: 'x_community',
                  linked_id: mint,
                  linked_type: 'token',
                  relationship: 'community_for',
                  confidence: 90,
                  evidence: { source: 'community_lookup', community_name: comm.name },
                  discovered_at: now,
                });
              }

              if (upserts.length > 0) {
                await supabase
                  .from('reputation_mesh')
                  .upsert(upserts, { onConflict: 'source_id,linked_id,relationship', ignoreDuplicates: true });
                console.log(`[MeshGraph] Upserted ${upserts.length} community mesh links`);
              }
            } else {
              console.log(`[MeshGraph] Community ${commId} not in x_communities table — will need scraping`);
            }
          } catch (err) {
            console.warn('[MeshGraph] Community lookup failed:', err);
          }
        }
      }
      
      // 1-hop: fetch links for all focused/expanded entities
      for (const entityId of uniqueIds) {
        const { data, error } = await supabase
          .from('reputation_mesh')
          .select('*')
          .or(`source_id.eq.${entityId},linked_id.eq.${entityId}`)
          .limit(200);
        if (error) throw error;
        if (data) allLinks.push(...data);
      }

      // 2-hop: for wallet entities, also fetch links for their direct neighbors
      const hop1Ids = new Set<string>();
      for (const link of allLinks) {
        if (
          link.source_type === 'wallet' || link.linked_type === 'wallet' ||
          link.source_type === 'kyc_root' || link.linked_type === 'kyc_root' ||
          link.source_type === 'x_community' || link.linked_type === 'x_community'
        ) {
          hop1Ids.add(link.source_id);
          hop1Ids.add(link.linked_id);
        }
      }
      
      // Only fetch 2nd-hop for IDs not already queried
      const hop2Ids = [...hop1Ids].filter(id => !uniqueIds.includes(id));
      for (const entityId of hop2Ids.slice(0, 20)) { // Cap at 20 to avoid overload
        const { data, error } = await supabase
          .from('reputation_mesh')
          .select('*')
          .or(`source_id.eq.${entityId},linked_id.eq.${entityId}`)
          .limit(100);
        if (error) throw error;
        if (data) allLinks.push(...data);
      }

      const seen = new Set<string>();
      const dedupedLinks = allLinks.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });

      return buildGraph(dedupedLinks, typeFilters);
    },
    staleTime: 30_000,
    enabled: uniqueIds.length > 0,
  });

  // Auto-discover X Community for token mints via DexScreener
  const autoDiscoverCommunity = useCallback(async (tokenMint: string, walletAddress?: string) => {
    try {
      console.log(`[MeshSpider] Auto-discovering X Community for token ${tokenMint.slice(0, 12)}...`);

      // Cache-first: if this token already has a recently scraped community, skip external fetches
      const { data: cachedCommunities } = await supabase
        .from('x_communities')
        .select('community_id, last_scraped_at, scrape_status, admin_usernames, moderator_usernames')
        .contains('linked_token_mints', [tokenMint])
        .order('last_scraped_at', { ascending: false })
        .limit(1);

      const cachedCommunity = cachedCommunities?.[0];
      const hasRecentCommunityCache = !!cachedCommunity?.last_scraped_at &&
        (Date.now() - new Date(cachedCommunity.last_scraped_at).getTime()) < (24 * 60 * 60 * 1000);
      const hasStoredStaff = ((cachedCommunity?.admin_usernames?.length || 0) + (cachedCommunity?.moderator_usernames?.length || 0)) > 0;

      if (cachedCommunity && hasRecentCommunityCache && cachedCommunity.scrape_status === 'complete' && hasStoredStaff) {
        console.log(`[MeshSpider] Cache hit for token ${tokenMint.slice(0, 8)} — skipping DexScreener/X Community scrape`);
        return;
      }

      // Collect all social URLs from available sources
      let allSocialUrls: string[] = [];
      let communityUrl: string | null = null;
      let discoverySource = 'dexscreener_auto';
      let tokenSymbol: string | undefined;
      let tokenName: string | undefined;

      // 1. Try DexScreener v1 API first (supports PumpSwap + graduated tokens)
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`);
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          // v1 returns an array of pairs directly
          const pair = Array.isArray(dexData) ? dexData[0] : dexData?.pairs?.[0];
          const socials = pair?.info?.socials || [];
          const websites = pair?.info?.websites || [];
          tokenSymbol = pair?.baseToken?.symbol;
          tokenName = pair?.baseToken?.name;
          allSocialUrls = [
            ...socials.map((s: any) => s.url),
            ...websites.map((w: any) => w.url),
          ].filter(Boolean);
          if (allSocialUrls.length > 0) {
            console.log(`[MeshSpider] DexScreener v1 returned ${allSocialUrls.length} social URLs:`, allSocialUrls);
          }
        }
      } catch (e) {
        console.warn('[MeshSpider] DexScreener fetch failed:', e);
      }

      // 2. ALWAYS check Pump.fun metadata — DexScreener may have socials but miss the community URL
      try {
        console.log(`[MeshSpider] Checking Pump.fun metadata for ${tokenMint.slice(0, 12)}...`);
        const pumpRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`);
        if (pumpRes.ok) {
          const pumpData = await pumpRes.json();
          if (!tokenSymbol && pumpData?.symbol) tokenSymbol = pumpData.symbol;
          if (!tokenName && pumpData?.name) tokenName = pumpData.name;
          const pumpSocials: string[] = [];
          // Collect all social fields from pump.fun
          for (const field of [pumpData?.twitter, pumpData?.telegram, pumpData?.website]) {
            if (field && typeof field === 'string' && field.trim().length > 0) {
              pumpSocials.push(field.trim());
            }
          }
          if (pumpSocials.length > 0) {
            console.log(`[MeshSpider] Pump.fun returned ${pumpSocials.length} social URLs: ${pumpSocials.join(', ')}`);
            // Merge pump.fun URLs with DexScreener URLs (avoid duplicates)
            for (const url of pumpSocials) {
              if (!allSocialUrls.includes(url)) {
                allSocialUrls.push(url);
              }
            }
            if (allSocialUrls.length > 0 && discoverySource === 'dexscreener_auto' && pumpSocials.some(u => u.includes('/communities/'))) {
              discoverySource = 'pumpfun_metadata';
            }
          }
        }
      } catch (e) {
        console.warn('[MeshSpider] Pump.fun metadata fetch failed:', e);
      }

      // 3. Classify URLs properly — devs often put X community links in the telegram field
      // Re-classify any URL that contains x.com or twitter.com as an X URL, not telegram
      const xRelatedUrls = allSocialUrls.filter(u => 
        u.includes('x.com/') || u.includes('twitter.com/')
      );
      const telegramUrls = allSocialUrls.filter(u => 
        u.includes('t.me/') || u.includes('telegram.me/')
      );
      
      // Extract X Community URL from any source (including those misplaced in telegram field)
      communityUrl = allSocialUrls.find(u => u.includes('/communities/') && /communities\/\d+/.test(u)) || null;

      // 4. Extract X handles — support both profile URLs and status URLs
      const xUrls = allSocialUrls.filter(u =>
        (u.includes('x.com/') || u.includes('twitter.com/')) && !u.includes('/communities/')
      );
      
      for (const xUrl of xUrls) {
        // Match profile URL or extract handle from status URL (x.com/HANDLE/status/...)
        const handleMatch = xUrl.match(/(?:x\.com|twitter\.com)\/(@?([a-zA-Z0-9_]+))/i);
        if (handleMatch) {
          const handle = (handleMatch[2] || handleMatch[1]).replace(/^@/, '').toLowerCase();
          const reserved = ['i', 'intent', 'search', 'home', 'explore', 'hashtag', 'settings',
            'notifications', 'messages', 'compose', 'lists', 'bookmarks', 'communities',
            'spaces', 'tos', 'privacy', 'help', 'about', 'login', 'signup', 'share', 'status'];
          if (handle && !reserved.includes(handle) && handle.length <= 15) {
            console.log(`[MeshSpider] Found X handle: @${handle} (from ${discoverySource})`);
            await supabase.from('reputation_mesh').upsert({
              source_type: 'token',
              source_id: tokenMint,
              linked_type: 'x_account',
              linked_id: handle,
              relationship: 'social_account',
              confidence: 85,
              discovered_via: discoverySource,
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          }
        }
      }

      // 5. Process X Community if found
      if (communityUrl) {
        console.log(`[MeshSpider] Found X Community: ${communityUrl} (from ${discoverySource})`);
        const { data, error } = await supabase.functions.invoke('x-community-enricher', {
          body: {
            communityUrl,
            linkedTokenMint: tokenMint,
            linkedWallet: walletAddress,
          },
        });
        if (!error && data) {
          console.log(`[MeshSpider] Community enriched: ${data.admins?.length || 0} admins, ${data.moderators?.length || 0} mods`);
          const communityMatch = communityUrl.match(/communities\/(\d+)/);
          if (communityMatch && data.communityName) {
            await supabase.from('reputation_mesh')
              .update({ evidence: { community_name: data.communityName, source: 'x-community-enricher' } })
              .eq('linked_type', 'x_community')
              .eq('linked_id', communityMatch[1]);
          }
        }
      }

      // 5b. Telegram groups/channels — surface as nodes in the bubble map.
      // (Public metadata only; no MTProto join. Per user policy.)
      for (const tgUrl of telegramUrls) {
        const m = tgUrl.match(/t\.me\/(?:s\/)?([a-zA-Z0-9_+]+)/i);
        const handle = m?.[1]?.toLowerCase();
        if (!handle || handle === 'joinchat' || handle === 'addstickers') continue;
        try {
          await supabase.from('reputation_mesh').upsert({
            source_type: 'token',
            source_id: tokenMint,
            linked_type: 'telegram',
            linked_id: handle,
            relationship: 'social_account',
            confidence: 80,
            discovered_via: discoverySource,
            evidence: { url: tgUrl },
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          console.log(`[MeshSpider] Linked Telegram: t.me/${handle}`);
        } catch (e) {
          console.warn(`[MeshSpider] telegram upsert failed for ${handle}:`, e);
        }
      }

      // 5c. Websites — anything that isn't an X URL or a Telegram URL is a website.
      const websiteUrls = allSocialUrls.filter(u =>
        !u.includes('x.com/') && !u.includes('twitter.com/') &&
        !u.includes('t.me/') && !u.includes('telegram.me/')
      );
      for (const wUrl of websiteUrls) {
        let host: string | null = null;
        try { host = new URL(wUrl.startsWith('http') ? wUrl : `https://${wUrl}`).hostname.replace(/^www\./, ''); }
        catch { host = null; }
        if (!host) continue;
        try {
          await supabase.from('reputation_mesh').upsert({
            source_type: 'token',
            source_id: tokenMint,
            linked_type: 'website',
            linked_id: host,
            relationship: 'social_account',
            confidence: 75,
            discovered_via: discoverySource,
            evidence: { url: wUrl },
          }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          console.log(`[MeshSpider] Linked Website: ${host}`);
        } catch (e) {
          console.warn(`[MeshSpider] website upsert failed for ${host}:`, e);
        }
      }

      // Fire the canonical harvest function so the central token_social_links table stays in sync.
      // Fire-and-forget — don't block discovery.
      supabase.functions.invoke('harvest-token-socials', { body: { tokenMint } }).catch(() => {});

      // 6. FALLBACK: If no community URL found, scrape X profile(s) for pinned communities
      if (!communityUrl) {
        const discoveredHandles = xUrls
          .map(u => u.match(/(?:x\.com|twitter\.com)\/(@?([a-zA-Z0-9_]+))/i))
          .filter(Boolean)
          .map(m => (m![2] || m![1]).replace(/^@/, '').toLowerCase())
          .filter(h => {
            const reserved = ['i', 'intent', 'search', 'home', 'explore', 'hashtag', 'settings',
              'notifications', 'messages', 'compose', 'lists', 'bookmarks', 'communities',
              'spaces', 'tos', 'privacy', 'help', 'about', 'login', 'signup', 'share', 'status'];
            return h && !reserved.includes(h) && h.length <= 15;
          });

        for (const handle of discoveredHandles.slice(0, 2)) {
          try {
            console.log(`[MeshSpider] Resolving pinned community for @${handle} via Apify breadcrumb…`);
            // X.com blocks Firecrawl HTML scraping (returns empty links/markdown), so we use
            // the Apify-backed breadcrumb resolver: bio entities → pinned/recent tweets.
            const { data: pinnedData, error: pinnedError } = await supabase.functions.invoke('x-pinned-community-finder', {
              body: { handle },
            });

            if (pinnedError) {
              console.warn(`[MeshSpider] x-pinned-community-finder failed for @${handle}:`, pinnedError);
              continue;
            }

            const profileCommunityUrl: string | undefined = pinnedData?.communityUrl;
            if (profileCommunityUrl) {
              console.log(`[MeshSpider] 🎯 @${handle} pinned community resolved (source=${pinnedData?.source}): ${profileCommunityUrl}`);
            }

            if (profileCommunityUrl) {
              communityUrl = profileCommunityUrl;

              // Now enrich this community
              const { data: enrichData, error: enrichError } = await supabase.functions.invoke('x-community-enricher', {
                body: {
                  communityUrl: profileCommunityUrl,
                  linkedTokenMint: tokenMint,
                  linkedWallet: walletAddress,
                },
              });
              if (!enrichError && enrichData) {
                console.log(`[MeshSpider] Community enriched from breadcrumb: ${enrichData.admins?.length || 0} admins, ${enrichData.moderators?.length || 0} mods`);
                const cMatch = profileCommunityUrl.match(/communities\/(\d+)/);
                if (cMatch && enrichData.communityName) {
                  await supabase.from('reputation_mesh')
                    .update({ evidence: { community_name: enrichData.communityName, source: 'x-pinned-community-finder' } })
                    .eq('linked_type', 'x_community')
                    .eq('linked_id', cMatch[1]);
                }
              }
              break; // Found a community, stop checking other handles
            } else {
              console.log(`[MeshSpider] @${handle} has no pinned/bio community link`);
            }
          } catch (e) {
            console.warn(`[MeshSpider] Breadcrumb error for @${handle}:`, e);
          }
        }

        // 6b. Final fallback: if STILL no community URL, treat the X handle itself
        // as the de-facto community. Per user spec: "When an X Community Link leads
        // to only an X Account Profile and no pinned Community → the X Handle IS
        // the community", with confidence boosted when the handle resembles the
        // token symbol/name/CA prefix.
        if (!communityUrl && discoveredHandles.length > 0) {
          const handle = discoveredHandles[0];
          const h = handle.toLowerCase();
          const candidates = [tokenSymbol, tokenName, tokenMint?.slice(0, 6)]
            .filter(Boolean).map(s => (s as string).toLowerCase());
          const resembles = candidates.some(c => h.includes(c) || c.includes(h));
          const confidence = resembles ? 70 : 50;
          const syntheticId = `handle:${handle}`;
          try {
            // token → x_community (the handle, namespaced)
            await supabase.from('reputation_mesh').upsert({
              source_type: 'token',
              source_id: tokenMint,
              linked_type: 'x_community',
              linked_id: syntheticId,
              relationship: 'community_for',
              confidence,
              discovered_via: 'handle_as_community_fallback',
              evidence: { fallback: 'handle_as_community', handle, resembles_token: resembles },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
            // x_community → x_account (the handle is the sole admin)
            await supabase.from('reputation_mesh').upsert({
              source_type: 'x_community',
              source_id: syntheticId,
              linked_type: 'x_account',
              linked_id: handle,
              relationship: 'community_admin',
              confidence,
              discovered_via: 'handle_as_community_fallback',
              evidence: { fallback: 'handle_as_community', handle },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
            console.log(`[MeshSpider] 🪪 No pinned community — using @${handle} as de-facto community (confidence ${confidence}, resembles=${resembles})`);
          } catch (e) {
            console.warn('[MeshSpider] handle-as-community upsert failed:', e);
          }
        }
      }
    } catch (err) {
      console.warn('[MeshSpider] Community auto-discovery failed:', err);
    }
  }, []);

  // Trigger oracle spider for unknown entities
  const triggerSpider = useCallback(async (input: string, scanMode: 'deep' | 'quick' = 'deep') => {
    const trimmedInput = input.trim().replace(/^@/, '');
    
    // ═══ INPUT TYPE DETECTION — prevents sending wrong types to wrong APIs ═══
    // CRITICAL: Detect type BEFORE any case transformation — Solana addresses are case-sensitive Base58
    const isBase58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedInput);
    const isCommunityId = /^\d{10,25}$/.test(trimmedInput);
    const isCommunityUrl = trimmedInput.toLowerCase().includes('/communities/');
    const isUrl = trimmedInput.includes('://') || trimmedInput.includes('.com') || trimmedInput.includes('.io');
    const isXHandle = !isBase58 && !isCommunityId && !isCommunityUrl && !isUrl && trimmedInput.length < 30;
    
    // Only lowercase X handles — Solana addresses are case-sensitive Base58, lowercasing destroys them
    const normalizedInput = (isBase58 || isCommunityId || isCommunityUrl || isUrl)
      ? trimmedInput
      : trimmedInput.toLowerCase();
    
    // Community IDs and URLs should NOT be sent to oracle-unified-lookup (which calls Helius/Pump.fun)
    // They are handled by the reverse community lookup in the graph query
    if (isCommunityId || isCommunityUrl) {
      console.log(`[MeshSpider] Skipping external spider for community input: ${normalizedInput.slice(0, 20)}`);
      setSpiderStatus({
        active: false,
        stage: '',
        diagnostics: [
          `Input type: x_community`,
          '✅ Community data loaded from x_communities table',
          'No external API calls needed for community lookups',
        ],
        recommendation: 'Community data loaded from database.',
      });
      refetch();
      return;
    }
    
    const now = Date.now();

    // Cache-first: if mesh links already exist in DB, show them immediately and skip expensive spider
    const FRESH_CACHE_MS = 60 * 60 * 1000; // 1 hour — generous window, data rarely changes
    try {
      const [sourceLinksRes, linkedLinksRes] = await Promise.all([
        supabase
          .from('reputation_mesh')
          .select('id, discovered_at')
          .eq('source_id', normalizedInput)
          .order('discovered_at', { ascending: false })
          .limit(25),
        supabase
          .from('reputation_mesh')
          .select('id, discovered_at')
          .eq('linked_id', normalizedInput)
          .order('discovered_at', { ascending: false })
          .limit(25),
      ]);

      const merged = [...(sourceLinksRes.data || []), ...(linkedLinksRes.data || [])];
      const deduped = Array.from(new Map(merged.map((r: any) => [r.id, r])).values()) as Array<{ id: string; discovered_at: string | null }>;
      const latestDiscovery = deduped.reduce((latest, row) => {
        if (!row.discovered_at) return latest;
        const ts = new Date(row.discovered_at).getTime();
        return ts > latest ? ts : latest;
      }, 0);

      if (deduped.length > 0 && latestDiscovery > 0 && (now - latestDiscovery) < FRESH_CACHE_MS) {
        const ageSec = Math.max(1, Math.floor((now - latestDiscovery) / 1000));
        setSpiderStatus({
          active: false,
          stage: '',
          diagnostics: [
            `✅ Cache hit: ${deduped.length} mesh links already in DB`,
            `Newest link age: ${ageSec}s`,
            'Skipped external spider to avoid duplicate API credits',
          ],
          recommendation: 'Loaded from database cache.',
        });
        refetch();
        return;
      }
    } catch (cacheErr) {
      console.warn('[MeshSpider] Cache pre-check failed, continuing with spider:', cacheErr);
    }

    // Cooldown-based retry: 3 immediate attempts, then reset after 3 minutes
    const COOLDOWN_MS = 3 * 60 * 1000;
    const MAX_IMMEDIATE = 3;
    const record = spiderAttemptsRef.current.get(normalizedInput);

    if (record) {
      const timeSince = now - record.lastAttempt;
      if (timeSince > COOLDOWN_MS) {
        // Reset after cooldown
        spiderAttemptsRef.current.set(normalizedInput, { count: 1, lastAttempt: now });
      } else if (record.count >= MAX_IMMEDIATE) {
        const remainingMin = Math.ceil((COOLDOWN_MS - timeSince) / 60000);
        console.log(`[MeshSpider] Cooldown active for ${normalizedInput}, ${remainingMin}min remaining`);
        // Even during cooldown, always try to refetch — data may exist from a manual spider
        refetch();
        setSpiderStatus({
          active: false,
          stage: '',
          error: `Spider cooling down (${record.count} attempts). Retry in ~${remainingMin} min. Showing any cached data.`,
          diagnostics: ['Cooldown-based retry active', `${record.count} attempts made`, `Resets in ~${remainingMin} minutes`, '🔄 Refetching cached mesh data...'],
        });
        return;
      } else {
        spiderAttemptsRef.current.set(normalizedInput, { count: record.count + 1, lastAttempt: now });
      }
    } else {
      spiderAttemptsRef.current.set(normalizedInput, { count: 1, lastAttempt: now });
    }

    setSpiderStatus({ active: true, stage: '🕷️ Initializing spider scan...' });
    console.log('[MeshSpider] Starting spider:', { input: normalizedInput.slice(0, 16), scanMode });

    try {
      setSpiderStatus({ active: true, stage: '🔍 Resolving entity type & wallet...' });

      const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
        body: { input: normalizedInput, scanMode },
      });

      if (error) {
        console.error('[MeshSpider] Edge function error:', error);
        throw error;
      }
      
      console.log('[MeshSpider] Spider result:', { 
        inputType: data?.inputType, 
        found: data?.found,
        meshLinksAdded: data?.meshLinksAdded, 
        requiresScan: data?.requiresScan,
        apiErrors: data?.apiErrors,
        resolvedWallet: data?.resolvedWallet?.slice(0, 12),
      });

      const result = data as any;
      
      // Build diagnostics — framed as a discovery feed, never as a failure log.
      // Every line should feel like a clue or a next lead, not an error.
      const diagnostics: string[] = [];
      const typeLabel = result.inputType === 'token' ? '🪙 Token contract'
        : result.inputType === 'wallet' ? '👛 Wallet address'
        : result.inputType === 'x_handle' ? '🐦 X handle'
        : result.inputType ? `🔎 ${result.inputType}` : null;
      if (typeLabel) diagnostics.push(`Identified: ${typeLabel}`);
      if (result.resolvedWallet) {
        diagnostics.push(`🎯 Locked onto wallet ${result.resolvedWallet.slice(0, 12)}…`);
      }
      if (result.liveAnalysis) {
        diagnostics.push(`🧪 Live read: ${result.liveAnalysis.tokensAnalyzed} tokens scanned · pattern ${result.liveAnalysis.pattern}`);
      }
      if (result.stats) {
        const s = result.stats;
        const parts = [`${s.totalTokens} tokens launched`];
        if (s.successfulTokens) parts.push(`${s.successfulTokens} hit`);
        if (s.rugPulls) parts.push(`${s.rugPulls} rugged`);
        diagnostics.push(`📊 Track record: ${parts.join(' · ')}`);
      }
      // API errors become "next lead" hints — we never show red failure noise to the user.
      if (result.apiErrors && result.apiErrors.length > 0) {
        diagnostics.push(`🔄 Switching providers — chasing the next lead…`);
      }
      if ((result.meshLinksAdded || 0) > 0) {
        diagnostics.push(`🕸️ ${result.meshLinksAdded} new mesh connections uncovered`);
      }

      const hasUsefulData = (result.meshLinksAdded || 0) > 0 || result.found;

      // ═══ REGISTER X HANDLE ON EMPTY SEARCH ═══
      // If searching an X handle and nothing found, register it in x_account_registry
      // so future community scrapes can cross-link this handle
      if (isXHandle && !hasUsefulData) {
        try {
          const cleanHandle = normalizedInput.replace(/^@/, '').toLowerCase();
          const now_ts = new Date().toISOString();
          await supabase.from('x_account_registry').upsert({
            x_user_id: `pending_${cleanHandle}`, // Placeholder until X API resolves real ID
            current_handle: cleanHandle,
            display_name: cleanHandle,
            is_verified: false,
            handle_history: [],
            name_history: [],
            linked_token_count: 0,
            first_seen_at: now_ts,
            last_seen_at: now_ts,
          }, { onConflict: 'current_handle', ignoreDuplicates: true });
          diagnostics.push(`📝 Filed @${cleanHandle} into the watchlist — we'll cross-link it on the next sweep.`);
          console.log(`[MeshSpider] Registered X handle @${cleanHandle} in registry`);
        } catch (regErr) {
          console.warn('[MeshSpider] Handle registration failed:', regErr);
        }
      }

      if (!hasUsefulData && result.requiresScan) {
        // ═══ FOLLOW THE MONEY FALLBACK ═══
        // Oracle didn't find pre-indexed data. Instead of dead-ending,
        // try direct funding chain trace + community discovery.
        const isBase58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalizedInput);
        const walletToTrace = result.resolvedWallet || (isBase58 ? normalizedInput : null);
        
        if (walletToTrace) {
          diagnostics.push('💰 Following the money — tracing the funding chain…');
          setSpiderStatus({
            active: true,
            stage: '💰 Following the money — tracing funding chain...',
            diagnostics,
          });

          try {
            // 1. Trace funding chain (follow the money)
            const { data: kycData, error: kycErr } = await supabase.functions.invoke('mesh-kyc-deep-search', {
              body: { walletAddress: walletToTrace, maxDepth: 5 },
            });
            
            if (!kycErr && kycData) {
              const chainLen = kycData.chain?.length || 0;
              const walletsTraced = kycData.walletsTraced || 0;
              diagnostics.push(`🔗 Funding chain mapped: ${chainLen} hops · ${walletsTraced} wallets`);
              if (kycData.kycRoot) {
                diagnostics.push(`🏦 KYC root surfaced: ${kycData.kycRoot.slice(0, 16)}…`);
              }
            } else {
              diagnostics.push(`🛰️ Trail goes cold here — try “Find KYC Root” for a deeper sweep.`);
            }
          } catch {
            diagnostics.push(`🛰️ Trail goes cold here — try “Find KYC Root” for a deeper sweep.`);
          }

          try {
            // 2. Community discovery
            if (isBase58) {
              await autoDiscoverCommunity(normalizedInput, walletToTrace);
              diagnostics.push('🏠 Sweeping for X Community fingerprints…');
            }
          } catch (e) {
            console.warn('[MeshSpider] Fallback community discovery failed:', e);
          }

          // 3. Refetch — the funding trace should have added mesh links
          await new Promise(r => setTimeout(r, 1000));
          refetch();

          // Check if we now have data
          const { data: checkLinks } = await supabase
            .from('reputation_mesh')
            .select('id')
            .or(`source_id.eq.${normalizedInput},linked_id.eq.${normalizedInput}`)
            .limit(5);

          if (checkLinks && checkLinks.length > 0) {
            diagnostics.push(`💡 Follow-the-money paid off — ${checkLinks.length} fresh leads added!`);
            setSpiderStatus({
              active: false,
              stage: '',
              meshLinksAdded: checkLinks.length,
              diagnostics,
              recommendation: 'Data discovered via funding chain trace.',
            });
          } else {
            // Also check by resolved wallet
            const { data: walletLinks } = await supabase
              .from('reputation_mesh')
              .select('id')
              .or(`source_id.eq.${walletToTrace},linked_id.eq.${walletToTrace}`)
              .limit(5);

            if (walletLinks && walletLinks.length > 0) {
              // Data exists under the resolved wallet — focus on that instead
              diagnostics.push(`🎯 Pivoted to resolved wallet — ${walletLinks.length} connections found.`);
              setSpiderStatus({
                active: false,
                stage: '',
                meshLinksAdded: walletLinks.length,
                diagnostics,
                recommendation: 'Data discovered via resolved wallet.',
              });
            } else {
              setSpiderStatus({
                active: false,
                stage: '',
                error: 'No funding chain or mesh data found after full trace.',
                diagnostics,
              });
            }
          }
        } else {
          setSpiderStatus({
            active: false,
            stage: '',
            error: `No data found. External APIs returned errors. ${result.recommendation || ''}`,
            diagnostics,
          });
        }
      } else {
        setSpiderStatus({
          active: true,
          stage: `✅ Spider complete — ${result.meshLinksAdded || 0} mesh links discovered. 🔍 Looking for X Community...`,
          inputType: result.inputType,
          meshLinksAdded: result.meshLinksAdded || 0,
          score: result.score,
          trafficLight: result.trafficLight,
          recommendation: result.recommendation,
          diagnostics,
        });

        // ═══ AUTO-DISCOVER X COMMUNITY ═══
        const isBase58Check = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalizedInput);
        if (isBase58Check) {
          const tokensToCheck = new Set<string>();
          tokensToCheck.add(normalizedInput);
          
          if (result.tokenHistory) {
            for (const t of result.tokenHistory.slice(0, 5)) {
              if (t.mint) tokensToCheck.add(t.mint);
            }
          }
          if (result.network?.relatedTokens) {
            for (const t of result.network.relatedTokens.slice(0, 5)) {
              tokensToCheck.add(t);
            }
          }

          const communityPromises = [...tokensToCheck].slice(0, 5).map(mint => 
            autoDiscoverCommunity(mint, result.resolvedWallet)
          );
          await Promise.allSettled(communityPromises);
          diagnostics.push(`🏠 Scanning ${tokensToCheck.size} token${tokensToCheck.size === 1 ? '' : 's'} for X Community fingerprints…`);
        }

        // ═══ FOLLOW THE MONEY (even on success) ═══
        // If we got the token but no funding chain yet, trace it
        const walletForChain = result.resolvedWallet;
        if (walletForChain && isBase58Check) {
          try {
          diagnostics.push('💰 Following the money — tracing the funding chain…');
            setSpiderStatus(prev => ({ ...prev, stage: '💰 Following the money...' }));
            const { data: kycData } = await supabase.functions.invoke('mesh-kyc-deep-search', {
              body: { walletAddress: walletForChain, maxDepth: 5 },
            });
            if (kycData?.kycRoot) {
              diagnostics.push(`🏦 KYC root surfaced: ${kycData.kycRoot.slice(0, 16)}…`);
            }
            if (kycData?.chain?.length) {
              diagnostics.push(`🔗 ${kycData.chain.length} funding hops mapped`);
            }
          } catch (e) {
            console.warn('[MeshSpider] Follow-the-money trace failed:', e);
          }
        }

        // Refresh mesh graph after all discovery
        setTimeout(() => {
          refetch();
          setTimeout(() => {
            setSpiderStatus(prev => ({ ...prev, active: false }));
          }, 3000);
        }, 500);
      }

    } catch (err: any) {
      console.error('[MeshSpider] Error:', err);
      
      // ═══ LAST RESORT: even on total failure, try funding trace ═══
      const isBase58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.trim());
      if (isBase58) {
        try {
          setSpiderStatus({ active: true, stage: '💰 Oracle failed — following the money directly...' });
          const { data: kycData } = await supabase.functions.invoke('mesh-kyc-deep-search', {
            body: { walletAddress: input.trim(), maxDepth: 4 },
          });
          if (kycData?.walletsTraced > 0) {
            setTimeout(() => refetch(), 1000);
            setSpiderStatus({
              active: false,
              stage: '',
              meshLinksAdded: kycData.walletsTraced,
              diagnostics: [`💰 Fallback trace: ${kycData.walletsTraced} wallets mapped`],
              recommendation: 'Data recovered via direct funding trace.',
            });
            return;
          }
        } catch (fallbackErr) {
          console.error('[MeshSpider] Fallback trace also failed:', fallbackErr);
        }
      }
      
      setSpiderStatus({
        active: false,
        stage: '',
        error: err.message || 'Spider scan failed',
        diagnostics: [`Exception: ${err.message}`],
      });
    }
  }, [refetch, autoDiscoverCommunity]);

  const focusOnEntity = useCallback((id: string, type: string) => {
    setFocusedEntity({ id, type });
    setExpandedEntities(new Set([id]));
    setSpiderStatus({ active: false, stage: '' }); // Clear previous errors
  }, []);

  const expandEntity = useCallback((id: string) => {
    setExpandedEntities(prev => new Set([...prev, id]));
  }, []);

  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setFocusedEntity(null);
    setExpandedEntities(new Set());
    setSpiderStatus({ active: false, stage: '' });
    reverseCommunityLookupDone.current.clear();
    spiderAttemptsRef.current.clear();
  }, []);

  const clearCooldown = useCallback((input?: string) => {
    if (input) {
      spiderAttemptsRef.current.delete(input.trim().toLowerCase());
    } else {
      spiderAttemptsRef.current.clear();
    }
  }, []);

  // ═══ ENRICH TOKEN TICKERS + COMMUNITY NAMES + TELEGRAM CHANNELS + X USERS ═══
  const [enrichedGraphData, setEnrichedGraphData] = useState<MeshGraphData>({ nodes: [], links: [] });
  const tickerCacheRef = useRef<Map<string, string>>(new Map());
  const commNameCacheRef = useRef<Map<string, string>>(new Map());
  const tgChannelCacheRef = useRef<Map<string, { title: string; isRecycled: boolean; tokenCount: number }>>(new Map());
  const xUserCacheRef = useRef<Map<string, { handle: string; displayName: string; isRotated: boolean; handleCount: number }>>(new Map());
  
  useEffect(() => {
    if (!graphData) {
      setEnrichedGraphData({ nodes: [], links: [] });
      return;
    }
    
    const tokenNodes = graphData.nodes.filter(n => 
      n.type === 'token' && (n.label.includes('…') || n.label === `$${n.fullId}`)
    );
    
    // Find x_community nodes showing numeric IDs (not yet enriched with names)
    const communityNodes = graphData.nodes.filter(n =>
      n.type === 'x_community' && /^\d+$/.test(n.fullId) && !commNameCacheRef.current.has(n.fullId)
    );
    
    // Find telegram_channel nodes not yet enriched
    const tgChannelNodes = graphData.nodes.filter(n =>
      n.type === 'telegram_channel' && !tgChannelCacheRef.current.has(n.fullId)
    );
    
    // Find x_user nodes not yet enriched
    const xUserNodes = graphData.nodes.filter(n =>
      n.type === 'x_user' && !xUserCacheRef.current.has(n.fullId)
    );
    
    if (tokenNodes.length === 0 && communityNodes.length === 0 && tgChannelNodes.length === 0 && xUserNodes.length === 0) {
      setEnrichedGraphData(applyEnrichmentCaches(graphData, tickerCacheRef.current, commNameCacheRef.current, tgChannelCacheRef.current, xUserCacheRef.current));
      return;
    }

    // Set current data immediately, enrich async
    setEnrichedGraphData(applyEnrichmentCaches(graphData, tickerCacheRef.current, commNameCacheRef.current, tgChannelCacheRef.current, xUserCacheRef.current));

    const enrichAll = async () => {
      // ── Ticker enrichment ──
      const uncachedMints = tokenNodes
        .map(n => n.fullId)
        .filter(mint => !tickerCacheRef.current.has(mint));

      if (uncachedMints.length > 0) {
        try {
          for (let i = 0; i < uncachedMints.length; i += 30) {
            const batch = uncachedMints.slice(i, i + 30);
            const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`);
            if (!res.ok) continue;
            const pairs = await res.json();
            if (!Array.isArray(pairs)) continue;
            const seen = new Set<string>();
            for (const pair of pairs) {
              const addr = pair.baseToken?.address;
              const symbol = pair.baseToken?.symbol;
              if (addr && symbol && !seen.has(addr)) {
                seen.add(addr);
                tickerCacheRef.current.set(addr, symbol);
              }
            }
          }
          for (const mint of uncachedMints) {
            if (!tickerCacheRef.current.has(mint)) {
              tickerCacheRef.current.set(mint, '');
            }
          }
        } catch (err) {
          console.warn('[MeshGraph] Ticker enrichment failed:', err);
        }
      }

      // ── Community name enrichment ──
      if (communityNodes.length > 0) {
        try {
          const communityIds = communityNodes.map(n => n.fullId);
          const { data: communities } = await supabase
            .from('x_communities')
            .select('community_id, name')
            .in('community_id', communityIds);
          
          if (communities) {
            for (const comm of communities) {
              if (comm.name) {
                commNameCacheRef.current.set(comm.community_id, comm.name);
              }
            }
          }

          for (const cNode of communityNodes) {
            if (commNameCacheRef.current.has(cNode.fullId)) continue;
            const { data: meshLinks } = await supabase
              .from('reputation_mesh')
              .select('evidence')
              .or(`source_id.eq.${cNode.fullId},linked_id.eq.${cNode.fullId}`)
              .not('evidence', 'is', null)
              .limit(5);
            
            if (meshLinks) {
              for (const link of meshLinks) {
                const ev = link.evidence as any;
                const name = ev?.community_name || ev?.name || ev?.title;
                if (name && typeof name === 'string') {
                  commNameCacheRef.current.set(cNode.fullId, name);
                  break;
                }
              }
            }
          }

          for (const id of communityIds) {
            if (!commNameCacheRef.current.has(id)) {
              commNameCacheRef.current.set(id, '');
            }
          }
        } catch (err) {
          console.warn('[MeshGraph] Community name enrichment failed:', err);
        }
      }

      // ── Telegram channel name enrichment ──
      if (tgChannelNodes.length > 0) {
        try {
          const channelIds = tgChannelNodes.map(n => n.fullId);
          const { data: channels } = await supabase
            .from('telegram_channel_registry')
            .select('channel_id, current_title, linked_token_count')
            .in('channel_id', channelIds);
          
          if (channels) {
            for (const ch of channels) {
              tgChannelCacheRef.current.set(ch.channel_id, {
                title: ch.current_title || ch.channel_id,
                isRecycled: (ch.linked_token_count || 0) > 1,
                tokenCount: ch.linked_token_count || 0,
              });
            }
          }

          // Also check mesh evidence for channel_title
          for (const tgNode of tgChannelNodes) {
            if (tgChannelCacheRef.current.has(tgNode.fullId)) continue;
            const { data: meshLinks } = await supabase
              .from('reputation_mesh')
              .select('evidence')
              .or(`source_id.eq.${tgNode.fullId},linked_id.eq.${tgNode.fullId}`)
              .not('evidence', 'is', null)
              .limit(5);
            
            if (meshLinks) {
              for (const link of meshLinks) {
                const ev = link.evidence as any;
                const title = ev?.channel_title || ev?.title || ev?.name;
                if (title && typeof title === 'string') {
                  tgChannelCacheRef.current.set(tgNode.fullId, {
                    title,
                    isRecycled: ev?.is_recycled === true || (ev?.linked_token_count || 0) > 1,
                    tokenCount: ev?.linked_token_count || 0,
                  });
                  break;
                }
              }
            }
          }

          // Mark unfound channels
          for (const id of channelIds) {
            if (!tgChannelCacheRef.current.has(id)) {
              tgChannelCacheRef.current.set(id, { title: '', isRecycled: false, tokenCount: 0 });
            }
          }
        } catch (err) {
          console.warn('[MeshGraph] Telegram channel enrichment failed:', err);
        }
      }

      // ── X User enrichment ──
      if (xUserNodes.length > 0) {
        try {
          const userIds = xUserNodes.map(n => n.fullId);
          const { data: xUsers } = await supabase
            .from('x_account_registry')
            .select('x_user_id, current_handle, display_name, handle_history, linked_token_count')
            .in('x_user_id', userIds);
          
          if (xUsers) {
            for (const xu of xUsers) {
              const history = Array.isArray(xu.handle_history) ? xu.handle_history : [];
              xUserCacheRef.current.set(xu.x_user_id, {
                handle: xu.current_handle || xu.x_user_id,
                displayName: xu.display_name || xu.current_handle || xu.x_user_id,
                isRotated: history.length > 0,
                handleCount: history.length + 1,
              });
            }
          }

          // Also check mesh evidence for display_name
          for (const xNode of xUserNodes) {
            if (xUserCacheRef.current.has(xNode.fullId)) continue;
            const { data: meshLinks } = await supabase
              .from('reputation_mesh')
              .select('evidence')
              .or(`source_id.eq.${xNode.fullId},linked_id.eq.${xNode.fullId}`)
              .not('evidence', 'is', null)
              .limit(5);
            
            if (meshLinks) {
              for (const link of meshLinks) {
                const ev = link.evidence as any;
                const handle = ev?.resolved_handle || ev?.handle;
                if (handle && typeof handle === 'string') {
                  xUserCacheRef.current.set(xNode.fullId, {
                    handle,
                    displayName: ev?.display_name || handle,
                    isRotated: ev?.is_rotated === true || (ev?.handle_count || 0) > 1,
                    handleCount: ev?.handle_count || 1,
                  });
                  break;
                }
              }
            }
          }

          for (const id of userIds) {
            if (!xUserCacheRef.current.has(id)) {
              xUserCacheRef.current.set(id, { handle: '', displayName: '', isRotated: false, handleCount: 0 });
            }
          }
        } catch (err) {
          console.warn('[MeshGraph] X User enrichment failed:', err);
        }
      }

      setEnrichedGraphData(prev => applyEnrichmentCaches(prev, tickerCacheRef.current, commNameCacheRef.current, tgChannelCacheRef.current, xUserCacheRef.current));
    };
    
    enrichAll();
  }, [graphData]);

  return {
    graphData: enrichedGraphData,
    isLoading,
    refetch,
    focusedEntity,
    focusOnEntity,
    expandEntity,
    resetView,
    clearCooldown,
    typeFilters,
    toggleTypeFilter,
    setTypeFilters,
    spiderStatus,
    triggerSpider,
    autoDiscoverCommunity,
  };
}

function applyEnrichmentCaches(
  data: MeshGraphData, 
  tickerCache: Map<string, string>,
  commNameCache: Map<string, string>,
  tgChannelCache?: Map<string, { title: string; isRecycled: boolean; tokenCount: number }>,
  xUserCache?: Map<string, { handle: string; displayName: string; isRotated: boolean; handleCount: number }>,
): MeshGraphData {
  const updatedNodes = data.nodes.map(node => {
    const flags: RedFlag[] = [...(node.redFlags || [])];
    
    if (node.type === 'token') {
      const ticker = tickerCache.get(node.fullId);
      if (ticker) return { ...node, label: `$${ticker.toUpperCase()}`, redFlags: flags.length > 0 ? flags : undefined };
    }
    if (node.type === 'x_community') {
      const name = commNameCache.get(node.fullId);
      if (name) return { ...node, label: name.length > 18 ? name.slice(0, 16) + '…' : name, redFlags: flags.length > 0 ? flags : undefined };
    }
    if (node.type === 'telegram_channel' && tgChannelCache) {
      const info = tgChannelCache.get(node.fullId);
      if (info && info.title) {
        const prefix = info.isRecycled ? '♻️ ' : '📡 ';
        const suffix = info.isRecycled ? ` (${info.tokenCount})` : '';
        const label = info.title.length > 14 ? info.title.slice(0, 12) + '…' : info.title;
        
        // RED FLAG: Recycled Telegram channel
        if (info.isRecycled && info.tokenCount > 1) {
          flags.push({
            type: 'recycled_identity',
            severity: info.tokenCount >= 3 ? 'critical' : 'high',
            shortLabel: `♻️ Recycled TG (${info.tokenCount} tokens)`,
            explanation: `This Telegram channel has been reused across ${info.tokenCount} different token launches. Recycled channels are a hallmark of serial scam operations — the operator deletes old messages, renames the group, and reuses the existing member base to create fake "organic" community traction for the next rug pull. The same admin network likely controls all linked tokens.`,
          });
        }
        
        return { ...node, label: `${prefix}${label}${suffix}`, redFlags: flags.length > 0 ? flags : undefined };
      }
    }
    if (node.type === 'x_user' && xUserCache) {
      const info = xUserCache.get(node.fullId);
      if (info && info.handle) {
        const prefix = info.isRotated ? '🔄 ' : '🐦 ';
        const suffix = info.isRotated ? ` (${info.handleCount} handles)` : '';
        
        // RED FLAG: Rotated X handle
        if (info.isRotated && info.handleCount > 1) {
          flags.push({
            type: 'rotated_handle',
            severity: info.handleCount >= 3 ? 'critical' : 'high',
            shortLabel: `🔄 ${info.handleCount} Handle Changes`,
            explanation: `This X account has changed its handle ${info.handleCount} times. Serial handle rotation is used to shed association with previous failed/rugged token launches. ${info.handleCount >= 3 ? 'This level of rotation is a STRONG indicator of a serial scam operator who cycles identities to avoid detection. ' : ''}Check the linked communities and token history — this account likely promoted multiple tokens that ended in rug pulls, slow drains, or abandonment.`,
          });
        }
        
        return { ...node, label: `${prefix}@${info.handle}${suffix}`, redFlags: flags.length > 0 ? flags : undefined };
      }
    }
    return { ...node, redFlags: flags.length > 0 ? flags : undefined };
  });
  return { nodes: updatedNodes, links: data.links };
}

function buildGraph(meshLinks: any[], typeFilters: Set<string>): MeshGraphData {
  const nodesMap = new Map<string, MeshNode>();
  const links: MeshLink[] = [];

  for (const link of meshLinks) {
    // ═══ MINT-AS-WALLET GUARD ═══
    // Some upstream writers (KYC same_kyc_root, etc.) emit mint addresses under
    // linked_type='wallet'. Pump.fun mints end in `pump`, letsbonk mints in `bonk`.
    // Reclassify them as 'token' so we don't render the same address twice
    // (once as a gold token bubble, once as a green wallet bubble).
    const isMintAddr = (id: string) =>
      typeof id === 'string' && (id.endsWith('pump') || id.endsWith('bonk'));
    if (link.source_type === 'wallet' && isMintAddr(link.source_id)) {
      link.source_type = 'token';
    }
    if (link.linked_type === 'wallet' && isMintAddr(link.linked_id)) {
      link.linked_type = 'token';
    }

    const sourceKey = `${link.source_type}:${link.source_id}`;
    const targetKey = `${link.linked_type}:${link.linked_id}`;

    if (!typeFilters.has(link.source_type) || !typeFilters.has(link.linked_type)) continue;

    // ═══ STRICT TOPOLOGY RULES ═══
    // Token gets: 1 Dev Wallet, 1 X Community, 1 Website
    // X Community gets: X Handles (admin_of, mod_of, co_mod)
    // Dev Wallet gets: linked wallets, KYC Root
    // NEVER: token↔x_account, wallet↔x_community, x_community↔wallet
    
    const st = link.source_type;
    const lt = link.linked_type;

    // Block direct token↔x_account (must go through x_community)
    if ((st === 'token' && lt === 'x_account') || (st === 'x_account' && lt === 'token')) continue;

    // Block wallet↔x_community links (wallets stay on wallet side, community stays on token side)
    if ((st === 'wallet' && lt === 'x_community') || (st === 'x_community' && lt === 'wallet')) continue;
    if ((st === 'kyc_root' && lt === 'x_community') || (st === 'x_community' && lt === 'kyc_root')) continue;

    // Block x_account↔wallet links (handles only attach to x_community)
    if ((st === 'x_account' && lt === 'wallet') || (st === 'wallet' && lt === 'x_account')) continue;
    if ((st === 'x_account' && lt === 'kyc_root') || (st === 'kyc_root' && lt === 'x_account')) continue;

    // Block direct token↔kyc_root (KYC must connect through wallet chain only)
    if ((st === 'token' && lt === 'kyc_root') || (st === 'kyc_root' && lt === 'token')) continue;

    // Extract evidence for friendly labels
    const evidence = link.evidence && typeof link.evidence === 'object' ? link.evidence : {};

    if (!nodesMap.has(sourceKey)) {
      nodesMap.set(sourceKey, {
        id: sourceKey,
        fullId: link.source_id,
        type: link.source_type,
        label: getNodeLabel(link.source_id, link.source_type, evidence),
        val: 1,
      });
    } else {
      // Update label if new evidence provides a better one
      const existing = nodesMap.get(sourceKey)!;
      existing.val += 0.3;
      const betterLabel = getNodeLabel(link.source_id, link.source_type, evidence);
      if (betterLabel.length > 2 && !betterLabel.includes('…') && existing.label.includes('…')) {
        existing.label = betterLabel;
      }
    }

    if (!nodesMap.has(targetKey)) {
      nodesMap.set(targetKey, {
        id: targetKey,
        fullId: link.linked_id,
        type: link.linked_type,
        label: getNodeLabel(link.linked_id, link.linked_type, evidence),
        val: 1,
      });
    } else {
      const existing = nodesMap.get(targetKey)!;
      existing.val += 0.3;
      const betterLabel = getNodeLabel(link.linked_id, link.linked_type, evidence);
      if (betterLabel.length > 2 && !betterLabel.includes('…') && existing.label.includes('…')) {
        existing.label = betterLabel;
      }
    }

    links.push({
      source: sourceKey,
      target: targetKey,
      relationship: link.relationship,
      confidence: link.confidence || 50,
    });

    // Track admin/mod role and display name on x_account nodes
    if (link.linked_type === 'x_account') {
      const node = nodesMap.get(targetKey);
      if (node) {
        if (link.relationship === 'admin_of') node.role = 'admin';
        if (link.relationship === 'mod_of' && node.role !== 'admin') node.role = 'mod';
        if (link.relationship === 'community_admin') node.role = 'admin';
        if (link.relationship === 'community_mod' && node.role !== 'admin') node.role = 'mod';
        // Capture display name from evidence
        const dn = evidence?.display_name || evidence?.name;
        if (dn && !node.displayName) node.displayName = dn;
      }
    }
    if (link.source_type === 'x_account') {
      const node = nodesMap.get(sourceKey);
      if (node) {
        if (link.relationship === 'admin_of') node.role = 'admin';
        if (link.relationship === 'mod_of' && node.role !== 'admin') node.role = 'mod';
        if (link.relationship === 'community_admin') node.role = 'admin';
        if (link.relationship === 'community_mod' && node.role !== 'admin') node.role = 'mod';
        const dn = evidence?.display_name || evidence?.name;
        if (dn && !node.displayName) node.displayName = dn;
      }
    }

    // Mark dev wallets (wallets that created a token)
    if (['created', 'created_by'].includes(link.relationship)) {
      if (link.source_type === 'wallet') {
        const node = nodesMap.get(sourceKey);
        if (node) node.isDev = true;
      }
      if (link.linked_type === 'wallet') {
        const node = nodesMap.get(targetKey);
        if (node) node.isDev = true;
      }
    }
  }

  // Prune orphan nodes (no links after filtering)
  const connectedIds = new Set<string>();
  for (const l of links) {
    connectedIds.add(l.source);
    connectedIds.add(l.target);
  }

  const connectedNodes = Array.from(nodesMap.values()).filter(n => connectedIds.has(n.id));

  // ═══ UNLINKED CLUSTER DETECTION ═══
  // Find wallet nodes that are 3+ hops from any KYC root
  // These are potential bundled/sockpuppet wallets
  const kycRootIds = new Set(connectedNodes.filter(n => n.type === 'kyc_root').map(n => n.id));
  
  if (kycRootIds.size > 0) {
    // BFS from all KYC roots to find distance to each wallet
    const adjacency = new Map<string, Set<string>>();
    for (const l of links) {
      if (!adjacency.has(l.source)) adjacency.set(l.source, new Set());
      if (!adjacency.has(l.target)) adjacency.set(l.target, new Set());
      adjacency.get(l.source)!.add(l.target);
      adjacency.get(l.target)!.add(l.source);
    }

    const distFromKyc = new Map<string, number>();
    const queue: [string, number][] = [];
    for (const kycId of kycRootIds) {
      distFromKyc.set(kycId, 0);
      queue.push([kycId, 0]);
    }
    while (queue.length > 0) {
      const [nodeId, dist] = queue.shift()!;
      const neighbors = adjacency.get(nodeId);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (!distFromKyc.has(neighbor)) {
          distFromKyc.set(neighbor, dist + 1);
          queue.push([neighbor, dist + 1]);
        }
      }
    }

    // Flag wallet nodes 3+ hops away or completely disconnected from KYC
    for (const node of connectedNodes) {
      if (node.type !== 'wallet') continue;
      const dist = distFromKyc.get(node.id);
      if (dist === undefined || dist >= 3) {
        if (!node.redFlags) node.redFlags = [];
        node.redFlags.push({
          type: 'unlinked_cluster',
          severity: dist === undefined ? 'critical' : 'high',
          shortLabel: dist === undefined ? '🚩 No KYC Link' : `🚩 ${dist} Hops from KYC`,
          explanation: `This wallet is ${dist === undefined ? 'completely disconnected from' : `${dist} steps away from`} the developer's KYC root wallet. What this likely means:\n\n• Sybil/Sockpuppet Wallets — Controlled by the same person but deliberately isolated from the KYC chain to hide supply concentration.\n• Bundled Insider Wallets — Pre-funded wallets used to fake early trading volume, create artificial price action, or accumulate supply before a coordinated dump.\n• Exit Liquidity Network — A hidden whale setup where the dev controls far more supply than appears on-chain, staged for extraction.\n\nThese wallets share funding paths or timing patterns but have been deliberately distanced from the dev's identity chain. This is a common pattern in rug pull and slow drain operations.`,
        });
      }
    }
  }

  // ── Circular Funding Detection ──
  // Detect wallet pairs that fund each other (A→B and B→A)
  const fundingRelTypes = new Set(['directly_funded', 'funded_by', 'indirectly_funded']);
  const fundingEdges = new Map<string, Set<string>>(); // source → Set<target>
  
  for (const link of links) {
    if (fundingRelTypes.has(link.relationship || '')) {
      const src = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
      const tgt = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
      if (src && tgt) {
        if (!fundingEdges.has(src)) fundingEdges.set(src, new Set());
        fundingEdges.get(src)!.add(tgt);
      }
    }
  }

  // Find bidirectional funding (A funds B AND B funds A)
  const circularPairs = new Set<string>();
  for (const [src, targets] of fundingEdges) {
    for (const tgt of targets) {
      if (fundingEdges.get(tgt)?.has(src) && !circularPairs.has(`${tgt}-${src}`)) {
        circularPairs.add(`${src}-${tgt}`);
        // Flag both wallets
        for (const node of connectedNodes) {
          if (node.id === src || node.id === tgt) {
            if (!node.redFlags) node.redFlags = [];
            if (!node.redFlags.some(f => f.type === 'circular_funding')) {
              const otherWallet = node.id === src ? tgt : src;
              node.redFlags.push({
                type: 'circular_funding',
                severity: 'critical',
                shortLabel: '🔄 Circular Funding Loop',
                explanation: `This wallet is part of a circular funding loop — it both sends to AND receives funds from ${otherWallet.slice(0, 8)}…${otherWallet.slice(-4)}. This is a CRITICAL red flag:\n\n• Wash Infrastructure — Two wallets repeatedly funding each other to obscure the true origin of funds and create the illusion of independent activity.\n• Sybil Network — Fake identities recycling SOL between each other to simulate organic wallet creation.\n• Long-Running Operator — Circular funding loops are often maintained for months or years, used as launchpad infrastructure for serial token deployments.\n\nThis pattern is almost never legitimate. The operator behind these wallets is deliberately hiding their funding trail.`,
              });
            }
          }
        }
      }
    }
  }

  return {
    nodes: connectedNodes,
    links,
  };
}
