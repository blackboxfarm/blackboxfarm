import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp, Sparkles, AlertTriangle, RefreshCw, Clock, Target, TrendingUp, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { useTokenAIInterpretation, AIInterpretationResponse } from '@/hooks/useTokenAIInterpretation';

interface AIInterpretationPanelProps {
  reportData: Record<string, unknown>;
  tokenMint: string;
  isEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
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

export function AIInterpretationPanel({ 
  reportData, 
  tokenMint, 
  isEnabled = true,
  onToggle 
}: AIInterpretationPanelProps) {
  const { interpretation, isLoading, error, fetchInterpretation, reset } = useTokenAIInterpretation();
  const [showDrivers, setShowDrivers] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [localEnabled, setLocalEnabled] = useState(isEnabled);

  // Fetch interpretation when component mounts or token changes
  useEffect(() => {
    if (localEnabled && tokenMint && Object.keys(reportData).length > 0) {
      fetchInterpretation(reportData, tokenMint);
    } else {
      reset();
    }
  }, [tokenMint, localEnabled]);

  const handleToggle = (enabled: boolean) => {
    setLocalEnabled(enabled);
    onToggle?.(enabled);
    if (!enabled) {
      reset();
    }
  };

  const handleRefresh = () => {
    fetchInterpretation(reportData, tokenMint, true);
  };

  if (!localEnabled) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg text-muted-foreground">AI Analysis</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Enable</span>
              <Switch checked={localEnabled} onCheckedChange={handleToggle} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Toggle on to get AI-powered interpretation of this token's holder structure.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-purple-500/10 via-card to-blue-500/10 border-purple-500/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400 animate-pulse" />
              <CardTitle className="text-lg">AI Analyzing...</CardTitle>
            </div>
            <Switch checked={localEnabled} onCheckedChange={handleToggle} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/50 border-destructive/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-lg">AI Analysis Error</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Switch checked={localEnabled} onCheckedChange={handleToggle} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!interpretation) {
    return null;
  }

  const { interpretation: data, mode_label, cached, cached_at } = interpretation;

  return (
    <Card className="bg-gradient-to-br from-purple-500/10 via-card to-blue-500/10 border-purple-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            <CardTitle className="text-lg">AI Interpretation</CardTitle>
            {mode_label && (
              <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                {mode_label} Mode
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cached && cached_at && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Cached</span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Switch checked={localEnabled} onCheckedChange={handleToggle} />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Lifecycle Badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${lifecycleBadgeColors[data.lifecycle.stage]} border`}>
            <Target className="h-3 w-3 mr-1" />
            {data.lifecycle.stage}
          </Badge>
          <Badge className={confidenceBadgeColors[data.lifecycle.confidence]}>
            {data.lifecycle.confidence} confidence
          </Badge>
        </div>

        {/* Status Overview */}
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-foreground/90">
            {data.status_overview}
          </p>
          <p className="text-xs text-muted-foreground italic">
            {data.lifecycle.explanation}
          </p>
        </div>

        {/* Uncertainty Notes */}
        {data.uncertainty_notes && data.uncertainty_notes.length > 0 && (
          <div className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
            <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-200/80">
              {data.uncertainty_notes.map((note, i) => (
                <p key={i}>{note}</p>
              ))}
            </div>
          </div>
        )}

        {/* Key Drivers Collapsible */}
        <Collapsible open={showDrivers} onOpenChange={setShowDrivers}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <span className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-blue-400" />
                Key Drivers ({data.key_drivers.length})
              </span>
              {showDrivers ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {data.key_drivers.map((driver, i) => (
              <div key={i} className="p-2 bg-muted/30 rounded-md border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{driver.label}</span>
                  <Badge variant="outline" className="text-xs">
                    {driver.metric_value} → {driver.bucket}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{driver.implication}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        {/* Reasoning Trace Collapsible */}
        <Collapsible open={showReasoning} onOpenChange={setShowReasoning}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <span className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-green-400" />
                Why this interpretation?
              </span>
              {showReasoning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-1 text-xs font-mono bg-muted/20 p-3 rounded-md border border-border/30">
              {data.reasoning_trace.map((step, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground">{step.metric}:</span>
                  <span className="text-blue-300">{step.value}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-yellow-300">{step.threshold_category}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-green-300">"{step.phrase_selected}"</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}