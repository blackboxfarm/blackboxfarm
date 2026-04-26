import React, { useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { ENTITY_COLORS, MeshNode } from '@/hooks/useMeshGraph';

interface BubbleMap3DProps {
  graphData: { nodes: any[]; links: any[] };
  width: number;
  height?: number;
  onNodeClick?: (node: any) => void;
  onNodeHover?: (node: any) => void;
}

const BubbleMap3D: React.FC<BubbleMap3DProps> = ({
  graphData,
  width,
  height = 600,
  onNodeClick,
  onNodeHover,
}) => {
  const fgRef = useRef<any>();

  // Slow auto-rotate that stops on user interaction.
  useEffect(() => {
    if (!fgRef.current) return;
    const controls = fgRef.current.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
      const stop = () => { controls.autoRotate = false; };
      controls.addEventListener?.('start', stop);
      return () => controls.removeEventListener?.('start', stop);
    }
  }, [graphData]);

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      backgroundColor="#05060a"
      nodeColor={(node: any) => ENTITY_COLORS[(node as MeshNode).type] || '#ffffff'}
      nodeVal={(node: any) => Math.max(1, (node as MeshNode).val || 1)}
      nodeOpacity={0.92}
      nodeResolution={12}
      nodeLabel={(node: any) => {
        const n = node as MeshNode;
        const id = n.fullId || n.id.split(':').slice(1).join(':');
        const name = n.displayName ? `${n.displayName}\n` : '';
        return `${name}${n.type}\n${id}`;
      }}
      linkColor={(link: any) => {
        const rel = link.relationship || '';
        if (rel.includes('funded')) return 'rgba(234,179,8,0.55)';
        if (rel.includes('created')) return 'rgba(255,255,255,0.4)';
        return 'rgba(120,120,160,0.25)';
      }}
      linkOpacity={0.6}
      linkWidth={0.6}
      linkDirectionalParticles={1}
      linkDirectionalParticleSpeed={0.004}
      linkDirectionalParticleWidth={1.5}
      onNodeClick={onNodeClick}
      onNodeHover={onNodeHover}
      enableNodeDrag={true}
      showNavInfo={false}
    />
  );
};

export default BubbleMap3D;