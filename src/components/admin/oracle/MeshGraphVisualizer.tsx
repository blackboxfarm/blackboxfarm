import React, { useRef, useCallback, useState, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMeshGraph, ENTITY_COLORS, ENTITY_LABELS, MeshNode } from "@/hooks/useMeshGraph";
import { Search, RotateCcw, Radar, AlertTriangle, ChevronDown, ChevronUp, Network, GitBranch, Key, Coins, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ViewMode = 'bubble' | 'tree';

const MeshGraphVisualizer = () => {
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [hoveredNode, setHoveredNode] = useState<MeshNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('bubble');
  const [kycSearching, setKycSearching] = useState(false);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [communitySearching, setCommunitySearching] = useState(false);

  const {
    graphData,
    isLoading,
    focusedEntity,
    focusOnEntity,
    expandEntity,
    resetView,
    typeFilters,
    toggleTypeFilter,
    spiderStatus,
    triggerSpider,
    refetch,
  } = useMeshGraph();

  // Resize observer for responsive canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 500),
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Adjust forces based on view mode
  useEffect(() => {
    if (graphRef.current) {
      if (viewMode === 'tree') {
        graphRef.current.d3Force('link')?.distance(95);
        graphRef.current.d3Force('charge')?.strength(-300);
      } else {
        graphRef.current.d3Force('link')?.distance(70);
        graphRef.current.d3Force('charge')?.strength(-180);
      }
    }
  }, [graphData, viewMode]);

  const handleSearch = useCallback(() => {
    if (!searchInput.trim()) {
      resetView();
      return;
    }
    let type = 'wallet';
    if (searchInput.startsWith('@')) type = 'x_account';
    else if (searchInput.length < 20) type = 'token';
    focusOnEntity(searchInput.trim(), type);
  }, [searchInput, focusOnEntity, resetView]);

  // Auto-spider: when focused entity returns 0 results
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

  // ═══ Find KYC Root ═══
  const handleFindKYC = useCallback(async () => {
    // Find wallet nodes in the graph to trace
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    const targetWallet = focusedEntity?.type === 'wallet' 
      ? focusedEntity.id.replace(/^wallet:/, '') 
      : walletNodes[0]?.id.split(':').slice(1).join(':');
    
    if (!targetWallet) {
      toast.error('No wallet found to trace KYC root');
      return;
    }

    setKycSearching(true);
    toast.info(`🔍 Deep KYC search for ${targetWallet.slice(0, 12)}...`);

    try {
      const { data, error } = await supabase.functions.invoke('mesh-kyc-deep-search', {
        body: { walletAddress: targetWallet, maxDepth: 5 },
      });

      if (error) throw error;

      if (data?.kycRoot) {
        toast.success(`🏦 KYC Root found: ${data.kycRoot.slice(0, 12)}... (${data.walletsTraced} wallets traced, ${data.meshLinksAdded} links added)`);
      } else {
        toast.warning(`No KYC root found after tracing ${data?.walletsTraced || 0} wallets`);
      }

      // Refresh the graph
      setTimeout(() => refetch(), 1000);
    } catch (err: any) {
      toast.error(`KYC search failed: ${err.message}`);
    } finally {
      setKycSearching(false);
    }
  }, [graphData.nodes, focusedEntity, refetch]);

  // ═══ Find All Tokens ═══
  const handleFindTokens = useCallback(async () => {
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    if (walletNodes.length === 0 && !focusedEntity) {
      toast.error('No wallet nodes to scan for tokens');
      return;
    }

    setTokenSearching(true);
    // Extract raw wallet addresses — strip type prefix and skip non-wallet entities
    const walletsToScan = focusedEntity 
      ? (focusedEntity.type === 'wallet' 
          ? [focusedEntity.id.replace(/^wallet:/, '')]
          : (() => { toast.error('Focused entity is not a wallet — select a wallet node to scan tokens'); setTokenSearching(false); return []; })())
      : walletNodes.slice(0, 5).map(n => n.id.split(':').slice(1).join(':'));

    let totalTokens = 0;
    let totalLinks = 0;

    for (const wallet of walletsToScan) {
      toast.info(`🪙 Scanning ${wallet.slice(0, 12)}... for minted tokens`);
      try {
        const { data, error } = await supabase.functions.invoke('mesh-wallet-token-discovery', {
          body: { walletAddress: wallet },
        });

        if (error) throw error;
        totalTokens += data?.tokensFound || 0;
        totalLinks += data?.meshLinksAdded || 0;
        
        if (data?.tokensFound > 0) {
          toast.success(`Found ${data.tokensFound} tokens for ${wallet.slice(0, 8)}...`);
        }
      } catch (err: any) {
        toast.error(`Token scan failed for ${wallet.slice(0, 8)}: ${err.message}`);
      }
    }

    if (totalTokens > 0) {
      toast.success(`🎯 Total: ${totalTokens} tokens discovered, ${totalLinks} mesh links added`);
    } else {
      toast.warning('No tokens found for any scanned wallets');
    }

    setTimeout(() => refetch(), 1000);
    setTokenSearching(false);
  }, [graphData.nodes, focusedEntity, refetch]);

  // (Enrich Communities is now auto-triggered by clicking x_community nodes)

  const handleNodeClick = useCallback(async (node: any) => {
    const nodeId = node.id as string;
    const parts = nodeId.split(':');
    const type = parts[0];
    const rawId = parts.slice(1).join(':');
    
    expandEntity(nodeId);
    
    if (type === 'wallet' || type === 'token') {
      console.log(`[BubbleMap] Spidering node: ${rawId}`);
      triggerSpider(rawId, 'quick');
    }

    // Auto-enrich X Community on click — scrape admins/mods
    if (type === 'x_community') {
      console.log(`[BubbleMap] Auto-enriching X Community: ${rawId}`);
      setCommunitySearching(true);
      toast.info(`👥 Enriching X Community ${rawId.slice(0, 16)}...`);
      try {
        const tokenNode = graphData.nodes.find(n => n.type === 'token');
        const walletNode = graphData.nodes.find(n => n.type === 'wallet');
        const { data, error } = await supabase.functions.invoke('x-community-enricher', {
          body: {
            communityUrl: `https://x.com/i/communities/${rawId}`,
            linkedTokenMint: tokenNode?.id.split(':').slice(1).join(':'),
            linkedWallet: walletNode?.id.split(':').slice(1).join(':'),
          },
        });
        if (error) throw error;
        toast.success(`Found ${data?.admins?.length || 0} admins, ${data?.moderators?.length || 0} mods`);
        setTimeout(() => refetch(), 1000);
      } catch (err: any) {
        toast.error(`Community enrichment failed: ${err.message}`);
      } finally {
        setCommunitySearching(false);
      }
    }
    
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2.5, 500);
    }
  }, [expandEntity, triggerSpider, graphData.nodes, refetch]);

  const handleNodeRightClick = useCallback((node: any) => {
    const parts = (node.id as string).split(':');
    const type = parts[0];
    const id = parts.slice(1).join(':');
    focusOnEntity(id, type);
  }, [focusOnEntity]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const meshNode = node as MeshNode & { x: number; y: number };
    const color = ENTITY_COLORS[meshNode.type] || '#888';
    const size = Math.max(4, Math.min(meshNode.val * 3 + 3, 20));
    const fontSize = Math.max(5, 8 / globalScale);
    const isFocused = focusedEntity && meshNode.id.includes(focusedEntity.id);

    if (isFocused) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
    }

    // Token nodes: show success/failure via ring color
    if (meshNode.type === 'token') {
      // Outer ring to indicate status (will be enhanced when token data is available)
      ctx.beginPath();
      ctx.arc(meshNode.x, meshNode.y, size + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(meshNode.x, meshNode.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = isFocused ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isFocused ? 2 : 0.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // KYC root: draw a diamond/crown marker
    if (meshNode.type === 'kyc_root') {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, 12 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏦', meshNode.x, meshNode.y);
    }

    if (globalScale > 1.0) {
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(meshNode.label, meshNode.x, meshNode.y + size + 2);
    }
  }, [focusedEntity]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source;
    const tgt = link.target;
    if (!src.x || !tgt.x) return;

    const rel = link.relationship || '';
    
    // Color links by relationship type
    let strokeColor = 'rgba(255,255,255,0.1)';
    if (rel.includes('funded') || rel.includes('directly_funded')) strokeColor = 'rgba(34,197,94,0.25)';
    else if (rel.includes('created')) strokeColor = 'rgba(234,179,8,0.2)';
    else if (rel.includes('kyc')) strokeColor = 'rgba(255,255,255,0.2)';

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (globalScale > 2) {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const fontSize = Math.max(5, 7 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(rel, midX, midY);
    }
  }, []);

  const trafficLightColor = (tl?: string) => {
    switch (tl) {
      case 'RED': return 'text-red-400';
      case 'YELLOW': return 'text-yellow-400';
      case 'GREEN': return 'text-green-400';
      case 'BLUE': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  };

  // Count entity types in current graph
  const typeCounts = graphData.nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🫧 Mesh Bubble Map
              </CardTitle>
              <CardDescription>
                Interactive visualization of the reputation mesh. Enter any entity to explore.
              </CardDescription>
            </div>
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <Button
                variant={viewMode === 'bubble' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setViewMode('bubble')}
              >
                <Network className="h-3 w-3 mr-1" />
                Bubble
              </Button>
              <Button
                variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setViewMode('tree')}
              >
                <GitBranch className="h-3 w-3 mr-1" />
                Tree
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search + Actions Row */}
          <div className="flex gap-2">
            <Input
              placeholder="Paste wallet, token mint, or @handle..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={isLoading}>
              <Search className="h-3.5 w-3.5 mr-1" /> Focus
            </Button>
            <Button variant="ghost" size="sm" onClick={resetView}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Action Buttons */}
          {graphData.nodes.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindKYC}
                disabled={kycSearching}
                className="text-xs h-7 border-amber-500/30 hover:bg-amber-500/10 text-amber-400"
              >
                {kycSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Key className="h-3 w-3 mr-1" />}
                Find KYC Root
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindTokens}
                disabled={tokenSearching}
                className="text-xs h-7 border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-400"
              >
                {tokenSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Coins className="h-3 w-3 mr-1" />}
                Find All Tokens
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSpider}
                disabled={spiderStatus.active}
                className="text-xs h-7"
              >
                <Radar className="h-3 w-3 mr-1" /> Deep Spider
              </Button>
            </div>
          )}

          {/* Type Filters */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(ENTITY_LABELS).map(([type, label]) => (
              <Badge
                key={type}
                variant={typeFilters.has(type) ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-1.5 py-0 transition-all"
                style={{
                  backgroundColor: typeFilters.has(type) ? ENTITY_COLORS[type] + '33' : 'transparent',
                  borderColor: ENTITY_COLORS[type],
                  color: typeFilters.has(type) ? ENTITY_COLORS[type] : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => toggleTypeFilter(type)}
              >
                {label}
                {typeCounts[type] ? ` (${typeCounts[type]})` : ''}
              </Badge>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{graphData.nodes.length} entities</span>
            <span>{graphData.links.length} connections</span>
            {focusedEntity && (
              <span className="text-primary font-mono">
                {focusedEntity.id.slice(0, 16)}...
              </span>
            )}
          </div>

          {/* Spider Status Banner */}
          {spiderStatus.active && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-primary animate-spin" />
                <span className="text-xs font-medium text-primary">{spiderStatus.stage}</span>
              </div>
              {spiderStatus.meshLinksAdded !== undefined && spiderStatus.meshLinksAdded > 0 && (
                <div className="flex flex-wrap gap-3 text-[10px]">
                  <span>Links: <strong>{spiderStatus.meshLinksAdded}</strong></span>
                  {spiderStatus.score !== undefined && (
                    <span className={trafficLightColor(spiderStatus.trafficLight)}>
                      Score: <strong>{spiderStatus.score}/100</strong> {spiderStatus.trafficLight}
                    </span>
                  )}
                  {spiderStatus.inputType && (
                    <span>Type: <strong>{spiderStatus.inputType}</strong></span>
                  )}
                </div>
              )}
              {spiderStatus.recommendation && (
                <p className="text-[10px] text-muted-foreground">{spiderStatus.recommendation}</p>
              )}
              {spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Diagnostics ({spiderStatus.diagnostics.length})
                </button>
              )}
              {showDiagnostics && spiderStatus.diagnostics && (
                <div className="rounded bg-background/50 p-2 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                  {spiderStatus.diagnostics.map((d, i) => (
                    <div key={i}>{d}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Spider Error */}
          {spiderStatus.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs text-destructive">{spiderStatus.error}</span>
              </div>
              {spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                <>
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Diagnostics ({spiderStatus.diagnostics.length})
                  </button>
                  {showDiagnostics && (
                    <div className="rounded bg-background/50 p-2 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                      {spiderStatus.diagnostics.map((d, i) => (
                        <div key={i}>{d}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
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
          ) : !focusedEntity && graphData.nodes.length === 0 ? (
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
              graphData={graphData}
              width={dimensions.width}
              height={600}
              backgroundColor="transparent"
              nodeCanvasObject={paintNode}
              linkCanvasObject={paintLink}
              onNodeClick={handleNodeClick}
              onNodeRightClick={handleNodeRightClick}
              onNodeHover={(node: any) => setHoveredNode(node as MeshNode | null)}
              nodeLabel={(node: any) => {
                const n = node as MeshNode;
                return `${ENTITY_LABELS[n.type] || n.type}: ${n.id.split(':').slice(1).join(':')}`;
              }}
              cooldownTicks={100}
              d3AlphaDecay={0.015}
              d3VelocityDecay={viewMode === 'tree' ? 0.35 : 0.25}
              dagMode={viewMode === 'tree' ? 'td' : undefined}
              dagLevelDistance={viewMode === 'tree' ? 80 : undefined}
              linkDirectionalParticles={(link: any) => {
                const rel = link.relationship || '';
                if (['same_kyc_root', 'same_team', 'same_developer'].includes(rel)) return 2;
                return 1;
              }}
              linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleSpeed={(link: any) => {
                const rel = link.relationship || '';
                if (['same_kyc_root', 'same_team'].includes(rel)) return 0.008;
                return 0.004;
              }}
              linkDirectionalParticleColor={(link: any) => {
                const rel = link.relationship || '';
                if (rel.includes('funded')) return 'rgba(34,197,94,0.6)';
                if (rel.includes('created')) return 'rgba(234,179,8,0.6)';
                if (rel.includes('kyc')) return 'rgba(255,255,255,0.6)';
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
          <CardContent className="py-2">
            <div className="flex items-center gap-2 text-xs">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: ENTITY_COLORS[hoveredNode.type] }}
              />
              <span className="font-medium">{ENTITY_LABELS[hoveredNode.type] || hoveredNode.type}</span>
              <span className="font-mono text-muted-foreground truncate">
                {hoveredNode.id.split(':').slice(1).join(':')}
              </span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {Math.round(hoveredNode.val)} conn
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MeshGraphVisualizer;
