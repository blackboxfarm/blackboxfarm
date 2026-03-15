import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RedFlag {
  type: 'unlinked_cluster' | 'recycled_identity' | 'rotated_handle';
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

  const { data: graphData, isLoading, refetch } = useQuery({
    queryKey: ['mesh-graph', uniqueIds.sort().join(','), [...typeFilters].sort().join(',')],
    queryFn: async (): Promise<MeshGraphData> => {
      if (uniqueIds.length === 0) {
        return { nodes: [], links: [] };
      }

      const allLinks: any[] = [];
      
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

      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      if (!dexRes.ok) return;
      const dexData = await dexRes.json();
      const pair = dexData?.pairs?.[0];
      const socials = pair?.info?.socials || [];
      
      // Look for X Community URL
      const communityUrl = socials.find((s: any) => s.url?.includes('/communities/'))?.url;
      
      // Also extract X handle if present
      const xHandleUrl = socials.find((s: any) => 
        (s.url?.includes('x.com/') || s.url?.includes('twitter.com/')) && 
        !s.url?.includes('/communities/')
      )?.url;
      
      if (xHandleUrl) {
        // Extract handle and add to mesh
        const handleMatch = xHandleUrl.match(/(?:x\.com|twitter\.com)\/(@?([a-zA-Z0-9_]+))/i);
        if (handleMatch) {
          const handle = (handleMatch[2] || handleMatch[1]).replace(/^@/, '').toLowerCase();
          if (handle && !['i', 'intent', 'search', 'home', 'explore'].includes(handle)) {
            console.log(`[MeshSpider] Found X handle: @${handle}`);
            await supabase.from('reputation_mesh').upsert({
              source_type: 'token',
              source_id: tokenMint,
              linked_type: 'x_account',
              linked_id: handle,
              relationship: 'social_account',
              confidence: 85,
              discovered_via: 'dexscreener_auto',
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          }
        }
      }
      
      if (communityUrl) {
        console.log(`[MeshSpider] Found X Community: ${communityUrl}`);
        // Call x-community-enricher to scrape admins/mods
        const { data, error } = await supabase.functions.invoke('x-community-enricher', {
          body: {
            communityUrl,
            linkedTokenMint: tokenMint,
            linkedWallet: walletAddress,
          },
        });
        if (!error && data) {
          console.log(`[MeshSpider] Community enriched: ${data.admins?.length || 0} admins, ${data.moderators?.length || 0} mods`);
          // Store community_name in evidence for label enrichment
          const communityMatch = communityUrl.match(/communities\/(\d+)/);
          if (communityMatch && data.communityName) {
            await supabase.from('reputation_mesh')
              .update({ evidence: { community_name: data.communityName, source: 'x-community-enricher' } })
              .eq('linked_type', 'x_community')
              .eq('linked_id', communityMatch[1]);
          }
        }
      }
    } catch (err) {
      console.warn('[MeshSpider] Community auto-discovery failed:', err);
    }
  }, []);

  // Trigger oracle spider for unknown entities
  const triggerSpider = useCallback(async (input: string, scanMode: 'deep' | 'quick' = 'deep') => {
    // Cooldown-based retry: 2 immediate attempts, then reset after 5 minutes
    const COOLDOWN_MS = 5 * 60 * 1000;
    const MAX_IMMEDIATE = 2;
    const record = spiderAttemptsRef.current.get(input);
    const now = Date.now();
    
    if (record) {
      const timeSince = now - record.lastAttempt;
      if (timeSince > COOLDOWN_MS) {
        // Reset after cooldown
        spiderAttemptsRef.current.set(input, { count: 1, lastAttempt: now });
      } else if (record.count >= MAX_IMMEDIATE) {
        const remainingMin = Math.ceil((COOLDOWN_MS - timeSince) / 60000);
        console.log(`[MeshSpider] Cooldown active for ${input}, ${remainingMin}min remaining`);
        setSpiderStatus({
          active: false,
          stage: '',
          error: `Spider cooling down (${record.count} attempts). Retry in ~${remainingMin} min.`,
          diagnostics: ['Cooldown-based retry active', `${record.count} attempts made`, `Resets in ~${remainingMin} minutes`],
        });
        return;
      } else {
        spiderAttemptsRef.current.set(input, { count: record.count + 1, lastAttempt: now });
      }
    } else {
      spiderAttemptsRef.current.set(input, { count: 1, lastAttempt: now });
    }

    setSpiderStatus({ active: true, stage: '🕷️ Initializing spider scan...' });
    console.log('[MeshSpider] Starting spider:', { input: input.slice(0, 16), scanMode });

    try {
      setSpiderStatus({ active: true, stage: '🔍 Resolving entity type & wallet...' });

      const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
        body: { input, scanMode },
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
      
      // Build diagnostics from result
      const diagnostics: string[] = [];
      if (result.inputType) diagnostics.push(`Input type: ${result.inputType}`);
      if (result.resolvedWallet) diagnostics.push(`Resolved wallet: ${result.resolvedWallet.slice(0, 12)}...`);
      else diagnostics.push('❌ Could not resolve wallet');
      
      if (result.requiresScan) diagnostics.push('⚠️ No data found in any source');
      if (result.liveAnalysis) {
        diagnostics.push(`Live analysis: ${result.liveAnalysis.tokensAnalyzed} tokens, pattern: ${result.liveAnalysis.pattern}`);
      }
      if (result.stats) {
        diagnostics.push(`Stats: ${result.stats.totalTokens} tokens, ${result.stats.rugPulls} rugs, ${result.stats.successfulTokens} successful`);
      }
      if (result.apiErrors && result.apiErrors.length > 0) {
        for (const err of result.apiErrors) {
          diagnostics.push(`❌ ${err}`);
        }
      }
      diagnostics.push(`Mesh links added: ${result.meshLinksAdded || 0}`);

      const hasUsefulData = (result.meshLinksAdded || 0) > 0 || result.found;

      if (!hasUsefulData && result.requiresScan) {
        setSpiderStatus({
          active: false,
          stage: '',
          error: `No data found. External APIs returned errors. ${result.recommendation || ''}`,
          diagnostics,
        });
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
        // If input is a token mint, discover its X Community + admins/mods
        const isBase58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.trim());
        if (isBase58) {
          // Input could be token or wallet. Try community discovery for input as token,
          // and also for any tokens discovered in the spider result
          const tokensToCheck = new Set<string>();
          tokensToCheck.add(input.trim());
          
          // Also add tokens from the spider result's token history
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

          // Run community discovery for all tokens (parallel, max 5)
          const communityPromises = [...tokensToCheck].slice(0, 5).map(mint => 
            autoDiscoverCommunity(mint, result.resolvedWallet)
          );
          await Promise.allSettled(communityPromises);
          diagnostics.push(`🏠 X Community auto-discovery ran for ${tokensToCheck.size} tokens`);
        }

        // Refresh mesh graph after spider + community discovery
        setTimeout(() => {
          refetch();
          setTimeout(() => {
            setSpiderStatus(prev => ({ ...prev, active: false }));
          }, 5000);
        }, 1000);
      }

    } catch (err: any) {
      console.error('[MeshSpider] Error:', err);
      setSpiderStatus({
        active: false,
        stage: '',
        error: err.message || 'Spider scan failed',
        diagnostics: [`Exception: ${err.message}`],
      });
    }
  }, [refetch, autoDiscoverCommunity]);

  const focusOnEntity = useCallback((id: string, type: string) => {
    // Reset spider attempts for new searches
    spiderAttemptsRef.current.clear();
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
    spiderAttemptsRef.current.clear();
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
    typeFilters,
    toggleTypeFilter,
    setTypeFilters,
    spiderStatus,
    triggerSpider,
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

    // Track admin/mod role on x_account nodes
    if (link.linked_type === 'x_account' && link.relationship === 'admin_of') {
      const node = nodesMap.get(targetKey);
      if (node) node.role = 'admin';
    }
    if (link.linked_type === 'x_account' && link.relationship === 'mod_of') {
      const node = nodesMap.get(targetKey);
      if (node && node.role !== 'admin') node.role = 'mod'; // admin takes precedence
    }
    // Also check reverse direction (x_account is source)
    if (link.source_type === 'x_account' && link.relationship === 'admin_of') {
      const node = nodesMap.get(sourceKey);
      if (node) node.role = 'admin';
    }
    if (link.source_type === 'x_account' && link.relationship === 'mod_of') {
      const node = nodesMap.get(sourceKey);
      if (node && node.role !== 'admin') node.role = 'mod';
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

  return {
    nodes: connectedNodes,
    links,
  };
}
