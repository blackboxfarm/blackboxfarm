import React, { useMemo, useCallback, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ResolvedLabels {
  communities: Record<string, { name: string | null; member_count: number | null; recycled_count: number | null; recycled_band: string | null; name_history?: any[] | null; linked_token_mints?: string[] | null }>;
  tokens: Record<string, { ticker: string | null; name: string | null }>;
  handles: Record<string, { display_name: string | null; handle_history: any[] | null; is_rotated: boolean }>;
  pending: Set<string>;
}

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
  /**
   * Which entity is the centerpiece of the search. When 'handle', the layout
   * re-roots on the X handle and reads:
   *   handle → x_communities (role badge on edge) → token ($TICKER) → dev wallet.
   */
  centerpiece?: 'token' | 'handle' | 'wallet' | 'community';
  centerpieceId?: string | null;
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

/**
 * Canonicalize an X handle reference to bare lowercase handle.
 * Accepts: "pumpfun711", "@pumpfun711", "x_account:pumpfun711", "x_account:@pumpfun711".
 */
function canonicalHandleId(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/^x_account:/i, '').replace(/^x_user:/i, '').replace(/^@/, '').toLowerCase().trim();
}

/**
 * Handle-rooted prune: keep only the chain
 *   handle → x_communities → tokens → dev wallets (→ KYC roots)
 * Drops unrelated socials, funders, and other-token branches so the view
 * reads top-to-bottom exactly as: who you are → which communities you run →
 * which tokens those communities spawned → who minted them.
 */
function pruneToHandleChain(graphData: { nodes: any[]; links: any[] }, handleNodeId: string | null) {
  if (!handleNodeId) return graphData;
  const handleNode = graphData.nodes.find((n: any) => n.id === handleNodeId);
  if (!handleNode) return graphData;

  const idToNode = new Map<string, any>();
  for (const n of graphData.nodes) idToNode.set(n.id, n);

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const l of graphData.links) {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!s || !t) continue;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }

  const keep = new Set<string>([handleNodeId]);
  // Hop 1: communities the handle is in
  const communities = new Set<string>();
  for (const nb of adj.get(handleNodeId) || []) {
    if (idToNode.get(nb)?.type === 'x_community') {
      communities.add(nb);
      keep.add(nb);
    }
  }
  // Hop 2: tokens linked to those communities
  const tokens = new Set<string>();
  for (const c of communities) {
    for (const nb of adj.get(c) || []) {
      if (idToNode.get(nb)?.type === 'token') {
        tokens.add(nb);
        keep.add(nb);
      }
    }
  }
  // Hop 3: dev wallet that minted each token
  const devWallets = new Set<string>();
  for (const t of tokens) {
    for (const nb of adj.get(t) || []) {
      const n = idToNode.get(nb);
      // Only keep wallets that are actually flagged as dev/creator for the
      // token. Without this the chain leaks every holder wallet attached to
      // the token and the canvas explodes (the @pumpfun711 56-node bug).
      if (n?.type === 'wallet' && (n.isDev === true || (n as any).is_dev === true)) {
        devWallets.add(nb);
        keep.add(nb);
      }
    }
  }
  // Hop 4 (optional): KYC root above each dev wallet
  for (const w of devWallets) {
    for (const nb of adj.get(w) || []) {
      if (idToNode.get(nb)?.type === 'kyc_root') keep.add(nb);
    }
  }

  const nodes = graphData.nodes.filter((n: any) => keep.has(n.id));
  // Only keep edges that follow the allowed chain pair-types. Without this,
  // stray relationships like `funded_rejected_dev` between the handle and a
  // dev wallet get rendered as edges and their label lands on top of the dev
  // wallet card (the "funded_rejected_dev overlapping DEV WALLET" bug).
  const HANDLE_TYPES = new Set(['x_account', 'x_user']);
  const allowedPair = (a?: string, b?: string) => {
    if (!a || !b) return false;
    const pair = new Set([a, b]);
    if (HANDLE_TYPES.has(a) && b === 'x_community') return true;
    if (HANDLE_TYPES.has(b) && a === 'x_community') return true;
    if (pair.has('x_community') && pair.has('token')) return true;
    if (pair.has('token') && pair.has('wallet')) return true;
    if (pair.has('wallet') && pair.has('kyc_root')) return true;
    return false;
  };
  const links = graphData.links.filter((l: any) => {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (!keep.has(s) || !keep.has(t)) return false;
    return allowedPair(idToNode.get(s)?.type, idToNode.get(t)?.type);
  });
  return { nodes, links };
}

