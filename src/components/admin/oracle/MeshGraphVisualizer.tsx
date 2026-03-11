import React, { useRef, useCallback, useState, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMeshGraph, ENTITY_COLORS, ENTITY_LABELS, MeshNode } from "@/hooks/useMeshGraph";
import { Search, RotateCcw, Radar, AlertTriangle } from "lucide-react";

const MeshGraphVisualizer = () => {
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [hoveredNode, setHoveredNode] = useState<MeshNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

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

  // Auto-spider: when focused entity returns 0 results, auto-trigger spider
  const shouldOfferSpider = focusedEntity && !isLoading && graphData.nodes.length === 0 && !spiderStatus.active && !spiderStatus.error;

  // Auto-trigger spider when entity not found in mesh
  useEffect(() => {
    if (shouldOfferSpider && searchInput.trim()) {
      triggerSpider(searchInput.trim(), 'deep');
    }
  }, [shouldOfferSpider, searchInput, triggerSpider]);

  const handleSpider = useCallback(() => {
    if (!searchInput.trim()) return;
    triggerSpider(searchInput.trim(), 'deep');
  }, [searchInput, triggerSpider]);

  const handleNodeClick = useCallback((node: any) => {
    expandEntity(node.id);
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2.5, 500);
    }
  }, [expandEntity]);

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
    const fontSize = Math.max(8, 12 / globalScale);
    const isFocused = focusedEntity && meshNode.id.includes(focusedEntity.id);

    if (isFocused) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
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

    if (globalScale > 1.2) {
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(meshNode.label, meshNode.x, meshNode.y + size + 2);
    }
  }, [focusedEntity]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source;
    const tgt = link.target;
    if (!src.x || !tgt.x) return;

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (globalScale > 2) {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const fontSize = Math.max(6, 9 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(link.relationship, midX, midY);
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            🫧 Mesh Bubble Map
          </CardTitle>
          <CardDescription>
            Interactive visualization of the reputation mesh. Enter any entity — if it's new, the spider will automatically discover and map its network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              placeholder="Paste wallet, token mint, or @handle..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 font-mono text-sm"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={isLoading}>
              <Search className="h-4 w-4 mr-1" /> Focus
            </Button>
            <Button variant="ghost" size="sm" onClick={resetView}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>

          {/* Type Filters */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ENTITY_LABELS).map(([type, label]) => (
              <Badge
                key={type}
                variant={typeFilters.has(type) ? "default" : "outline"}
                className="cursor-pointer text-xs transition-all"
                style={{
                  backgroundColor: typeFilters.has(type) ? ENTITY_COLORS[type] + '33' : 'transparent',
                  borderColor: ENTITY_COLORS[type],
                  color: typeFilters.has(type) ? ENTITY_COLORS[type] : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => toggleTypeFilter(type)}
              >
                {label}
              </Badge>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{graphData.nodes.length} entities</span>
            <span>{graphData.links.length} connections</span>
            {focusedEntity && (
              <span className="text-primary">
                Focused: {focusedEntity.id.slice(0, 12)}...
              </span>
            )}
          </div>

          {/* Spider Status Banner */}
          {spiderStatus.active && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 text-primary animate-spin" />
                <span className="text-sm font-medium text-primary">{spiderStatus.stage}</span>
              </div>
              {spiderStatus.meshLinksAdded !== undefined && spiderStatus.meshLinksAdded > 0 && (
                <div className="flex flex-wrap gap-3 text-xs">
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
                <p className="text-xs text-muted-foreground">{spiderStatus.recommendation}</p>
              )}
            </div>
          )}

          {/* Spider Error */}
          {spiderStatus.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{spiderStatus.error}</span>
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
                  If the entity isn't in our database yet, the Oracle Spider will automatically discover its full network — wallets, tokens, socials, and KYC chains.
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
                <p className="text-xs text-muted-foreground">
                  Pump.fun creator → Dev wallet → Funder → KYC Root → Tokens → Socials
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
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              linkDirectionalParticles={1}
              linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleSpeed={0.005}
              linkDirectionalParticleColor={() => 'rgba(255,255,255,0.3)'}
              enableZoomInteraction={true}
              enablePanInteraction={true}
            />
          )}
        </div>
      </Card>

      {/* Hovered Node Info */}
      {hoveredNode && (
        <Card className="border-primary/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: ENTITY_COLORS[hoveredNode.type] }}
              />
              <span className="font-medium">{ENTITY_LABELS[hoveredNode.type] || hoveredNode.type}</span>
              <span className="font-mono text-sm text-muted-foreground">
                {hoveredNode.id.split(':').slice(1).join(':')}
              </span>
              <Badge variant="secondary" className="text-xs">
                {Math.round(hoveredNode.val)} connections
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MeshGraphVisualizer;
