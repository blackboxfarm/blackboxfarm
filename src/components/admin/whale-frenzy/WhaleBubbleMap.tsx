import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, SkipBack, FastForward } from 'lucide-react';
import { format } from 'date-fns';

interface WhaleBuy {
  wallet_address: string;
  nickname?: string;
  timestamp: string;
  amount_sol?: number;
}

interface BubbleMapProps {
  tokenMint: string;
  tokenSymbol?: string;
  buyTimeline: WhaleBuy[];
  frenzyDetectedAt: string;
  whaleCount: number;
}

export function WhaleBubbleMap({ 
  tokenMint, 
  tokenSymbol, 
  buyTimeline, 
  frenzyDetectedAt,
  whaleCount 
}: BubbleMapProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const animationRef = useRef<number | null>(null);
  
  const sortedBuys = [...buyTimeline].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  const timeStart = sortedBuys.length > 0 ? new Date(sortedBuys[0].timestamp).getTime() : 0;
  const timeEnd = new Date(frenzyDetectedAt).getTime();
  const totalDuration = timeEnd - timeStart;
  
  const visibleBuys = sortedBuys.filter(buy => 
    new Date(buy.timestamp).getTime() <= timeStart + (currentTime / 100) * totalDuration
  );

  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now();
      const startProgress = currentTime;
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = startProgress + (elapsed / (totalDuration / playbackSpeed)) * 100;
        
        if (progress >= 100) {
          setCurrentTime(100);
          setIsPlaying(false);
        } else {
          setCurrentTime(progress);
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      
      animationRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, totalDuration]);

  const getWhaleBubblePosition = (index: number, total: number, isActive: boolean) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radius = isActive ? 80 : 120;
    const x = 150 + Math.cos(angle) * radius;
    const y = 150 + Math.sin(angle) * radius;
    return { x, y };
  };

  const currentTimeFormatted = totalDuration > 0 
    ? format(new Date(timeStart + (currentTime / 100) * totalDuration), 'HH:mm:ss')
    : '--:--:--';

  return (
    <Card className="bg-card/50 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Whale Convergence Map</span>
          <Badge variant="secondary">
            {tokenSymbol || tokenMint.slice(0, 8)}...
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SVG Bubble Map */}
        <div className="relative bg-background/50 rounded-lg overflow-hidden">
          <svg viewBox="0 0 300 300" className="w-full h-64">
            {/* Background grid */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
              <radialGradient id="tokenGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <rect width="300" height="300" fill="url(#grid)"/>
            
            {/* Pulsing center glow when frenzy active */}
            {visibleBuys.length >= whaleCount && (
              <circle cx="150" cy="150" r="60" fill="url(#tokenGlow)" className="animate-pulse"/>
            )}
            
            {/* Connection lines from active whales to center */}
            {sortedBuys.map((buy, i) => {
              const isActive = visibleBuys.includes(buy);
              const pos = getWhaleBubblePosition(i, sortedBuys.length, isActive);
              return (
                <line
                  key={`line-${i}`}
                  x1={pos.x}
                  y1={pos.y}
                  x2={150}
                  y2={150}
                  stroke={isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                  strokeWidth={isActive ? 2 : 0.5}
                  strokeDasharray={isActive ? '' : '4,4'}
                  opacity={isActive ? 0.8 : 0.2}
                  className="transition-all duration-500"
                />
              );
            })}
            
            {/* Central token */}
            <circle 
              cx="150" 
              cy="150" 
              r={30 + visibleBuys.length * 3} 
              fill="hsl(var(--primary))"
              opacity={0.2 + visibleBuys.length * 0.1}
              className="transition-all duration-300"
            />
            <circle cx="150" cy="150" r="25" fill="hsl(var(--primary))"/>
            <text 
              x="150" 
              y="145" 
              textAnchor="middle" 
              fill="hsl(var(--primary-foreground))" 
              fontSize="8" 
              fontWeight="bold"
            >
              {tokenSymbol || 'TOKEN'}
            </text>
            <text 
              x="150" 
              y="158" 
              textAnchor="middle" 
              fill="hsl(var(--primary-foreground))" 
              fontSize="12" 
              fontWeight="bold"
            >
              {visibleBuys.length}/{whaleCount}
            </text>
            
            {/* Whale bubbles */}
            {sortedBuys.map((buy, i) => {
              const isActive = visibleBuys.includes(buy);
              const pos = getWhaleBubblePosition(i, sortedBuys.length, isActive);
              return (
                <g key={i} className="transition-all duration-500">
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isActive ? 18 : 12}
                    fill={isActive ? 'hsl(142 76% 36%)' : 'hsl(var(--muted))'}
                    stroke={isActive ? 'hsl(142 76% 46%)' : 'hsl(var(--border))'}
                    strokeWidth="2"
                    className="transition-all duration-500"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 4}
                    textAnchor="middle"
                    fill={isActive ? 'white' : 'hsl(var(--muted-foreground))'}
                    fontSize="10"
                    fontWeight="bold"
                  >
                    🐋
                  </text>
                  {buy.nickname && isActive && (
                    <text
                      x={pos.x}
                      y={pos.y + 30}
                      textAnchor="middle"
                      fill="hsl(var(--foreground))"
                      fontSize="8"
                    >
                      {buy.nickname.slice(0, 10)}
                    </text>
                  )}
                </g>
              );
            })}
            
            {/* Frenzy indicator */}
            {visibleBuys.length >= whaleCount && (
              <g>
                <text
                  x="150"
                  y="280"
                  textAnchor="middle"
                  fill="hsl(var(--destructive))"
                  fontSize="14"
                  fontWeight="bold"
                  className="animate-pulse"
                >
                  🔥 FRENZY DETECTED! 🔥
                </text>
              </g>
            )}
          </svg>
        </div>
        
        {/* Timeline Controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => { setCurrentTime(0); setIsPlaying(false); }}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlaybackSpeed(prev => prev === 4 ? 1 : prev * 2)}
            >
              {playbackSpeed}x
            </Button>
            <div className="flex-1">
              <Slider
                value={[currentTime]}
                onValueChange={([v]) => setCurrentTime(v)}
                max={100}
                step={1}
              />
            </div>
            <span className="text-sm font-mono text-muted-foreground w-20 text-right">
              {currentTimeFormatted}
            </span>
          </div>
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{sortedBuys[0] ? format(new Date(sortedBuys[0].timestamp), 'HH:mm:ss') : '--:--:--'}</span>
            <span>{format(new Date(frenzyDetectedAt), 'HH:mm:ss')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
