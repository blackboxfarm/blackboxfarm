import React, { useRef, useCallback, useState, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMeshGraph, ENTITY_COLORS, ENTITY_LABELS, MeshNode } from "@/hooks/useMeshGraph";
import { Search, RotateCcw, ZoomIn, Maximize2 } from "lucide-react";

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
    // Try to determine type from input
    let type = 'wallet';
    if (searchInput.startsWith('@')) type = 'x_account';
    else if (searchInput.length < 20) type = 'token';
    focusOnEntity(searchInput.trim(), type);
  }, [searchInput, focusOnEntity, resetView]);

  const handleNodeClick = useCallback((node: any) => {
    const rawId = (node.id as string).split(':').slice(1).join(':');
    expandEntity(node.id);
    // Re-center on clicked node
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

    // Glow for focused
    if (isFocused) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
    }

    // Draw bubble
    ctx.beginPath();
    ctx.arc(meshNode.x, meshNode.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = isFocused ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isFocused ? 2 : 0.5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Label when zoomed in
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

    // Draw relationship label when zoomed
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            🫧 Mesh Bubble Map
          </CardTitle>
          <CardDescription>
            Interactive visualization of the reputation mesh. Click bubbles to expand connections, right-click to focus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter wallet, token mint, or @handle to focus..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleSearch}>
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
                  Paste a <span className="text-green-400 font-medium">wallet address</span>,{' '}
                  <span className="text-yellow-400 font-medium">token mint</span>, or{' '}
                  <span className="text-blue-400 font-medium">@handle</span> above to visualize its reputation mesh connections.
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Wallets</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Tokens</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> X Accounts</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" /> Telegram</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white border border-border inline-block" /> KYC Root</span>
                </div>
              </div>
            </div>
          ) : graphData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <p className="text-lg">🫧</p>
                <p className="text-sm text-muted-foreground">
                  No mesh data found for this entity. Try a different search.
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
