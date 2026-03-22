import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FamilyGraphProps {
  familyId: string;
  onBack: () => void;
}

const TIER_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#eab308',
  C: '#f97316',
  X: '#6b7280',
};

const LABEL_COLORS: Record<string, string> = {
  seed: '#8b5cf6',
  parent: '#3b82f6',
  sibling: '#06b6d4',
  child: '#10b981',
  cex_gateway: '#ef4444',
  unknown: '#6b7280',
};

const EDGE_COLORS: Record<string, string> = {
  FUNDED_BY: '#3b82f6',
  FUNDS_TO: '#10b981',
  CO_MINTED_WITH: '#f59e0b',
  TOKEN_TRANSFER_TO: '#8b5cf6',
  PROFIT_RETURN_PATH: '#ef4444',
  SAME_UPSTREAM_SOURCE: '#6b7280',
  POSSIBLE_CEX_GATEWAY: '#dc2626',
};

function shortAddr(w: string) {
  return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : '';
}

export function FamilyGraph({ familyId, onBack }: FamilyGraphProps) {
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    loadGraph();
  }, [familyId]);

  async function loadGraph() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('family-graph-api', {
        body: { family_id: familyId },
      });
      if (error) throw error;
      setGraphData(data);
      buildFlowGraph(data);
    } catch (err) {
      console.error('Failed to load graph:', err);
    } finally {
      setLoading(false);
    }
  }

  function buildFlowGraph(data: any) {
    if (!data?.nodes?.length) return;

    const seedWallet = data.family?.seed_wallet;

    // Layout: position nodes by label
    const labelPositions: Record<string, { x: number; yBase: number }> = {
      parent: { x: 0, yBase: -200 },
      cex_gateway: { x: -400, yBase: -100 },
      seed: { x: 0, yBase: 0 },
      sibling: { x: -300, yBase: 150 },
      child: { x: 300, yBase: 150 },
      unknown: { x: 0, yBase: 300 },
    };

    const labelCounters: Record<string, number> = {};

    const flowNodes: Node[] = data.nodes.map((n: any) => {
      const label = n.label || 'unknown';
      if (!labelCounters[label]) labelCounters[label] = 0;
      const idx = labelCounters[label]++;
      const pos = labelPositions[label] || labelPositions.unknown;

      // Spread nodes of same label horizontally
      const xOffset = (idx - Math.floor(idx / 2)) * 200 * (idx % 2 === 0 ? 1 : -1);

      const isSeed = n.id === seedWallet;
      const hasMints = data.mintEvents?.some((m: any) => m.detected_by_wallet === n.id);

      return {
        id: n.id,
        position: { x: pos.x + xOffset, y: pos.yBase + (idx * 30) },
        data: {
          label: (
            <div className="text-center">
              <div className="text-[10px] font-bold" style={{ color: LABEL_COLORS[label] }}>
                {isSeed ? '⭐ SEED' : label.toUpperCase().replace('_', ' ')}
              </div>
              <div className="font-mono text-[11px]">{shortAddr(n.id)}</div>
              <div className="flex gap-1 justify-center mt-1">
                <span className="text-[9px] px-1 rounded" style={{ background: TIER_COLORS[n.tier] + '33', color: TIER_COLORS[n.tier] }}>
                  Tier {n.tier}
                </span>
                <span className="text-[9px] text-muted-foreground">{n.confidence}%</span>
              </div>
              {hasMints && <div className="text-[10px] mt-0.5">🪙 MINTED</div>}
            </div>
          ),
        },
        style: {
          background: isSeed ? '#1e1b4b' : '#18181b',
          border: `2px solid ${LABEL_COLORS[label]}`,
          borderRadius: '8px',
          padding: '8px',
          width: 140,
          fontSize: '11px',
          color: '#e4e4e7',
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });

    const flowEdges: Edge[] = data.edges.map((e: any, i: number) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.type.replace(/_/g, ' '),
      labelStyle: { fontSize: '8px', fill: '#a1a1aa' },
      style: { stroke: EDGE_COLORS[e.type] || '#6b7280', strokeWidth: Math.min(e.weight / 10, 3) + 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[e.type] || '#6b7280' },
      animated: e.type === 'FUNDED_BY' || e.type === 'FUNDS_TO',
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to families
        </button>
        <h3 className="text-lg font-semibold">{graphData?.family?.family_name || 'Wallet Family'}</h3>
        {graphData?.stats && (
          <div className="flex gap-2 ml-auto">
            <Badge variant="secondary">{graphData.stats.totalMembers} wallets</Badge>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">A: {graphData.stats.tierA}</Badge>
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">B: {graphData.stats.tierB}</Badge>
            {graphData.stats.totalMints > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">🪙 {graphData.stats.totalMints} mints</Badge>
            )}
          </div>
        )}
      </div>

      <div style={{ height: 500 }} className="border border-border rounded-lg overflow-hidden bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          colorMode="dark"
        >
          <Background color="#27272a" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const style = node.style as any;
              return style?.borderColor || '#6b7280';
            }}
            style={{ background: '#18181b' }}
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(LABEL_COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm border" style={{ borderColor: color, background: color + '33' }} />
            {label.replace('_', ' ')}
          </div>
        ))}
      </div>
    </div>
  );
}
