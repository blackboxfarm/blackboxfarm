import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  Brain, 
  Sparkles, 
  Search, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Target, 
  TrendingUp, 
  Shield, 
  AlertTriangle, 
  Clock,
  Zap,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Info
} from 'lucide-react';

// Types from the hook
interface AIKeyDriver {
  label: string;
  metric_value: string;
  bucket: string;
  implication: string;
}

interface AIReasoningStep {
  metric: string;
  value: string;
  threshold_category: string;
  phrase_selected: string;
}

interface AILifecycle {
  stage: 'Genesis' | 'Discovery' | 'Expansion' | 'Distribution' | 'Compression' | 'Dormant' | 'Reactivation';
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}

interface AIInterpretation {
  status_overview: string;
  lifecycle: AILifecycle;
  key_drivers: AIKeyDriver[];
  reasoning_trace: AIReasoningStep[];
  uncertainty_notes?: string[];
  abbreviated_summary: string;
}

interface MetricsContext {
  token_symbol?: string;
  token_name?: string;
  control_density?: { value: number; bucket: string };
  liquidity_coverage?: { value: number; bucket: string };
  resilience_score?: { value: number; bucket: string };
  tier_divergence?: { value: number; bucket: string };
  tier_distribution?: {
    dust?: { percent: string; count: number };
    retail?: { percent: string; count: number };
    serious?: { percent: string; count: number };
    whales?: { percent: string; count: number };
  };
  risk_flags?: string[];
  total_holders?: number;
  lp_percentage?: string;
  market_cap?: number;
}

interface AIInterpretationResponse {
  interpretation: AIInterpretation;
  mode: string;
  mode_label?: string;
  mode_reason?: string;
  cached: boolean;
  cached_at?: string;
  metrics_context?: MetricsContext;
}

