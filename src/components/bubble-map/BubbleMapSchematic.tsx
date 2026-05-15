import React, { useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  Position,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { ENTITY_COLORS, MeshNode } from '@/hooks/useMeshGraph';

interface BubbleMapSchematicProps {
  graphData: { nodes: any[]; links: any[] };
  width: number;
  height?: number;
  onNodeClick?: (node: any) => void;
  /**
   * 'branches' (default) — full mesh: KYC roots, funders, dev, tokens, socials.
   * 'prune'              — Solar-Min-style: only the central token, its dev wallet
   *                         and any socials directly attached to that token.
   */
  mode?: 'branches' | 'prune';
}

export interface SchematicHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
  setZoom: (zoom: number) => void;
}

/**
 * Layered "blueprint" / ladder view of the mesh.
 *
 * Layer order (top → bottom):
 *  0. CEX roots (kyc_root)
 *  1. Funder/hop wallets (wallets that funded the dev wallet)
 *  2. Dev / creator wallet (gold diamond)
 *  3. Tokens minted by the creator
 *  4. Socials (x_account, x_community, telegram, website) attached to tokens
 */

const TYPE_TO_RANK: Record<string, number> = {
  kyc_root: 0,
  wallet: 2, // overridden to 1 if it's an upstream funder, kept at 2 if dev
  token: 3,
  x_community: 4,
  x_account: 4,
  telegram: 4,
  website: 4,
};

function rankNode(n: any, devWalletId: string | null): number {
  if (n.type === 'wallet') {
    if (n.isDev || n.id === devWalletId) return 2;
    return 1; // assume funder/hop
  }
  return TYPE_TO_RANK[n.type] ?? 4;
}

const SOCIAL_TYPES = new Set(['x_account', 'x_community', 'telegram', 'website', 'tg_channel', 'discord', 'github', 'twitch', 'reddit', 'youtube', 'medium']);

function pruneToTokenAndSocials(graphData: { nodes: any[]; links: any[] }) {
  // Find the primary token node (first token, or one flagged as central if any).
  const tokenNode = graphData.nodes.find((n: any) => n.type === 'token');
  if (!tokenNode) return graphData; // nothing to prune around — fall back
  const devNode = graphData.nodes.find((n: any) => n.type === 'wallet' && n.isDev);

  const keep = new Set<string>();
  keep.add(tokenNode.id);
  if (devNode) keep.add(devNode.id);
  // Keep ALL KYC root nodes — they are CORE, not a branch ("pot of gold").
  for (const n of graphData.nodes) {
    if (n.type === 'kyc_root') keep.add(n.id);
  }

  // Keep socials directly linked to the token.
  for (const l of graphData.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (s === tokenNode.id || t === tokenNode.id) {
      const otherId = s === tokenNode.id ? t : s;
      const other = graphData.nodes.find((n: any) => n.id === otherId);
      if (other && SOCIAL_TYPES.has(other.type)) keep.add(other.id);
    }
  }

  const nodes = graphData.nodes.filter((n: any) => keep.has(n.id));
  const links = graphData.links.filter((l: any) => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    return keep.has(s) && keep.has(t);
  });
  return { nodes, links };
}

