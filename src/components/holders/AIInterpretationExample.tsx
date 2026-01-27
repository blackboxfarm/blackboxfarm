import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, ChevronDown, Lightbulb, Target, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

// Example AI interpretation data - baked in for demo purposes
const exampleInterpretation = {
  status_overview: "A mature holder count of 546 combined with 61.9% of supply held by 'Serious' tiers and 'Whales' indicates a transition from early discovery into a structured growth phase. Control density sits in the coordinated-capable range at 42.5%, suggesting a handful of holders could influence price sensitivity if they act in concert. Liquidity coverage is thin with a 3.2x unlocked-to-LP ratio, meaning sudden exits could create outsized price impact. The resilience score of 68 indicates moderate structural stability, though the high dust percentage (24.3%) suggests some early participants have abandoned positions.",
  lifecycle: {
    stage: "Expansion" as const,
    confidence: "high" as const,
    explanation: "Holder count exceeds 500 with strong serious+whale tier representation (61.9%), indicating mature distribution patterns characteristic of the Expansion phase."
  },
  key_drivers: [
    {
      label: "Control Density",
      metric_value: "42.5%",
      bucket: "coordinated-capable",
      implication: "Top holders could coordinate price-sensitive actions if aligned"
    },
    {
      label: "Liquidity Coverage",
      metric_value: "3.2x ratio",
      bucket: "thin",
      implication: "Exit pressure may amplify price movements beyond normal volatility"
    },
    {
      label: "Resilience Score",
      metric_value: "68/100",
      bucket: "moderate",
      implication: "Structure can absorb moderate stress but may fracture under sustained pressure"
    },
    {
      label: "Whale Concentration",
      metric_value: "18.4%",
      bucket: "moderate",
      implication: "Whale tier holds meaningful but not dominant supply share"
    }
  ],
  reasoning_trace: [
    {
      metric: "total_holders",
      value: "546",
      threshold_category: ">500",
      phrase_selected: "mature holder base"
    },
    {
      metric: "serious_whale_combined",
      value: "61.9%",
      threshold_category: ">25%",
      phrase_selected: "strong tier representation"
    },
    {
      metric: "top10_percentage",
      value: "42.5%",
      threshold_category: "25-50%",
      phrase_selected: "coordinated-capable control"
    },
    {
      metric: "unlocked_to_lp_ratio",
      value: "3.2",
      threshold_category: "3-8x",
      phrase_selected: "thin liquidity coverage"
    },
    {
      metric: "health_score",
      value: "68",
      threshold_category: "40-70",
      phrase_selected: "moderate resilience"
    }
  ],
  uncertainty_notes: [
    "Whale movement data unavailable - behavioral shift analysis limited",
    "No historical snapshots for retention pattern analysis"
  ],
  abbreviated_summary: "Expansion phase (high confidence). Coordinated-capable control with thin liquidity. Moderate resilience, watch for concentrated exit pressure."
};

const exampleMode = {
  mode: "A",
  label: "Snapshot",
  reason: "default_overview"
};

const lifecycleColors: Record<string, string> = {
  Genesis: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Discovery: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Expansion: 'bg-green-500/20 text-green-300 border-green-500/30',
  Distribution: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Compression: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Dormant: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  Reactivation: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

const confidenceColors: Record<string, string> = {
  high: 'bg-green-500/20 text-green-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  low: 'bg-red-500/20 text-red-300',
};

export function AIInterpretationExample() {
  const [driversOpen, setDriversOpen] = useState(true);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  return (
    <Card className="bg-card/50 border-primary/20 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-primary" />
            AI Interpretation
            <Badge variant="outline" className="ml-2 text-xs bg-primary/10">
              Example Report
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Mode {exampleMode.mode}: {exampleMode.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Overview */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {exampleInterpretation.status_overview}
          </p>
        </div>

        {/* Lifecycle Badge */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
          <Target className="h-5 w-5 text-primary" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Lifecycle Stage:</span>
            <Badge className={lifecycleColors[exampleInterpretation.lifecycle.stage]}>
              {exampleInterpretation.lifecycle.stage}
            </Badge>
            <Badge className={confidenceColors[exampleInterpretation.lifecycle.confidence]}>
              {exampleInterpretation.lifecycle.confidence} confidence
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground pl-8">
          {exampleInterpretation.lifecycle.explanation}
        </p>

        {/* Abbreviated Summary */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium text-primary">
            📊 {exampleInterpretation.abbreviated_summary}
          </p>
        </div>

        {/* Key Drivers */}
        <Collapsible open={driversOpen} onOpenChange={setDriversOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">Key Drivers</span>
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${driversOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {exampleInterpretation.key_drivers.map((driver, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{driver.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {driver.metric_value}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {driver.bucket}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{driver.implication}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>

        {/* Reasoning Trace */}
        <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Reasoning Trace</span>
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${reasoningOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-1 text-xs font-mono bg-muted/30 p-3 rounded-lg">
              {exampleInterpretation.reasoning_trace.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-muted-foreground">{idx + 1}.</span>
                  <span className="text-primary">{step.metric}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-foreground">{step.value}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-yellow-500">[{step.threshold_category}]</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-green-400">"{step.phrase_selected}"</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Uncertainty Notes */}
        {exampleInterpretation.uncertainty_notes && exampleInterpretation.uncertainty_notes.length > 0 && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-500">Uncertainty Notes</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {exampleInterpretation.uncertainty_notes.map((note, idx) => (
                <li key={idx}>• {note}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
