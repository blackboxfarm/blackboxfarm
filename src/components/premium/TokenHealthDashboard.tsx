import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Activity, Clock, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface HealthBreakdownItem {
  score: number;
  weight: number;
  contribution: number;
}

interface TokenHealthDashboardProps {
  lpPercentage: number;
  top10Concentration: number;
  lpDetectionConfidence?: number;
  healthScore?: number;
  healthGrade?: string;
  healthPhase?: string;
  healthBreakdown?: Record<string, HealthBreakdownItem>;
  vitalityPenalties?: string[];
  pairAgeHours?: number | null;
  structuralScore?: number;
  activityScore?: number;
  momentumGrade?: string;
}

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  on_curve: { label: "On Curve", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  newborn: { label: "Newborn", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  early: { label: "Early", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  adolescent: { label: "Adolescent", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  fresh: { label: "Freshly Bonded", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  established: { label: "Established", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  growth: { label: "Growth", color: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  mature: { label: "Mature", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  blue_chip: { label: "Blue Chip", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
};

const METRIC_LABELS: Record<string, string> = {
  holders: "Holder Count",
  whales: "Whale Spread",
  dev: "Dev Behavior",
  buySell: "Buy/Sell Ratio",
  bundled: "Insider Risk",
  lp: "LP Locked",
  volume: "Volume Trend",
  price: "Price Trend",
  dust: "Dust Ratio",
};

function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-emerald-400';
  if (grade.startsWith('B')) return 'text-blue-400';
  if (grade.startsWith('C')) return 'text-yellow-400';
  if (grade.startsWith('D')) return 'text-orange-400';
  return 'text-red-400';
}

function getGradeBg(grade: string): string {
  if (grade.startsWith('A')) return 'bg-emerald-500/20 border-emerald-500/30';
  if (grade.startsWith('B')) return 'bg-blue-500/20 border-blue-500/30';
  if (grade.startsWith('C')) return 'bg-yellow-500/20 border-yellow-500/30';
  if (grade.startsWith('D')) return 'bg-orange-500/20 border-orange-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

export function TokenHealthDashboard({
  lpPercentage,
  top10Concentration,
  lpDetectionConfidence = 100,
  healthScore,
  healthGrade,
  healthPhase,
  healthBreakdown,
  vitalityPenalties,
  pairAgeHours,
  structuralScore,
  activityScore,
  momentumGrade,
}: TokenHealthDashboardProps) {
  const score = healthScore ?? calculateLegacyScore(lpPercentage, top10Concentration, lpDetectionConfidence);
  const grade = healthGrade ?? scoreToGrade(score);
  const momentum = momentumGrade ?? scoreToGrade(activityScore ?? score);

  const getRiskLevel = (s: number) => {
    if (s >= 75) return { label: "Healthy", color: "text-emerald-400", bgColor: "bg-emerald-500/20 border-emerald-500/30" };
    if (s >= 60) return { label: "Moderate", color: "text-yellow-400", bgColor: "bg-yellow-500/20 border-yellow-500/30" };
    if (s >= 40) return { label: "Caution", color: "text-orange-400", bgColor: "bg-orange-500/20 border-orange-500/30" };
    return { label: "High Risk", color: "text-red-400", bgColor: "bg-red-500/20 border-red-500/30" };
  };

  const risk = getRiskLevel(score);
  const phase = healthPhase ? PHASE_LABELS[healthPhase] : null;

  return (
    <Card className={`border-2 ${risk.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">Token Health Score</CardTitle>
            {phase && (
              <Badge variant="outline" className={`text-xs ${phase.color}`}>
                <Clock className="h-3 w-3 mr-1" />
                {phase.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Main grade */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${risk.bgColor}`}>
              {score < 60 && <AlertTriangle className="h-5 w-5" />}
              <span className={`text-2xl font-bold ${getGradeColor(grade)}`}>{grade}</span>
              <span className={`text-sm ${risk.color}`}>{score}/100</span>
            </div>
            {/* Momentum badge */}
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${getGradeBg(momentum)}`}>
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs text-muted-foreground">Momentum</span>
              <span className={`text-sm font-bold ${getGradeColor(momentum)}`}>{momentum}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={score} className="h-3" />

        {/* Three-dimension scores */}
        {(structuralScore !== undefined || activityScore !== undefined) && (
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1 text-center">
              <p className="text-xs text-muted-foreground">Structural</p>
              <p className={`text-lg font-bold ${getGradeColor(scoreToGrade(structuralScore ?? score))}`}>
                {structuralScore ?? '—'}
              </p>
            </div>
            <div className="space-y-1 text-center">
              <p className="text-xs text-muted-foreground">Activity</p>
              <p className={`text-lg font-bold ${getGradeColor(scoreToGrade(activityScore ?? score))}`}>
                {activityScore ?? '—'}
              </p>
            </div>
            <div className="space-y-1 text-center">
              <p className="text-xs text-muted-foreground">Blended</p>
              <p className={`text-lg font-bold ${getGradeColor(grade)}`}>{score}</p>
            </div>
          </div>
        )}

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

        {/* Breakdown (if available) */}
        {healthBreakdown && Object.keys(healthBreakdown).length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Score Breakdown
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(healthBreakdown).map(([key, item]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{METRIC_LABELS[key] || key}</span>
                  <span className={item.score >= 70 ? 'text-emerald-400' : item.score >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                    {item.score} <span className="text-muted-foreground/60">×{(item.weight * 100).toFixed(0)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vitality Penalties */}
        {vitalityPenalties && vitalityPenalties.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-red-500/20">
            <p className="text-xs font-medium text-red-400">⚠️ Vitality Penalties</p>
            {vitalityPenalties.map((p, i) => (
              <p key={i} className="text-xs text-red-400/80">• {p}</p>
            ))}
          </div>
        )}

        {pairAgeHours != null && (
          <p className="text-xs text-muted-foreground">
            Pair age: {pairAgeHours < 24 ? `${pairAgeHours}h` : `${Math.round(pairAgeHours / 24)}d`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function scoreToGrade(s: number): string {
  if (s >= 97) return 'A++';
  if (s >= 93) return 'A+';
  if (s >= 89) return 'A';
  if (s >= 85) return 'A-';
  if (s >= 80) return 'B+';
  if (s >= 75) return 'B';
  if (s >= 70) return 'B-';
  if (s >= 65) return 'C+';
  if (s >= 60) return 'C';
  if (s >= 55) return 'C-';
  if (s >= 50) return 'D+';
  if (s >= 45) return 'D';
  if (s >= 40) return 'D-';
  return 'F';
}

function calculateLegacyScore(lpPct: number, top10: number, confidence: number): number {
  let s = 100;
  if (lpPct === 0) s -= 40; else if (lpPct < 5) s -= 30; else if (lpPct < 10) s -= 20; else if (lpPct < 15) s -= 10;
  if (top10 > 80) s -= 30; else if (top10 > 60) s -= 20; else if (top10 > 40) s -= 10;
  if (confidence < 50) s -= 10;
  return Math.max(0, Math.min(100, s));
}

function getMetricColor(value: number, type: 'lp' | 'concentration') {
  if (type === 'lp') {
    if (value === 0) return 'text-red-400';
    if (value < 5) return 'text-orange-400';
    if (value < 10) return 'text-yellow-400';
    return 'text-green-400';
  }
  if (value > 80) return 'text-red-400';
  if (value > 60) return 'text-orange-400';
  if (value > 40) return 'text-yellow-400';
  return 'text-green-400';
}
