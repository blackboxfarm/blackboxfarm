import React, { useRef, useEffect, useCallback } from 'react';

interface MinimapNode {
  x?: number;
  y?: number;
  color?: string;
  type?: string;
}

interface BubbleMapMinimapProps {
  graphRef: React.MutableRefObject<any>;
  nodes: MinimapNode[];
  width?: number;
  height?: number;
  className?: string;
}

const TYPE_COLORS: Record<string, string> = {
  token: '#eab308',
  wallet: '#22c55e',
  x_community: '#3b82f6',
  x_account: '#60a5fa',
  kyc_root: '#ef4444',
  website: '#a855f7',
};

const BubbleMapMinimap: React.FC<BubbleMapMinimapProps> = ({
  graphRef,
  nodes,
  width = 120,
  height = 80,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, width, height);

    // Compute bounds of all nodes
    const validNodes = nodes.filter(n => n.x != null && n.y != null);
    if (validNodes.length === 0) return;

    const xs = validNodes.map(n => n.x!);
    const ys = validNodes.map(n => n.y!);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 6;
    const scaleX = (width - pad * 2) / rangeX;
    const scaleY = (height - pad * 2) / rangeY;

    // Draw dots
    for (const node of validNodes) {
      const px = pad + (node.x! - minX) * scaleX;
      const py = pad + (node.y! - minY) * scaleY;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLORS[node.type || ''] || '#888';
      ctx.fill();
    }

    // Draw viewport rectangle if graph is available
    try {
      const graph = graphRef.current;
      if (graph) {
        // Get current viewport center and zoom
        const center = graph.centerAt?.();
        const zoom = graph.zoom?.();
        if (center && zoom) {
          // Approximate viewport size in graph coords
          const vw = (width / zoom) * 4;
          const vh = (height / zoom) * 4;
          const vx = pad + ((center.x || 0) - vw / 2 - minX) * scaleX;
          const vy = pad + ((center.y || 0) - vh / 2 - minY) * scaleY;
          const vWidth = vw * scaleX;
          const vHeight = vh * scaleY;

          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.strokeRect(vx, vy, vWidth, vHeight);
        }
      }
    } catch {
      // Viewport rect is optional
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [nodes, width, height, graphRef]);

  useEffect(() => {
    draw();
    const interval = setInterval(draw, 2000);
    return () => clearInterval(interval);
  }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const graph = graphRef.current;
    if (!canvas || !graph || nodes.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const validNodes = nodes.filter(n => n.x != null && n.y != null);
    if (validNodes.length === 0) return;

    const xs = validNodes.map(n => n.x!);
    const ys = validNodes.map(n => n.y!);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 6;

    // Map click position back to graph coordinates
    const graphX = minX + ((clickX - pad) / (width - pad * 2)) * rangeX;
    const graphY = minY + ((clickY - pad) / (height - pad * 2)) * rangeY;

    graph.centerAt(graphX, graphY, 800);
  }, [nodes, width, height, graphRef]);

  if (nodes.length <= 10) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const w = isMobile ? 60 : width;
  const h = isMobile ? 40 : height;

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className={`absolute top-2 right-2 z-20 cursor-crosshair rounded opacity-80 hover:opacity-100 transition-opacity ${className}`}
      style={{ width: w, height: h }}
      title="Click to navigate"
    />
  );
};

export default BubbleMapMinimap;
