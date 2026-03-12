import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useRef, useState } from "react";

export interface MeshNode {
  id: string;
  type: string;
  label: string;
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

const getNodeLabel = (id: string, _type: string) => {
  if (id.length > 16) return `${id.slice(0, 6)}...${id.slice(-4)}`;
  return id;
};

export function useMeshGraph(initialEntityId?: string) {
  const [focusedEntity, setFocusedEntity] = useState<{ id: string; type: string } | null>(
    initialEntityId ? { id: initialEntityId, type: 'unknown' } : null
  );
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(Object.keys(ENTITY_COLORS)));
  const [spiderStatus, setSpiderStatus] = useState<SpiderStatus>({ active: false, stage: '' });
  
  // Track spider attempts to prevent infinite loops
  const spiderAttemptsRef = useRef<Map<string, number>>(new Map());

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
      for (const entityId of uniqueIds) {
        const { data, error } = await supabase
          .from('reputation_mesh')
          .select('*')
          .or(`source_id.eq.${entityId},linked_id.eq.${entityId}`)
          .limit(200);
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
    // Prevent infinite retry loops — max 2 attempts per entity
    const attempts = spiderAttemptsRef.current.get(input) || 0;
    if (attempts >= 2) {
      console.log(`[MeshSpider] Max attempts reached for ${input}, stopping`);
      setSpiderStatus({
        active: false,
        stage: '',
        error: `Spider exhausted after ${attempts} attempts. External APIs may be down (Pump.fun, Helius). Try again later.`,
        diagnostics: ['Max retry attempts reached', 'Pump.fun API may be returning 404/503', 'Helius RPC may be timing out'],
      });
      return;
    }
    spiderAttemptsRef.current.set(input, attempts + 1);

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

  return {
    graphData: graphData || { nodes: [], links: [] },
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

function buildGraph(meshLinks: any[], typeFilters: Set<string>): MeshGraphData {
  const nodesMap = new Map<string, MeshNode>();
  const links: MeshLink[] = [];

  for (const link of meshLinks) {
    const sourceKey = `${link.source_type}:${link.source_id}`;
    const targetKey = `${link.linked_type}:${link.linked_id}`;

    if (!typeFilters.has(link.source_type) || !typeFilters.has(link.linked_type)) continue;

    if (!nodesMap.has(sourceKey)) {
      nodesMap.set(sourceKey, {
        id: sourceKey,
        type: link.source_type,
        label: getNodeLabel(link.source_id, link.source_type),
        val: 1,
      });
    } else {
      nodesMap.get(sourceKey)!.val += 0.3;
    }

    if (!nodesMap.has(targetKey)) {
      nodesMap.set(targetKey, {
        id: targetKey,
        type: link.linked_type,
        label: getNodeLabel(link.linked_id, link.linked_type),
        val: 1,
      });
    } else {
      nodesMap.get(targetKey)!.val += 0.3;
    }

    links.push({
      source: sourceKey,
      target: targetKey,
      relationship: link.relationship,
      confidence: link.confidence || 50,
    });
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}
