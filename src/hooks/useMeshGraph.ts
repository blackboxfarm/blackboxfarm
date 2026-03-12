import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface MeshNode {
  id: string;
  type: string;
  label: string;       // Friendly display label ($TICKER, @handle, "KYC Root")
  fullId: string;      // Raw ID for tooltip (full address)
  val: number;
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
  x_community: '#6366f1',
  telegram: '#06b6d4',
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
  x_account: '🐦 X Account',
  x_community: '👥 X Community',
  telegram: '📡 Telegram',
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
        if (link.source_type === 'wallet' || link.linked_type === 'wallet' ||
            link.source_type === 'kyc_root' || link.linked_type === 'kyc_root') {
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

    try {
      setSpiderStatus({ active: true, stage: '🔍 Resolving entity type & wallet...' });

      const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
        body: { input, scanMode },
      });

      if (error) throw error;

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

  // ═══ ENRICH TOKEN TICKERS + COMMUNITY NAMES ═══
  const [enrichedGraphData, setEnrichedGraphData] = useState<MeshGraphData>({ nodes: [], links: [] });
  const tickerCacheRef = useRef<Map<string, string>>(new Map());
  const commNameCacheRef = useRef<Map<string, string>>(new Map());
  
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
    
    if (tokenNodes.length === 0 && communityNodes.length === 0) {
      setEnrichedGraphData(applyEnrichmentCaches(graphData, tickerCacheRef.current, commNameCacheRef.current));
      return;
    }

    // Set current data immediately, enrich async
    setEnrichedGraphData(applyEnrichmentCaches(graphData, tickerCacheRef.current, commNameCacheRef.current));

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
          // Query x_communities table for names
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

          // Also check reputation_mesh evidence for community_name
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

          // Mark unfound communities so we don't re-fetch
          for (const id of communityIds) {
            if (!commNameCacheRef.current.has(id)) {
              commNameCacheRef.current.set(id, '');
            }
          }
        } catch (err) {
          console.warn('[MeshGraph] Community name enrichment failed:', err);
        }
      }

      setEnrichedGraphData(prev => applyEnrichmentCaches(prev, tickerCacheRef.current, commNameCacheRef.current));
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
  commNameCache: Map<string, string>
): MeshGraphData {
  const updatedNodes = data.nodes.map(node => {
    if (node.type === 'token') {
      const ticker = tickerCache.get(node.fullId);
      if (ticker) return { ...node, label: `$${ticker.toUpperCase()}` };
    }
    if (node.type === 'x_community') {
      const name = commNameCache.get(node.fullId);
      if (name) return { ...node, label: name.length > 18 ? name.slice(0, 16) + '…' : name };
    }
    return node;
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
  }

  // Prune orphan nodes (no links after filtering)
  const connectedIds = new Set<string>();
  for (const l of links) {
    connectedIds.add(l.source);
    connectedIds.add(l.target);
  }

  return {
    nodes: Array.from(nodesMap.values()).filter(n => connectedIds.has(n.id)),
    links,
  };
}
