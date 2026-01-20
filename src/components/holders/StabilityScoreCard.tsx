import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StabilityData {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  emoji: string;
  label: string;
  whalePercentage: number;
  breakdown: {
    whaleScore: number;
    distributionScore: number;
    lpScore: number;
    holderCountScore: number;
  };
}

interface StabilityScoreCardProps {
  data: StabilityData;
}

export function StabilityScoreCard({ data }: StabilityScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRiskBgColor = () => {
    switch (data.riskLevel) {
      case 'low': return 'bg-green-500/10 border-green-500/20';
      case 'medium': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'high': return 'bg-red-500/10 border-red-500/20';
    }
  };

  const RiskIcon = data.riskLevel === 'low' ? TrendingUp : data.riskLevel === 'high' ? TrendingDown : Minus;

  return (
    <Card className={`border ${getRiskBgColor()}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RiskIcon className={`h-5 w-5 ${getScoreColor(data.score)}`} />
            Stability Score
          </div>
          <div className={`text-2xl font-bold ${getScoreColor(data.score)}`}>
            {data.emoji} {data.score}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{data.label}</span>
            <span>{data.score}/100</span>
          </div>
          <div className="h-3 bg-muted/50 rounded-full overflow-hidden">
            <div 
              className={`h-full ${getProgressColor(data.score)} transition-all duration-500`}
              style={{ width: `${data.score}%` }}
            />
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Whale Score</p>
            <div className="flex items-center gap-2">
              <Progress value={data.breakdown.whaleScore} className="h-1.5 flex-1" />
              <span className="text-xs font-medium">{data.breakdown.whaleScore}</span>
            </div>
          </div>
          <div className="p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Distribution</p>
            <div className="flex items-center gap-2">
              <Progress value={data.breakdown.distributionScore} className="h-1.5 flex-1" />
              <span className="text-xs font-medium">{data.breakdown.distributionScore}</span>
            </div>
          </div>
          <div className="p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">LP Health</p>
            <div className="flex items-center gap-2">
              <Progress value={data.breakdown.lpScore} className="h-1.5 flex-1" />
              <span className="text-xs font-medium">{data.breakdown.lpScore}</span>
            </div>
          </div>
          <div className="p-2 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Holder Count</p>
            <div className="flex items-center gap-2">
              <Progress value={data.breakdown.holderCountScore} className="h-1.5 flex-1" />
              <span className="text-xs font-medium">{data.breakdown.holderCountScore}</span>
            </div>
          </div>
        </div>

        {/* Whale Concentration */}
        <div className="text-xs text-center text-muted-foreground">
          Top whale concentration: <span className="font-medium text-foreground">{data.whalePercentage.toFixed(1)}%</span> of supply
        </div>
      </CardContent>
    </Card>
  );
}