const ROLE_BADGE: Record<string, { icon: string; label: string; color: string }> = {
  community_admin: { icon: '🛡', label: 'Admin',   color: 'hsl(45 90% 55%)' },
  admin_of:        { icon: '🛡', label: 'Admin',   color: 'hsl(45 90% 55%)' },
  community_mod:   { icon: '🔧', label: 'Mod',     color: 'hsl(200 80% 60%)' },
  mod_of:          { icon: '🔧', label: 'Mod',     color: 'hsl(200 80% 60%)' },
  community_creator: { icon: '👑', label: 'Creator', color: 'hsl(280 80% 65%)' },
  created_community: { icon: '👑', label: 'Creator', color: 'hsl(280 80% 65%)' },
  member_of:       { icon: '👤', label: 'Member',  color: 'hsl(var(--muted-foreground))' },
};

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

function buildLayout(
  graphData: { nodes: any[]; links: any[] },
  resolved: ResolvedLabels,
  centerpiece: 'token' | 'handle' | 'wallet' | 'community' = 'token',
) {
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
    // Token: prefer resolved ticker from cache, else label/displayName, else spinner+mint fallback.
    // X Community: prefer resolved human name from cache, else label, else spinner+id fallback.
    let label: React.ReactNode;
    let unresolvedSpinner = false;
    const rawLabel = (n.label || '').toString();
    const rawDisplay = (n.displayName || '').toString();
    const fullId = (n.fullId || n.id || '').toString();
    if (n.type === 'token') {
      const mint = fullId.replace(/^token:/, '');
      const cached = resolved.tokens[mint];
      const cachedTicker = cached?.ticker ? `$${cached.ticker.replace(/^\$/, '')}` : '';
      const ticker = cachedTicker
        || (rawLabel.startsWith('$') && rawLabel.length > 1 && rawLabel.length <= 12
        ? rawLabel
        : rawDisplay && rawDisplay.length <= 12
        ? rawDisplay.startsWith('$') ? rawDisplay : `$${rawDisplay}`
        : '');
      if (ticker) {
        label = ticker;
      } else {
        const fallback = mint.length > 10 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint || '$pending';
        unresolvedSpinner = resolved.pending.has(`token:${mint}`);
        label = fallback;
      }
    } else if (n.type === 'x_community') {
      const cid = fullId.replace(/^x_community:/, '');
      const cachedName = resolved.communities[cid]?.name || '';
      const looksLikeId = !rawLabel || /^\d+$/.test(rawLabel) || rawLabel.includes(cid.slice(0, 6));
      const name = cachedName
        || (!looksLikeId ? rawLabel : (rawDisplay && !/^\d+$/.test(rawDisplay) ? rawDisplay : ''));
      if (name) {
        label = name;
      } else {
        unresolvedSpinner = resolved.pending.has(`community:${cid}`);
        label = `Community #${cid.slice(0, 6)}`;
      }
    } else {
      label = rawDisplay || rawLabel || (fullId.length > 14 ? fullId.slice(0, 14) + '…' : fullId);
    }

    const cidForRecycle = n.type === 'x_community' ? fullId.replace(/^x_community:/, '') : '';
    const cachedRecycle = cidForRecycle ? (resolved.communities[cidForRecycle]?.recycled_count ?? 0) : 0;
    const graphRecycle = n.type === 'x_community' ? (communityTokenNeighbors.get(n.id)?.size ?? 0) : 0;
    let recycledCount = Math.max(cachedRecycle, graphRecycle);
    let nameHistory: any[] | null = cidForRecycle ? (resolved.communities[cidForRecycle]?.name_history ?? null) : null;
    // Handle-level rotation: treat handle_history entries the same way we
    // treat recycled communities so the user gets the ghost-stack visual.
    if (n.type === 'x_account' || n.type === 'x_user') {
      const hKey = (() => {
        const raw = (n.fullId || n.id || '').toString();
        return raw.replace(/^x_account:/, '').replace(/^x_user:/, '').replace(/^@/, '').toLowerCase();
      })();
      const hh = resolved.handles?.[hKey]?.handle_history;
      if (Array.isArray(hh) && hh.length > 0) {
        recycledCount = Math.max(recycledCount, hh.length + 1);
        nameHistory = hh.map((e: any) => ({ name: '@' + (e.handle || e.name || '?'), last_seen: e.last_seen, member_count: null }));
      }
    }
    const isRecycled = recycledCount > 1;
    const ghostStack = Math.min(Math.max(recycledCount - 1, 0), 3);
    const linkedMints = cidForRecycle ? (resolved.communities[cidForRecycle]?.linked_token_mints ?? null) : null;
    const ghostTooltip = isRecycled
      ? [
          n.type === 'x_account' || n.type === 'x_user'
            ? `Handle rotated ${recycledCount} times`
            : `Recycled across ${recycledCount} tokens`,
          ...(Array.isArray(nameHistory)
            ? nameHistory.map((h: any) => {
                const nm = h?.name || h?.prev_name || '?';
                const mc = h?.member_count ? ` · ${h.member_count.toLocaleString()} members` : '';
                const ts = h?.observed_until || h?.last_seen || h?.timestamp;
                const when = ts ? ` · ${new Date(ts).toLocaleDateString()}` : '';
                return `· ${nm}${mc}${when}`;
              })
            : []),
          ...(Array.isArray(linkedMints)
            ? linkedMints.map((m: string) => {
                const tk = resolved.tokens[m]?.ticker;
                return tk ? `· prior $${tk.replace(/^\$/, '')}` : `· ${m.slice(0, 4)}…${m.slice(-4)}`;
              })
            : []),
        ].join('\n')
      : '';

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
        : (n.type === 'x_account' || n.type === 'x_user')
        ? (isRecycled ? `🔄 Rotated ×${recycledCount}` : '🐦 X Handle')
        : n.type;
    return {
      id: n.id,
      position: { x: pos?.x || 0, y: pos?.y || 0 },
      data: { label: (
        <div className="flex flex-col items-center leading-tight" title={ghostTooltip || undefined}>
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
          <span className="font-semibold text-xs truncate max-w-[160px] inline-flex items-center gap-1">
            {unresolvedSpinner && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
            {label}
          </span>
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
          ? [
              ...(ghostStack >= 1 ? ['6px 6px 0 -1px hsl(280 80% 65% / 0.55), 6px 6px 0 0 hsl(280 80% 40% / 0.6)'] : []),
              ...(ghostStack >= 2 ? ['12px 12px 0 -2px hsl(280 80% 65% / 0.4), 12px 12px 0 -1px hsl(280 80% 40% / 0.5)'] : []),
              ...(ghostStack >= 3 ? ['18px 18px 0 -3px hsl(280 80% 65% / 0.28), 18px 18px 0 -2px hsl(280 80% 40% / 0.4)'] : []),
              '0 0 10px hsl(280 80% 65% / 0.5)',
            ].join(', ')
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
    const role = ROLE_BADGE[rel];
    // Only render a textual edge label for chain-semantic relationships.
    // Anything else (e.g. `funded_rejected_dev`, `linked_to_dev`,
    // `promotes_token`) gets a plain unlabelled line so its text can't
    // land on top of a neighboring card.
    const CHAIN_LABEL_RELS = new Set([
      'community_admin', 'admin_of',
      'community_mod', 'mod_of',
      'community_creator', 'created_community',
      'community_for', 'linked_token',
      'created', 'created_by',
      'funded', 'funded_by',
      'same_kyc_root',
    ]);
    const edgeLabel = role
      ? `${role.icon} ${role.label}`
      : (CHAIN_LABEL_RELS.has(rel) ? rel : undefined);
    const edgeStroke = role
      ? role.color
      : isFunding ? 'hsl(45 90% 55%)' : isCreated ? 'hsl(var(--primary))' : 'hsl(var(--border))';
    return {
      id: `e-${i}-${s}-${t}`,
      source: s,
      target: t,
      animated: isFunding,
      label: edgeLabel,
      labelStyle: { fontSize: role ? 11 : 9, fill: role ? role.color : 'hsl(var(--muted-foreground))', fontWeight: role ? 600 : 400 },
      labelBgStyle: role ? { fill: 'hsl(var(--background))', fillOpacity: 0.9 } : undefined,
      labelBgPadding: role ? [4, 2] as [number, number] : undefined,
      labelBgBorderRadius: role ? 4 : undefined,
      style: {
        stroke: edgeStroke,
        strokeWidth: role ? 1.5 : isFunding ? 2 : 1,
        opacity: role ? 0.9 : isFunding ? 0.85 : 0.5,
      },
      markerEnd: { type: MarkerType.ArrowClosed },
    } as Edge;
  });

  return { nodes, edges };
}

const SchematicInner = forwardRef<SchematicHandle, BubbleMapSchematicProps>(function SchematicInner(
  { graphData, width, height = 600, onNodeClick, mode = 'branches', centerpiece = 'token', centerpieceId = null },
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

  const effectiveData = useMemo(() => {
    if (centerpiece === 'handle') {
      const wanted = canonicalHandleId(centerpieceId);
      // Find the handle node by canonical handle, regardless of `x_account:`/`@` prefix.
      let handleNode =
        (wanted && graphData.nodes.find((n: any) =>
          (n.type === 'x_account' || n.type === 'x_user') &&
          (canonicalHandleId(n.fullId || n.id) === wanted || canonicalHandleId(n.label) === wanted)
        )) ||
        graphData.nodes.find((n: any) => n.type === 'x_account');
      // Synthesize a handle root if none exists yet — guarantees the schematic
      // always has a single root and avoids the "no handle node → return full
      // graph → 56-node mess" failure mode.
      let workingGraph = graphData;
      if (!handleNode && wanted) {
        const synthId = `x_account:${wanted}`;
        handleNode = { id: synthId, fullId: wanted, type: 'x_account', label: `@${wanted}`, val: 1, displayName: `@${wanted}` } as any;
        workingGraph = { nodes: [handleNode, ...graphData.nodes], links: graphData.links };
      }
      return pruneToHandleChain(workingGraph, handleNode?.id || null);
    }
    if (mode === 'prune') return pruneToTokenAndSocials(graphData);
    return graphData;
  }, [graphData, mode, centerpiece, centerpieceId]);

  const [resolved, setResolved] = useState<ResolvedLabels>(() => ({
    communities: {}, tokens: {}, handles: {}, pending: new Set(),
  }));

  // Collect unresolved community/token ids from the current graph and batch-fetch
  // human labels via the resolve-labels edge function. Results swap the spinner
  // labels for readable names within ~1s.
  useEffect(() => {
    const communityIds: string[] = [];
    const tokenMints: string[] = [];
    const handleIds: string[] = [];
    for (const n of effectiveData.nodes) {
      const fullId = (n.fullId || n.id || '').toString();
      if (n.type === 'x_community') {
        const cid = fullId.replace(/^x_community:/, '');
        if (/^\d{6,25}$/.test(cid) && !resolved.communities[cid]) communityIds.push(cid);
      } else if (n.type === 'token') {
        const mint = fullId.replace(/^token:/, '');
        if (mint && mint.length >= 30 && !resolved.tokens[mint]) tokenMints.push(mint);
      } else if (n.type === 'x_account' || n.type === 'x_user') {
        const h = canonicalHandleId(fullId || n.id);
        if (h && !resolved.handles[h]) handleIds.push(h);
      }
    }
    if (communityIds.length === 0 && tokenMints.length === 0 && handleIds.length === 0) return;

    const pending = new Set<string>([
      ...communityIds.map((c) => `community:${c}`),
      ...tokenMints.map((m) => `token:${m}`),
    ]);
    setResolved((prev) => ({ ...prev, pending: new Set([...prev.pending, ...pending]) }));

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    supabase.functions
      .invoke('resolve-labels', { body: { communities: communityIds, tokens: tokenMints, handles: handleIds } })
      .then(({ data, error }: any) => {
        clearTimeout(t);
        if (error || !data) return;
        setResolved((prev) => {
          const nextPending = new Set(prev.pending);
          for (const c of communityIds) nextPending.delete(`community:${c}`);
          for (const m of tokenMints) nextPending.delete(`token:${m}`);
          return {
            communities: { ...prev.communities, ...(data.communities || {}) },
            tokens: { ...prev.tokens, ...(data.tokens || {}) },
            handles: { ...prev.handles, ...(data.handles || {}) },
            pending: nextPending,
          };
        });
      })
      .catch(() => {
        clearTimeout(t);
        setResolved((prev) => {
          const nextPending = new Set(prev.pending);
          for (const c of communityIds) nextPending.delete(`community:${c}`);
          for (const m of tokenMints) nextPending.delete(`token:${m}`);
          return { ...prev, pending: nextPending };
        });
      });
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveData]);

  const { nodes, edges } = useMemo(() => buildLayout(effectiveData, resolved, centerpiece), [effectiveData, resolved, centerpiece]);

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