function buildLayout(graphData: { nodes: any[]; links: any[] }) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const devNode = graphData.nodes.find((n: any) => n.type === 'wallet' && n.isDev);
  const devId = devNode?.id || null;

  // Build a map: x_community node id → set of distinct token neighbors.
  // Any community linked to >1 token is flagged as "recycled" (same community
  // ID reused across multiple token projects under different aliased names).
  const communityTokenNeighbors = new Map<string, Set<string>>();
  const idToType = new Map<string, string>();
  for (const n of graphData.nodes) idToType.set(n.id, n.type);
  for (const l of graphData.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    const sType = idToType.get(s);
    const tType = idToType.get(t);
    if (sType === 'x_community' && tType === 'token') {
      if (!communityTokenNeighbors.has(s)) communityTokenNeighbors.set(s, new Set());
      communityTokenNeighbors.get(s)!.add(t);
    } else if (tType === 'x_community' && sType === 'token') {
      if (!communityTokenNeighbors.has(t)) communityTokenNeighbors.set(t, new Set());
      communityTokenNeighbors.get(t)!.add(s);
    }
  }

  const NODE_W = 180;
  const NODE_H = 48;

  for (const n of graphData.nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H, rank: rankNode(n, devId) });
  }
  // Skip self-loops and any edge whose reverse is already in the DAG —
  // dagre throws "Found cycle in node path" otherwise.
  const seen = new Set<string>();
  for (const l of graphData.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!s || !t || s === t) continue;
    if (!g.hasNode(s) || !g.hasNode(t)) continue;
    const fwd = `${s}→${t}`;
    const rev = `${t}→${s}`;
    if (seen.has(fwd) || seen.has(rev)) continue;
    seen.add(fwd);
    g.setEdge(s, t);
  }

  try {
    dagre.layout(g);
  } catch (err) {
    console.warn('[BubbleMapSchematic] dagre layout failed, falling back to grid:', err);
    // Fallback: simple ranked grid so the view still renders.
    const byRank: Record<number, any[]> = {};
    for (const n of graphData.nodes) {
      const r = rankNode(n, devId);
      (byRank[r] ||= []).push(n);
    }
    Object.entries(byRank).forEach(([r, list]) => {
      const rank = Number(r);
      list.forEach((n: any, i: number) => {
        g.setNode(n.id, { ...g.node(n.id), x: i * (NODE_W + 40) + NODE_W / 2, y: rank * (NODE_H + 90) + NODE_H / 2 });
      });
    });
  }

  const nodes: Node[] = graphData.nodes.map((n: any) => {
    const pos = g.node(n.id);
    const isDev = n.isDev || n.id === devId;
    const color = ENTITY_COLORS[n.type] || '#888';

    // ----- Smart label resolution -----
    // Token: prefer a clean $TICKER from label/displayName, else short mint fallback.
    // X Community: prefer the human community name, else "Community #<short id>".
    let label: string;
    const rawLabel = (n.label || '').toString();
    const rawDisplay = (n.displayName || '').toString();
    const fullId = (n.fullId || n.id || '').toString();
    if (n.type === 'token') {
      const ticker = rawLabel.startsWith('$') && rawLabel.length > 1 && rawLabel.length <= 12
        ? rawLabel
        : rawDisplay && rawDisplay.length <= 12
        ? rawDisplay.startsWith('$') ? rawDisplay : `$${rawDisplay}`
        : '';
      if (ticker) {
        label = ticker;
      } else {
        const mint = fullId.replace(/^token:/, '');
        label = mint.length > 10 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint || '$pending';
      }
    } else if (n.type === 'x_community') {
      const cid = fullId.replace(/^x_community:/, '');
      // Treat label as "name" only if it is NOT just the numeric id.
      const looksLikeId = !rawLabel || /^\d+$/.test(rawLabel) || rawLabel.includes(cid.slice(0, 6));
      const name = !looksLikeId ? rawLabel : (rawDisplay && !/^\d+$/.test(rawDisplay) ? rawDisplay : '');
      label = name || `Community #${cid.slice(0, 6)}`;
    } else {
      label = rawDisplay || rawLabel || (fullId.length > 14 ? fullId.slice(0, 14) + '…' : fullId);
    }

    const recycledCount = n.type === 'x_community'
      ? (communityTokenNeighbors.get(n.id)?.size ?? 0)
      : 0;
    const isRecycled = recycledCount > 1;

    const subLabel =
      n.type === 'kyc_root'
        ? '🏦 CEX'
        : isDev
        ? '📡 Dev Wallet'
        : n.type === 'token'
        ? '🪙 Token'
        : n.type === 'wallet'
        ? '💰 Funder'
        : n.type === 'x_community'
        ? (isRecycled ? `♻ Recycled ×${recycledCount}` : 'X Community')
        : n.type;
    return {
      id: n.id,
      position: { x: pos?.x || 0, y: pos?.y || 0 },
      data: { label: (
        <div className="flex flex-col items-center leading-tight">
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{
              color: isRecycled ? 'hsl(280 80% 70%)' : undefined,
              opacity: isRecycled ? 1 : 0.7,
              fontWeight: isRecycled ? 600 : 400,
            }}
          >
            {subLabel}
          </span>
          <span className="font-semibold text-xs truncate max-w-[160px]">{label}</span>
        </div>
      ) },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        background: isDev ? 'rgba(234,179,8,0.12)' : 'hsl(var(--card))',
        border: `${isRecycled ? '2px' : '1px'} solid ${isDev ? 'hsl(45 90% 55%)' : isRecycled ? 'hsl(280 80% 65%)' : color}`,
        color: 'hsl(var(--foreground))',
        borderRadius: n.type === 'kyc_root' ? 4 : isDev ? 14 : 8,
        padding: 6,
        width: 180,
        boxShadow: isDev
          ? '0 0 12px hsl(45 90% 55% / 0.5)'
          : isRecycled
          ? '0 0 10px hsl(280 80% 65% / 0.5)'
          : undefined,
      },
    } as Node;
  });

  const edges: Edge[] = graphData.links.map((l: any, i: number) => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    const rel = l.relationship || '';
    const isFunding = rel.includes('funded');
    const isCreated = rel.includes('created');
    return {
      id: `e-${i}-${s}-${t}`,
      source: s,
      target: t,
      animated: isFunding,
      label: rel || undefined,
      labelStyle: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
      style: {
        stroke: isFunding ? 'hsl(45 90% 55%)' : isCreated ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        strokeWidth: isFunding ? 2 : 1,
        opacity: isFunding ? 0.85 : 0.5,
      },
      markerEnd: { type: MarkerType.ArrowClosed },
    } as Edge;
  });

  return { nodes, edges };
}

const SchematicInner = forwardRef<SchematicHandle, BubbleMapSchematicProps>(function SchematicInner(
  { graphData, width, height = 600, onNodeClick, mode = 'branches' },
  ref,
) {
  const rf = useReactFlow();
  useImperativeHandle(ref, () => ({
    zoomIn: () => rf.zoomIn({ duration: 250 }),
    zoomOut: () => rf.zoomOut({ duration: 250 }),
    fitView: () => rf.fitView({ padding: 0.15, duration: 400 }),
    setZoom: (zoom: number) => {
      try {
        const vp = rf.getViewport();
        rf.setViewport({ x: vp.x, y: vp.y, zoom }, { duration: 300 });
      } catch { /* noop */ }
    },
  }), [rf]);

  const effectiveData = useMemo(
    () => (mode === 'prune' ? pruneToTokenAndSocials(graphData) : graphData),
    [graphData, mode],
  );
  const { nodes, edges } = useMemo(() => buildLayout(effectiveData), [effectiveData]);

  const handleNodeClick = useCallback(
    (_e: any, node: Node) => {
      const original = graphData.nodes.find((n: any) => n.id === node.id);
      if (original && onNodeClick) onNodeClick(original);
    },
    [graphData.nodes, onNodeClick]
  );

  return (
    <div style={{ width, height }} className="bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="hsl(var(--border))" />
      </ReactFlow>
    </div>
  );
});

const BubbleMapSchematic = forwardRef<SchematicHandle, BubbleMapSchematicProps>(function BubbleMapSchematic(props, ref) {
  return (
    <ReactFlowProvider>
      <SchematicInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});

export default BubbleMapSchematic;