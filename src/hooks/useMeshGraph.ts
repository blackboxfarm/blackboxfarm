import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useState } from "react";

export interface MeshNode {
  id: string;
  type: string; // wallet, token, x_account, x_community, telegram, kyc_root, discord, github, twitch, website
  label: string;
  val: number; // bubble size
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

// Color palette for entity types
export const ENTITY_COLORS: Record<string, string> = {
  wallet: '#22c55e',       // green
  token: '#eab308',        // yellow
  x_account: '#3b82f6',   // blue (twitter)
  x_community: '#6366f1', // indigo
  telegram: '#06b6d4',    // cyan
  kyc_root: '#ffffff',    // white
  discord: '#8b5cf6',     // purple
  github: '#a3a3a3',      // gray
  twitch: '#a855f7',      // purple
  website: '#f97316',     // orange
  reddit: '#ef4444',      // red
  youtube: '#dc2626',     // red
  medium: '#737373',      // gray
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

const getNodeLabel = (id: string, type: string) => {
  if (id.length > 16) return `${id.slice(0, 6)}...${id.slice(-4)}`;
  return id;
};

export function useMeshGraph(initialEntityId?: string) {
  const [focusedEntity, setFocusedEntity] = useState<{ id: string; type: string } | null>(
    initialEntityId ? { id: initialEntityId, type: 'unknown' } : null
  );
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(Object.keys(ENTITY_COLORS)));

  // Fetch mesh links for a set of entity IDs (all expanded + focused)
  const entityIds = [...expandedEntities];
  if (focusedEntity) entityIds.push(focusedEntity.id);
  const uniqueIds = [...new Set(entityIds)];

  const { data: graphData, isLoading, refetch } = useQuery({
    queryKey: ['mesh-graph', uniqueIds.sort().join(','), [...typeFilters].sort().join(',')],
    queryFn: async (): Promise<MeshGraphData> => {
      if (uniqueIds.length === 0) {
        // Start blank — user must search for an entity
        return { nodes: [], links: [] };
      }

      // Fetch all links where any of our entities appear
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

      // Deduplicate by id
      const seen = new Set<string>();
      const dedupedLinks = allLinks.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });

      return buildGraph(dedupedLinks, typeFilters);
    },
    staleTime: 30_000,
    enabled: uniqueIds.length > 0, // Don't run until user searches
  });

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
