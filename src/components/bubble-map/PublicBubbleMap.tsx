import React, { useRef, useCallback, useState, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMeshGraph, ENTITY_COLORS, ENTITY_LABELS, MeshNode } from "@/hooks/useMeshGraph";
import { Search, RotateCcw, Radar, AlertTriangle, ChevronDown, ChevronUp, Network, GitBranch, Key, Coins, Loader2, Unlock, Lock, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBubbleMapRateLimit } from "@/hooks/useBubbleMapRateLimit";
import { useNavigate } from "react-router-dom";

type ViewMode = 'bubble' | 'tree';
const NODE_CAP_DEFAULT = 80;

interface PublicBubbleMapProps {
  /** If true, show subscriber upgrade messaging */
  showUpgradePrompt?: boolean;
  /** Mode label */
  mode: 'promo' | 'authenticated';
}

const PublicBubbleMap = ({ showUpgradePrompt = false, mode }: PublicBubbleMapProps) => {
  const navigate = useNavigate();
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [hoveredNode, setHoveredNode] = useState<MeshNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('bubble');
  const [kycSearching, setKycSearching] = useState(false);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [nodeCap, setNodeCap] = useState(NODE_CAP_DEFAULT);
  const [capBroken, setCapBroken] = useState(false);

  const { canSearch, remaining, limit, isSubscriber, isLimited, recordSearch, isAuthenticated } = useBubbleMapRateLimit();

  const {
    graphData, isLoading, focusedEntity, focusOnEntity,
    expandEntity, resetView, typeFilters, toggleTypeFilter,
    spiderStatus, triggerSpider, refetch,
  } = useMeshGraph();

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 500) });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const prevViewModeRef = useRef<ViewMode>(viewMode);

  useEffect(() => {
    if (graphRef.current) {
      const linkForce = graphRef.current.d3Force('link');
      if (linkForce) {
        linkForce.distance((link: any) => {
          const rel = link.relationship || '';
          if (['admin_of', 'mod_of', 'co_mod'].includes(rel)) return viewMode === 'tree' ? 30 : 20;
          if (['community_for', 'social_account'].includes(rel)) return viewMode === 'tree' ? 55 : 40;
          return viewMode === 'tree' ? 65 : 45;
        });
      }
      graphRef.current.d3Force('charge')?.strength(viewMode === 'tree' ? -200 : -120);
      
      const padding = viewMode === 'tree' ? 20 : 40;
      const pushStrength = viewMode === 'tree' ? 1 : 2;
      const w = dimensions.width || 800;
      const h = 600;
      graphRef.current.d3Force('boundX', () => {
        graphData.nodes.forEach((node: any) => {
          if (node.x < padding) node.vx += pushStrength;
          if (node.x > w - padding) node.vx -= pushStrength;
        });
      });
      graphRef.current.d3Force('boundY', () => {
        graphData.nodes.forEach((node: any) => {
          if (node.y < padding) node.vy += pushStrength;
          if (node.y > h - padding) node.vy -= pushStrength;
        });
      });
      
      if (prevViewModeRef.current !== viewMode) {
        prevViewModeRef.current = viewMode;
        graphRef.current.d3ReheatSimulation();
      }
    }
  }, [graphData, viewMode, dimensions.width]);

  const handleSearch = useCallback(() => {
    if (!searchInput.trim()) {
      console.log('[BubbleMap] Reset — empty search');
      resetView();
      return;
    }
    if (!canSearch) {
      console.warn('[BubbleMap] Search blocked — daily limit reached', { remaining, limit, isSubscriber });
      toast.error("Daily limit reached! Sign up or subscribe for unlimited access.");
      return;
    }
    recordSearch();
    let type = 'wallet';
    if (searchInput.startsWith('@')) type = 'x_account';
    else if (searchInput.length < 20) type = 'token';
    console.log('[BubbleMap] Search started:', { input: searchInput.trim().slice(0, 16), type, mode, remaining });
    focusOnEntity(searchInput.trim(), type);
    setNodeCap(NODE_CAP_DEFAULT);
    setCapBroken(false);
  }, [searchInput, focusOnEntity, resetView, canSearch, recordSearch, remaining, limit, isSubscriber, mode]);

  const shouldOfferSpider = focusedEntity && !isLoading && graphData.nodes.length === 0 && !spiderStatus.active && !spiderStatus.error;

  useEffect(() => {
    if (shouldOfferSpider && searchInput.trim()) {
      triggerSpider(searchInput.trim(), 'deep');
    }
  }, [shouldOfferSpider, searchInput, triggerSpider]);

  const handleSpider = useCallback(() => {
    if (!searchInput.trim()) return;
    triggerSpider(searchInput.trim(), 'deep');
  }, [searchInput, triggerSpider]);

  const handleFindKYC = useCallback(async () => {
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    const targetWallet = focusedEntity?.type === 'wallet' 
      ? focusedEntity.id.replace(/^wallet:/, '') 
      : walletNodes[0]?.id.split(':').slice(1).join(':');
    if (!targetWallet) { toast.error('No wallet found to trace KYC root'); return; }
    setKycSearching(true);
    console.log('[BubbleMap] KYC search started:', targetWallet.slice(0, 16));
    toast.info(`🔍 Deep KYC search for ${targetWallet.slice(0, 12)}...`);
    try {
      const { data, error } = await supabase.functions.invoke('mesh-kyc-deep-search', {
        body: { walletAddress: targetWallet, maxDepth: 5 },
      });
      if (error) {
        console.error('[BubbleMap] KYC search edge function error:', error);
        throw error;
      }
      console.log('[BubbleMap] KYC search result:', { kycRoot: data?.kycRoot?.slice(0, 12), walletsTraced: data?.walletsTraced, chain: data?.chain?.length });
      if (data?.kycRoot) {
        toast.success(`🏦 KYC Root found: ${data.kycRoot.slice(0, 12)}...`);
        if (data.kycRoot) expandEntity(`kyc_root:${data.kycRoot}`);
        expandEntity(`wallet:${targetWallet}`);
        if (data.chain) {
          for (const link of data.chain) {
            if (link.wallet) expandEntity(`wallet:${link.wallet}`);
            if (link.funder) expandEntity(`wallet:${link.funder}`);
          }
        }
      } else {
        toast.warning(`No KYC root found after tracing ${data?.walletsTraced || 0} wallets`);
      }
      setTimeout(() => refetch(), 500);
    } catch (err: any) {
      console.error('[BubbleMap] KYC search failed:', err);
      toast.error(`KYC search failed: ${err.message}`);
    } finally {
      setKycSearching(false);
    }
  }, [graphData.nodes, focusedEntity, refetch]);

  const handleFindTokens = useCallback(async () => {
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    if (walletNodes.length === 0 && !focusedEntity) { toast.error('No wallet nodes to scan'); return; }
    setTokenSearching(true);
    const walletsToScan = focusedEntity?.type === 'wallet'
      ? [focusedEntity.id.replace(/^wallet:/, '')]
      : walletNodes.slice(0, 5).map(n => n.id.split(':').slice(1).join(':'));
    console.log('[BubbleMap] Token discovery started:', { walletCount: walletsToScan.length });
    let totalTokens = 0;
    for (const wallet of walletsToScan) {
      try {
        const { data, error } = await supabase.functions.invoke('mesh-wallet-token-discovery', {
          body: { walletAddress: wallet },
        });
        if (error) {
          console.error('[BubbleMap] Token discovery edge function error:', { wallet: wallet.slice(0, 12), error });
          throw error;
        }
        console.log('[BubbleMap] Token discovery result:', { wallet: wallet.slice(0, 12), tokensFound: data?.tokensFound });
        totalTokens += data?.tokensFound || 0;
      } catch (err: any) {
        console.error('[BubbleMap] Token scan failed for wallet:', wallet.slice(0, 12), err);
        toast.error(`Token scan failed: ${err.message}`);
      }
    }
    if (totalTokens > 0) toast.success(`🎯 ${totalTokens} tokens discovered`);
    else toast.warning('No tokens found');
    setTimeout(() => refetch(), 1000);
    setTokenSearching(false);
  }, [graphData.nodes, focusedEntity, refetch]);

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickNodeRef = useRef<string | null>(null);

  const handleNodeClick = useCallback((node: any) => {
    const nodeId = node.id as string;
    if (lastClickNodeRef.current === nodeId && clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;
      const parts = nodeId.split(':');
      const type = parts[0];
      const rawId = parts.slice(1).join(':');
      if (type === 'wallet' || type === 'token') triggerSpider(rawId, 'quick');
      return;
    }
    lastClickNodeRef.current = nodeId;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;
      expandEntity(nodeId);
      if (graphRef.current) {
        graphRef.current.centerAt(node.x, node.y, 800);
        graphRef.current.zoom(2, 800);
      }
    }, 300);
  }, [expandEntity, triggerSpider]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const meshNode = node as MeshNode & { x: number; y: number };
    const color = ENTITY_COLORS[meshNode.type] || '#888';
    const size = Math.max(4, Math.min(meshNode.val * 3 + 3, 20));
    const isFocused = focusedEntity && meshNode.id.includes(focusedEntity.id);
    if (isFocused) { ctx.shadowColor = color; ctx.shadowBlur = 15; }
    if (meshNode.type === 'token') {
      ctx.beginPath();
      ctx.arc(meshNode.x, meshNode.y, size + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(meshNode.x, meshNode.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = isFocused ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isFocused ? 2 : 0.5; ctx.stroke(); ctx.shadowBlur = 0;
    if (meshNode.type === 'kyc_root') {
      ctx.fillStyle = '#fff'; ctx.font = `${Math.max(8, 12 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏦', meshNode.x, meshNode.y);
    }
    const labelText = meshNode.label;
    if (labelText) {
      const labelFontSize = Math.max(6, 9 / globalScale);
      ctx.font = `bold ${labelFontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(labelText, meshNode.x, meshNode.y + size + 3);
    }
  }, [focusedEntity]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source; const tgt = link.target;
    if (!src.x || !tgt.x) return;
    const rel = link.relationship || '';
    let strokeColor = 'rgba(255,255,255,0.1)';
    if (rel.includes('funded')) strokeColor = 'rgba(34,197,94,0.25)';
    else if (rel.includes('created')) strokeColor = 'rgba(234,179,8,0.2)';
    else if (rel.includes('kyc')) strokeColor = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 0.5; ctx.stroke();
    if (globalScale > 2) {
      const midX = (src.x + tgt.x) / 2; const midY = (src.y + tgt.y) / 2;
      ctx.font = `${Math.max(5, 7 / globalScale)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(rel, midX, midY);
    }
  }, []);

  const isOverCap = !capBroken && graphData.nodes.length > nodeCap;
  const displayData = isOverCap
    ? (() => {
        const cappedNodes = graphData.nodes.slice(0, nodeCap);
        const cappedIds = new Set(cappedNodes.map(n => n.id));
        return {
          nodes: cappedNodes,
          links: graphData.links.filter(l =>
            cappedIds.has(typeof l.source === 'string' ? l.source : (l.source as any).id) &&
            cappedIds.has(typeof l.target === 'string' ? l.target : (l.target as any).id)
          ),
        };
      })()
    : graphData;

  const typeCounts = displayData.nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const trafficLightColor = (tl?: string) => {
    switch (tl) {
      case 'RED': return 'text-red-400';
      case 'YELLOW': return 'text-yellow-400';
      case 'GREEN': return 'text-green-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Rate Limit Banner */}
      {isLimited && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {remaining > 0
                  ? `${remaining} of ${limit} free lookups remaining today`
                  : "Daily limit reached!"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isAuthenticated && (
                <Button size="sm" variant="outline" onClick={() => navigate('/auth')} className="text-xs h-7">
                  Sign Up Free
                </Button>
              )}
              <Button size="sm" onClick={() => navigate('/subscriptions')} className="text-xs h-7 gap-1">
                <Crown className="h-3 w-3" />
                Subscribe for Unlimited
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            🎯 2 lookups a day per IP — check a Dev Wallet and a Token anytime! Subscribe for $9.99/mo for unlimited Bubble Map access.
          </p>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">🫧 Mesh Bubble Map</CardTitle>
              <CardDescription>
                Interactive visualization of the reputation mesh. Enter any entity to explore.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <Button variant={viewMode === 'bubble' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => setViewMode('bubble')}>
                <Network className="h-3 w-3 mr-1" /> Bubble
              </Button>
              <Button variant={viewMode === 'tree' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => setViewMode('tree')}>
                <GitBranch className="h-3 w-3 mr-1" /> Tree
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Paste wallet, token mint, or @handle..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 font-mono text-xs"
              disabled={!canSearch}
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={isLoading || !canSearch}>
              <Search className="h-3.5 w-3.5 mr-1" /> Focus
            </Button>
            <Button variant="ghost" size="sm" onClick={resetView}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Action Buttons */}
          {graphData.nodes.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleFindKYC} disabled={kycSearching}
                className="text-xs h-7 border-amber-500/30 hover:bg-amber-500/10 text-amber-400">
                {kycSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Key className="h-3 w-3 mr-1" />}
                Find KYC Root
              </Button>
              <Button variant="outline" size="sm" onClick={handleFindTokens} disabled={tokenSearching}
                className="text-xs h-7 border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-400">
                {tokenSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Coins className="h-3 w-3 mr-1" />}
                Find All Tokens
              </Button>
              <Button variant="outline" size="sm" onClick={handleSpider} disabled={spiderStatus.active} className="text-xs h-7">
                <Radar className="h-3 w-3 mr-1" /> Deep Spider
              </Button>
            </div>
          )}

          {/* Type Filters */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(ENTITY_LABELS).map(([type, label]) => (
              <Badge key={type} variant={typeFilters.has(type) ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-1.5 py-0 transition-all"
                style={{
                  backgroundColor: typeFilters.has(type) ? ENTITY_COLORS[type] + '33' : 'transparent',
                  borderColor: ENTITY_COLORS[type],
                  color: typeFilters.has(type) ? ENTITY_COLORS[type] : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => toggleTypeFilter(type)}>
                {label}{typeCounts[type] ? ` (${typeCounts[type]})` : ''}
              </Badge>
            ))}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>{displayData.nodes.length} entities</span>
            <span>{displayData.links.length} connections</span>
            {focusedEntity && <span className="text-primary font-mono">{focusedEntity.id.slice(0, 16)}...</span>}
            {isOverCap && (
              <div className="flex items-center gap-1">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                  CAP: {nodeCap}/{graphData.nodes.length}
                </Badge>
                <Button variant="outline" size="sm"
                  className="h-5 text-[10px] px-2 border-amber-500/50 text-amber-400"
                  onClick={() => { setCapBroken(true); toast.info(`Showing all ${graphData.nodes.length} nodes`); }}>
                  <Unlock className="h-2.5 w-2.5 mr-1" /> Break Cap
                </Button>
              </div>
            )}
          </div>

          {/* Spider Status */}
          {spiderStatus.active && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-primary animate-spin" />
                <span className="text-xs font-medium text-primary">{spiderStatus.stage}</span>
              </div>
              {spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                <button onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                  {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Diagnostics ({spiderStatus.diagnostics.length})
                </button>
              )}
              {showDiagnostics && spiderStatus.diagnostics && (
                <div className="rounded bg-background/50 p-2 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                  {spiderStatus.diagnostics.map((d, i) => <div key={i}>{d}</div>)}
                </div>
              )}
            </div>
          )}

          {spiderStatus.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs text-destructive">{spiderStatus.error}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSpider} className="text-[10px] h-6">
                <Radar className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Graph Canvas */}
      <Card className="overflow-hidden">
        <div ref={containerRef} className="w-full" style={{ height: '600px', background: 'hsl(var(--background))' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Loading mesh graph...</p>
              </div>
            </div>
          ) : !canSearch && displayData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-semibold text-foreground">Daily Limit Reached</h3>
                <p className="text-sm text-muted-foreground">
                  Subscribe for $9.99/mo to unlock unlimited Bubble Map access with full spidering, KYC tracing, and enrichment.
                </p>
                <Button onClick={() => navigate('/subscriptions')} className="gap-2">
                  <Crown className="h-4 w-4" /> Upgrade Now
                </Button>
              </div>
            </div>
          ) : !focusedEntity && displayData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <p className="text-4xl">🫧</p>
                <h3 className="text-lg font-semibold text-foreground">Enter an entity to explore</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Paste a <span className="font-medium" style={{ color: ENTITY_COLORS.wallet }}>wallet address</span>,{' '}
                  <span className="font-medium" style={{ color: ENTITY_COLORS.token }}>token mint</span>, or{' '}
                  <span className="font-medium" style={{ color: ENTITY_COLORS.x_account }}>@handle</span> above.
                </p>
                <p className="text-xs text-muted-foreground">
                  The Oracle Spider will automatically discover the full network — wallets, tokens, socials, and KYC chains.
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  {Object.entries({ wallet: 'Wallets', token: 'Tokens', x_account: 'X Accounts', telegram: 'Telegram', kyc_root: 'KYC Root' }).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ENTITY_COLORS[k], border: k === 'kyc_root' ? '1px solid hsl(var(--border))' : 'none' }} />
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : shouldOfferSpider ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <Radar className="h-8 w-8 text-primary animate-spin mx-auto" />
                <h3 className="text-lg font-semibold text-foreground">Auto-spidering entity...</h3>
                <p className="text-sm text-muted-foreground">
                  Resolving dev wallet, funding chain, tokens, and socials for{' '}
                  <span className="font-mono text-xs text-primary">{focusedEntity?.id.slice(0, 16)}...</span>
                </p>
              </div>
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={displayData}
              width={dimensions.width}
              height={600}
              backgroundColor="transparent"
              nodeCanvasObject={paintNode}
              linkCanvasObject={paintLink}
              onNodeClick={handleNodeClick}
              onNodeHover={(node: any) => setHoveredNode(node as MeshNode | null)}
              nodeLabel={(node: any) => {
                const n = node as MeshNode;
                const rawId = n.fullId || n.id.split(':').slice(1).join(':');
                return `${ENTITY_LABELS[n.type] || n.type}\n${rawId}\n${Math.round(n.val)} connections`;
              }}
              cooldownTicks={60}
              d3AlphaDecay={0.05}
              d3VelocityDecay={viewMode === 'tree' ? 0.45 : 0.4}
              dagMode={viewMode === 'tree' ? 'td' : undefined}
              dagLevelDistance={viewMode === 'tree' ? 80 : undefined}
              linkDirectionalParticles={1}
              linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleSpeed={0.004}
              linkDirectionalParticleColor={(link: any) => {
                const rel = link.relationship || '';
                if (rel.includes('funded')) return 'rgba(34,197,94,0.6)';
                if (rel.includes('created')) return 'rgba(234,179,8,0.6)';
                return 'rgba(255,255,255,0.3)';
              }}
              linkDirectionalArrowLength={(link: any) => {
                const rel = link.relationship || '';
                if (['funded_by', 'directly_funded', 'created', 'created_by'].includes(rel)) return 5;
                return 0;
              }}
              linkDirectionalArrowRelPos={0.7}
              enableZoomInteraction={true}
              enablePanInteraction={true}
            />
          )}
        </div>
      </Card>

      {/* Hovered Node Info */}
      {hoveredNode && (
        <Card className="border-primary/30">
          <CardContent className="py-2 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: ENTITY_COLORS[hoveredNode.type] }} />
              <span className="font-medium">{ENTITY_LABELS[hoveredNode.type] || hoveredNode.type}</span>
              <span className="font-semibold">{hoveredNode.label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{Math.round(hoveredNode.val)} conn</Badge>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground select-all break-all pl-5">
              {hoveredNode.fullId || hoveredNode.id.split(':').slice(1).join(':')}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PublicBubbleMap;