const lifecycleBadgeColors: Record<string, string> = {
  Genesis: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Discovery: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Expansion: 'bg-green-500/20 text-green-300 border-green-500/30',
  Distribution: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Compression: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Dormant: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  Reactivation: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

const confidenceBadgeColors: Record<string, string> = {
  high: 'bg-green-500/20 text-green-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  low: 'bg-red-500/20 text-red-300',
};

const modeBadgeColors: Record<string, string> = {
  A: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  B: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  C: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  D: 'bg-green-500/20 text-green-300 border-green-500/30',
  E: 'bg-red-500/20 text-red-300 border-red-500/30',
  F: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  G: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  H: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
};

const modeDescriptions: Record<string, string> = {
  A: 'Snapshot - Balanced overview of holder structure',
  B: 'Structural - Focus on concentration dynamics',
  C: 'Behavioral Shift - Whale activity analysis',
  D: 'Lifecycle - Stage-based interpretation',
  E: 'Risk Posture - Priority on risk factors',
  F: 'Pressure Analysis - Selling pressure & liquidity',
  G: 'Capital Consensus - Tier divergence analysis',
  H: 'Retention - Diamond hands indicators',
};

export default function AIAnalysis() {
  const [tokenMint, setTokenMint] = useState('');
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [reportData, setReportData] = useState<Record<string, unknown> | null>(null);
  const [interpretation, setInterpretation] = useState<AIInterpretationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDrivers, setShowDrivers] = useState(true);
  const [showReasoning, setShowReasoning] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [eli5Mode, setEli5Mode] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchReport = useCallback(async () => {
    if (!tokenMint.trim()) {
      toast({ title: 'Enter a token address', variant: 'destructive' });
      return;
    }

    setIsLoadingReport(true);
    setError(null);
    setInterpretation(null);
    setReportData(null);

    try {
      // Normalize token mint
      let normalized = tokenMint.trim();
      if (normalized.length > 44 && normalized.endsWith('pump')) normalized = normalized.slice(0, -4);
      if (normalized.length > 44) normalized = normalized.slice(0, 44);

      const { data, error: reportError } = await supabase.functions.invoke('bagless-holders-report', {
        body: { tokenMint: normalized, manualPrice: 0 }
      });

      if (reportError) throw new Error(reportError.message);
      if (data?.error) throw new Error(data.error);

      setReportData(data);
      toast({ title: 'Report loaded', description: `${data.totalHolders} holders found` });

      // Auto-trigger AI analysis
      await fetchAIInterpretation(data, normalized);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load report';
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsLoadingReport(false);
    }
  }, [tokenMint, toast]);

  const fetchAIInterpretation = useCallback(async (report: Record<string, unknown>, mint: string, forceRefresh = false) => {
    setIsLoadingAI(true);
    setError(null);

    try {
      const { data, error: aiError } = await supabase.functions.invoke('token-ai-interpreter', {
        body: { reportData: report, tokenMint: mint, forceRefresh }
      });

      if (aiError) throw new Error(aiError.message);
      if (data?.error) throw new Error(data.error);

      setInterpretation(data as AIInterpretationResponse);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI interpretation failed';
      setError(message);
      toast({ title: 'AI Error', description: message, variant: 'destructive' });
    } finally {
      setIsLoadingAI(false);
    }
  }, [toast]);

  const handleRefresh = () => {
    if (reportData && tokenMint) {
      fetchAIInterpretation(reportData, tokenMint.trim(), true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') fetchReport();
  };

  // Auth gate
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <Brain className="h-12 w-12 text-purple-400 mx-auto mb-4" />
            <CardTitle>AI Token Analysis</CardTitle>
            <CardDescription>
              Sign in to access the AI-powered holder structure analysis dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link to="/auth">
              <Button className="w-full">Sign In to Continue</Button>
            </Link>
            <Link to="/holders" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Holders Intel
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/holders" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-purple-400" />
                <h1 className="text-xl font-bold">AI Token Analysis</h1>
              </div>
              <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/30">
                <Sparkles className="h-3 w-3 mr-1" />
                Beta
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="eli5-mode" className="text-sm text-muted-foreground">ELI5 Mode</Label>
                <Switch 
                  id="eli5-mode" 
                  checked={eli5Mode} 
                  onCheckedChange={setEli5Mode}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Token Input */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              Analyze Token
            </CardTitle>
            <CardDescription>
              Enter a Solana token address to get AI-powered holder structure analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="Enter token mint address..."
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 font-mono"
              />
              <Button 
                onClick={fetchReport} 
                disabled={isLoadingReport || isLoadingAI}
                className="min-w-[120px]"
              >
                {isLoadingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {(isLoadingReport || isLoadingAI) && (
          <Card className="bg-gradient-to-br from-purple-500/10 via-card to-blue-500/10 border-purple-500/30">
            <CardContent className="py-8">
              <div className="flex flex-col items-center gap-4">
                <Sparkles className="h-10 w-10 text-purple-400 animate-pulse" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium">
                    {isLoadingReport ? 'Fetching Holder Data...' : 'AI Analyzing Structure...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isLoadingReport 
                      ? 'Collecting holder distribution metrics'
                      : 'Processing metrics and generating interpretation'
                    }
                  </p>
                </div>
                <div className="w-64 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !isLoadingReport && !isLoadingAI && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-6">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <p>{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {interpretation && !isLoadingAI && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Interpretation Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Overview Card */}
              <Card className="bg-gradient-to-br from-purple-500/10 via-card to-blue-500/10 border-purple-500/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-purple-400" />
                      <CardTitle>AI Interpretation</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {interpretation.cached && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          Cached
                        </Badge>
                      )}
                      <Badge className={modeBadgeColors[interpretation.mode] || modeBadgeColors.A}>
                        Mode {interpretation.mode}: {interpretation.mode_label}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoadingAI}>
                        <RefreshCw className={`h-4 w-4 ${isLoadingAI ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Lifecycle Badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${lifecycleBadgeColors[interpretation.interpretation.lifecycle.stage]} border text-base px-3 py-1`}>
                      <Target className="h-4 w-4 mr-1" />
                      {interpretation.interpretation.lifecycle.stage}
                    </Badge>
                    <Badge className={`${confidenceBadgeColors[interpretation.interpretation.lifecycle.confidence]} text-sm`}>
                      {interpretation.interpretation.lifecycle.confidence} confidence
                    </Badge>
                  </div>

                  {/* Status Overview */}
                  <div className="space-y-2">
                    <p className="text-base leading-relaxed text-foreground/90">
                      {interpretation.interpretation.status_overview}
                    </p>
                    <p className="text-sm text-muted-foreground italic border-l-2 border-purple-500/30 pl-3">
                      {interpretation.interpretation.lifecycle.explanation}
                    </p>
                  </div>

                  {/* Abbreviated Summary */}
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Sparkles className="h-3 w-3" />
                      Social Summary
                    </div>
                    <p className="text-sm font-medium">{interpretation.interpretation.abbreviated_summary}</p>
                  </div>

                  {/* Uncertainty Notes */}
                  {interpretation.interpretation.uncertainty_notes && interpretation.interpretation.uncertainty_notes.length > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-200/80">
                        {interpretation.interpretation.uncertainty_notes.map((note, i) => (
                          <p key={i}>{note}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Key Drivers */}
              <Collapsible open={showDrivers} onOpenChange={setShowDrivers}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-blue-400" />
                          Key Drivers ({interpretation.interpretation.key_drivers.length})
                        </CardTitle>
                        {showDrivers ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-3">
                      {interpretation.interpretation.key_drivers.map((driver, i) => (
                        <div key={i} className="p-3 bg-muted/30 rounded-lg border border-border/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{driver.label}</span>
                            <Badge variant="outline">
                              {driver.metric_value} → {driver.bucket}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{driver.implication}</p>
                        </div>
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Reasoning Trace */}
              <Collapsible open={showReasoning} onOpenChange={setShowReasoning}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Shield className="h-5 w-5 text-green-400" />
                          Reasoning Trace
                        </CardTitle>
                        {showReasoning ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-2 font-mono text-xs bg-muted/20 p-4 rounded-lg border border-border/30 overflow-x-auto">
                        {interpretation.interpretation.reasoning_trace.map((step, i) => (
                          <div key={i} className="flex flex-wrap gap-2 items-center">
                            <span className="text-muted-foreground min-w-[120px]">{step.metric}:</span>
                            <span className="text-blue-300">{step.value}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-yellow-300">{step.threshold_category}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-300">"{step.phrase_selected}"</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Mode Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Commentary Modes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(modeDescriptions).map(([mode, desc]) => (
                    <div 
                      key={mode} 
                      className={`p-2 rounded text-xs ${
                        interpretation.mode === mode 
                          ? 'bg-purple-500/20 border border-purple-500/30' 
                          : 'bg-muted/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {interpretation.mode === mode && (
                          <CheckCircle className="h-3 w-3 text-purple-400" />
                        )}
                        <span className="font-medium">Mode {mode}</span>
                      </div>
                      <p className="text-muted-foreground mt-1">{desc.split(' - ')[1]}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Metrics Context */}
              {interpretation.metrics_context && (
                <Collapsible open={showMetrics} onOpenChange={setShowMetrics}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">Raw Metrics</CardTitle>
                          {showMetrics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="space-y-3 text-sm">
                          {interpretation.metrics_context.token_symbol && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Symbol</span>
                              <span className="font-medium">{interpretation.metrics_context.token_symbol}</span>
                            </div>
                          )}
                          {interpretation.metrics_context.total_holders !== undefined && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Holders</span>
                              <span className="font-medium">{interpretation.metrics_context.total_holders.toLocaleString()}</span>
                            </div>
                          )}
                          {interpretation.metrics_context.control_density && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Control Density</span>
                              <Badge variant="outline" className="text-xs">
                                {interpretation.metrics_context.control_density.bucket}
                              </Badge>
                            </div>
                          )}
                          {interpretation.metrics_context.liquidity_coverage && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Liquidity Coverage</span>
                              <Badge variant="outline" className="text-xs">
                                {interpretation.metrics_context.liquidity_coverage.bucket}
                              </Badge>
                            </div>
                          )}
                          {interpretation.metrics_context.resilience_score && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Resilience</span>
                              <Badge variant="outline" className="text-xs">
                                {interpretation.metrics_context.resilience_score.bucket}
                              </Badge>
                            </div>
                          )}
                          {interpretation.metrics_context.risk_flags && interpretation.metrics_context.risk_flags.length > 0 && (
                            <div>
                              <span className="text-muted-foreground block mb-1">Risk Flags</span>
                              <div className="flex flex-wrap gap-1">
                                {interpretation.metrics_context.risk_flags.map((flag, i) => (
                                  <Badge key={i} variant="destructive" className="text-xs">
                                    {flag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!interpretation && !isLoadingReport && !isLoadingAI && !error && (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <Brain className="h-16 w-16 text-muted-foreground/30" />
                <div>
                  <h3 className="text-lg font-medium mb-1">No Token Selected</h3>
                  <p className="text-muted-foreground">
                    Enter a token address above to get started with AI-powered analysis
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
