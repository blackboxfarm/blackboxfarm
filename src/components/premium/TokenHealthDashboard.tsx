import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

interface TokenHealthDashboardProps {
  lpPercentage: number;
  top10Concentration: number;
  holderChange24h: number;
  lpDetectionConfidence?: number;
}

export function TokenHealthDashboard({
  lpPercentage,
  top10Concentration,
  holderChange24h,
  lpDetectionConfidence = 100
}: TokenHealthDashboardProps) {
  // Calculate risk score (0-100, where 100 is healthiest)
  const calculateRiskScore = (): number => {
    let score = 100;
    
    // LP percentage impact (0-30 points penalty)
    if (lpPercentage === 0) {
      score -= 30; // No LP detected = highest penalty
    } else if (lpPercentage < 5) {
      score -= 25; // Very low LP
    } else if (lpPercentage < 10) {
      score -= 15; // Low LP
    } else if (lpPercentage < 20) {
      score -= 5; // Acceptable LP
    }
    
    // Top 10 concentration impact (0-35 points penalty)
    if (top10Concentration > 80) {
      score -= 35; // Extreme concentration
    } else if (top10Concentration > 70) {
      score -= 25; // Very high concentration
    } else if (top10Concentration > 60) {
      score -= 15; // High concentration
    } else if (top10Concentration > 50) {
      score -= 5; // Moderate concentration
    }
    
    // 24h holder change impact (0-25 points penalty)
    if (holderChange24h < -20) {
      score -= 25; // Massive decline
    } else if (holderChange24h < -10) {
      score -= 15; // Significant decline
    } else if (holderChange24h < -5) {
      score -= 8; // Moderate decline
    } else if (holderChange24h > 10) {
      score += 5; // Bonus for growth
    }
    
    // LP detection confidence penalty
    if (lpDetectionConfidence < 80) {
      score -= 10; // Uncertain LP detection
    }
    
    return Math.max(0, Math.min(100, score));
  };

  const riskScore = calculateRiskScore();
  
  const getRiskLevel = (score: number): { label: string; color: string; bgColor: string } => {
    if (score >= 75) return { label: "Healthy", color: "text-emerald-400", bgColor: "bg-emerald-500/20 border-emerald-500/30" };
    if (score >= 60) return { label: "Moderate", color: "text-yellow-400", bgColor: "bg-yellow-500/20 border-yellow-500/30" };
    if (score >= 40) return { label: "Caution", color: "text-orange-400", bgColor: "bg-orange-500/20 border-orange-500/30" };
    return { label: "High Risk", color: "text-red-400", bgColor: "bg-red-500/20 border-red-500/30" };
  };

  const risk = getRiskLevel(riskScore);

  const getMetricColor = (value: number, type: 'lp' | 'concentration' | 'holderChange'): string => {
    switch (type) {
      case 'lp':
        if (value === 0) return "text-red-400";
        if (value < 5) return "text-orange-400";
        if (value < 10) return "text-yellow-400";
        return "text-emerald-400";
      case 'concentration':
        if (value > 80) return "text-red-400";
        if (value > 70) return "text-orange-400";
        if (value > 60) return "text-yellow-400";
        return "text-emerald-400";
      case 'holderChange':
        if (value < -10) return "text-red-400";
        if (value < -5) return "text-orange-400";
        if (value < 0) return "text-yellow-400";
        return "text-emerald-400";
      default:
        return "text-foreground";
    }
  };

  return (
    <Card className={`border-2 ${risk.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Token Health Score</CardTitle>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${risk.bgColor}`}>
            {riskScore < 60 && <AlertTriangle className="h-5 w-5" />}
            <span className={`text-2xl font-bold ${risk.color}`}>{riskScore}/100</span>
            <span className={`text-sm ${risk.color}`}>{risk.label}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Score Progress Bar */}
        <div className="space-y-2">
          <Progress value={riskScore} className="h-3" />
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {/* LP Percentage */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">LP Holdings</p>
            <p className={`text-2xl font-bold ${getMetricColor(lpPercentage, 'lp')}`}>
              {lpPercentage.toFixed(1)}%
            </p>
            {lpPercentage === 0 && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Not detected
              </p>
            )}
          </div>

          {/* Top 10 Concentration */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Top 10 Hold</p>
            <p className={`text-2xl font-bold ${getMetricColor(top10Concentration, 'concentration')}`}>
              {top10Concentration.toFixed(1)}%
            </p>
            {top10Concentration > 70 && (
              <p className="text-xs text-orange-400">High risk</p>
            )}
          </div>

          {/* 24h Holder Change */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">24h Holders</p>
            <p className={`text-2xl font-bold flex items-center gap-1 ${getMetricColor(holderChange24h, 'holderChange')}`}>
              {holderChange24h > 0 ? (
                <TrendingUp className="h-5 w-5" />
              ) : holderChange24h < 0 ? (
                <TrendingDown className="h-5 w-5" />
              ) : null}
              {holderChange24h > 0 ? '+' : ''}{holderChange24h.toFixed(1)}%
            </p>
          </div>

          {/* Concentration Risk Badge */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Risk Level</p>
            <div className={`text-sm font-semibold px-3 py-2 rounded-lg ${risk.bgColor} ${risk.color} flex items-center gap-2`}>
              {riskScore < 60 && <AlertTriangle className="h-4 w-4" />}
              {risk.label}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
