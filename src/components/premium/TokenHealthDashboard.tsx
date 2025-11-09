import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

interface TokenHealthDashboardProps {
  lpPercentage: number;
  top10Concentration: number;
  lpDetectionConfidence?: number;
}

export function TokenHealthDashboard({ 
  lpPercentage, 
  top10Concentration, 
  lpDetectionConfidence = 100 
}: TokenHealthDashboardProps) {
  // Calculate risk score (0-100, where 100 is healthiest)
  const calculateRiskScore = () => {
    let score = 100;
    
    // LP percentage penalties
    if (lpPercentage === 0) {
      score -= 40; // Critical: No LP detected
    } else if (lpPercentage < 5) {
      score -= 30; // Very low LP
    } else if (lpPercentage < 10) {
      score -= 20; // Low LP
    } else if (lpPercentage < 15) {
      score -= 10; // Moderate LP
    }
    
    // Top 10 concentration penalties
    if (top10Concentration > 80) {
      score -= 30; // Extremely concentrated
    } else if (top10Concentration > 60) {
      score -= 20; // Very concentrated
    } else if (top10Concentration > 40) {
      score -= 10; // Concentrated
    }
    
    // LP detection confidence penalty
    if (lpDetectionConfidence < 50) {
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

  const getMetricColor = (value: number, type: 'lp' | 'concentration') => {
    if (type === 'lp') {
      if (value === 0) return 'text-red-400';
      if (value < 5) return 'text-orange-400';
      if (value < 10) return 'text-yellow-400';
      return 'text-green-400';
    }
    
    if (type === 'concentration') {
      if (value > 80) return 'text-red-400';
      if (value > 60) return 'text-orange-400';
      if (value > 40) return 'text-yellow-400';
      return 'text-green-400';
    }
    
    return 'text-muted-foreground';
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
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">LP Locked</p>
            <p className={`text-2xl font-bold ${getMetricColor(lpPercentage, 'lp')}`}>
              {lpPercentage.toFixed(1)}%
            </p>
            {lpDetectionConfidence < 100 && (
              <p className="text-xs text-yellow-400">~{lpDetectionConfidence}% confidence</p>
            )}
          </div>
          
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Top 10 Concentration</p>
            <p className={`text-2xl font-bold ${getMetricColor(top10Concentration, 'concentration')}`}>
              {top10Concentration.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
