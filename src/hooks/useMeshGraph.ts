import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useState } from "react";

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

  const entityIds = [...expandedEntities];
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

  // Trigger oracle spider for unknown entities
  const triggerSpider = useCallback(async (input: string, scanMode: 'deep' | 'quick' = 'deep') => {
    setSpiderStatus({ active: true, stage: '🕷️ Initializing spider scan...' });

    try {
      setSpiderStatus({ active: true, stage: '🔍 Resolving entity type & wallet...' });

      const { data, error } = await supabase.functions.invoke('oracle-unified-lookup', {
        body: { input, scanMode },
      });

      if (error) throw error;

      const result = data as any;
      
      setSpiderStatus({
        active: true,
        stage: `✅ Spider complete — ${result.meshLinksAdded || 0} mesh links discovered`,
        inputType: result.inputType,
        meshLinksAdded: result.meshLinksAdded || 0,
        score: result.score,
        trafficLight: result.trafficLight,
        recommendation: result.recommendation,
      });

      // Refresh mesh graph after spider populates data
      setTimeout(() => {
        refetch();
        // Keep status visible for a few more seconds
        setTimeout(() => {
          setSpiderStatus(prev => ({ ...prev, active: false }));
        }, 5000);
      }, 1000);

    } catch (err: any) {
      console.error('[MeshSpider] Error:', err);
      setSpiderStatus({
        active: false,
        stage: '',
        error: err.message || 'Spider scan failed',
      });
    }
  }, [refetch]);

  const focusOnEntity = useCallback((id: string, type: string) => {
    setFocusedEntity({ id, type });
    setExpandedEntities(new Set([id]));
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
