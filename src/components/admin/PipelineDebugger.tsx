import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Play, 
  ChevronRight, 
  ChevronDown,
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  RotateCcw,
  Download,
  ExternalLink,
  Clock,
  Database,
  Globe,
  Filter,
  Zap
} from 'lucide-react';

interface ApiCall {
  name: string;
  url: string;
  method: string;
  status: number;
  durationMs: number;
  requestBody?: any;
  responseData?: any;
}

interface LogicCheck {
  name: string;
  description: string;
  threshold?: string;
  actualValue?: any;
  passed: boolean;
  reason?: string;
}

interface StageResult {
  stage: number;
  stageName: string;
  status: 'passed' | 'failed' | 'soft_rejected' | 'pending' | 'running';
  durationMs: number;
  apiCalls: ApiCall[];
  logicChecks: LogicCheck[];
  decision: string;
  nextStage?: number;
  rawData?: any;
}

interface StageDefinition {
  id: number;
  name: string;
  description: string;
  externalApis: string[];
  logicApplied: string[];
}

const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: 0,
    name: 'Token Discovery',
    description: 'Fetch new tokens from Solana Tracker API, check Mayhem Mode and Bundle Score',
    externalApis: ['Solana Tracker API (/tokens/latest)', 'pump.fun API (/coins/{mint})', 'Solana Tracker Holders API'],
    logicApplied: ['Mayhem Mode check (program ID + supply)', 'Bundle Score calculation (top holder concentration)', 'Duplicate check against existing watchlist']
  },
  {
    id: 1,
    name: 'Authority Check',
    description: 'Verify mint and freeze authorities are properly revoked',
    externalApis: ['Helius RPC (getAccountInfo)', 'Solana Web3 (getMint)'],
    logicApplied: ['mintAuthority === null', 'freezeAuthority === null', 'Supply validation (±1% of standard)']
  },
  {
    id: 2,
    name: 'RugCheck Analysis',
    description: 'Fetch risk report from RugCheck API',
    externalApis: ['RugCheck API (/tokens/{mint}/report/summary)'],
    logicApplied: ['No critical risks (freeze, mint, copycat)', 'Normalized score ≥ threshold', 'Risk level classification']
  },
  {
    id: 3,
    name: 'Holder Analysis',
    description: 'Analyze holder distribution and detect bundled/linked wallets',
    externalApis: ['Solana Tracker Holders API', 'Helius Transactions API'],
    logicApplied: ['Gini coefficient calculation', 'Linked wallet detection', 'Fresh wallet percentage', 'Bundle score recalculation']
  },
  {
    id: 4,
    name: 'Dev Wallet Check',
    description: 'Check if developer has sold tokens or launched new projects',
    externalApis: ['Helius Transactions API', 'pump.fun User Created Coins API', 'Solscan Creator Lookup'],
    logicApplied: ['No outgoing token transfers (sell detection)', 'No newer tokens created post-launch', 'Dev wallet activity monitoring']
  },
  {
    id: 5,
    name: 'Metrics Monitor',
    description: 'Track real-time metrics from multiple sources',
    externalApis: ['pump.fun API', 'DexScreener API', 'Jupiter Price API', 'Helius RPC'],
    logicApplied: ['Holder count tracking', 'Volume monitoring', 'Price change detection', 'Bonding curve progress']
  },
  {
    id: 6,
    name: 'Qualification Gate',
    description: 'Final qualification checks before signaling buy',
    externalApis: ['RugCheck API (re-verification)'],
    logicApplied: ['holders ≥ min_holders_to_qualify', 'volume ≥ min_volume_sol', 'watched_for ≥ min_watch_time_sec', 'Signal strength classification (STRONG/WEAK)']
  }
];

export default function PipelineDebugger() {
  const [tokenMint, setTokenMint] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<number>(-1);
  const [stageResults, setStageResults] = useState<Map<number, StageResult>>(new Map());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const runStage = async (stageId: number) => {
    if (!tokenMint.trim()) {
      toast.error('Please enter a token mint address');
      return;
    }

    setIsLoading(true);
    setCurrentStage(stageId);
    
    // Set stage to running
    setStageResults(prev => new Map(prev).set(stageId, {
      stage: stageId,
      stageName: STAGE_DEFINITIONS[stageId].name,
      status: 'running',
      durationMs: 0,
      apiCalls: [],
      logicChecks: [],
      decision: 'Running...'
    }));

    try {
      const { data, error } = await supabase.functions.invoke('pumpfun-pipeline-debugger', {
        body: { 
          action: 'run_stage',
          tokenMint: tokenMint.trim(),
          stage: stageId
        }
      });

      if (error) throw error;

      setStageResults(prev => new Map(prev).set(stageId, data));
      
      // Auto-expand the API calls and logic sections
      setExpandedSections(prev => {
        const next = new Set(prev);
        next.add(`api-${stageId}`);
        next.add(`logic-${stageId}`);
        return next;
      });

      toast.success(`Stage ${stageId} completed: ${data.status}`);
    } catch (err: any) {
      console.error('Stage execution error:', err);
      setStageResults(prev => new Map(prev).set(stageId, {
        stage: stageId,
        stageName: STAGE_DEFINITIONS[stageId].name,
        status: 'failed',
        durationMs: 0,
        apiCalls: [],
        logicChecks: [],
        decision: `Error: ${err.message}`
      }));
      toast.error(`Stage ${stageId} failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resetDebugger = () => {
    setTokenMint('');
    setCurrentStage(-1);
    setStageResults(new Map());
    setExpandedSections(new Set());
  };

  const exportResults = () => {
    const exportData = {
      tokenMint,
      timestamp: new Date().toISOString(),
      stages: Array.from(stageResults.entries()).map(([id, result]) => ({ id, ...result }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-debug-${tokenMint.slice(0, 8)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Debug report exported');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'soft_rejected':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      passed: 'bg-green-500/20 text-green-400 border-green-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      soft_rejected: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      pending: 'bg-muted text-muted-foreground border-border'
    };
    return variants[status] || variants.pending;
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Pipeline Debugger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Enter token mint address..."
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              className="font-mono text-sm"
            />
            <Button 
              variant="outline" 
              onClick={resetDebugger}
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button 
              variant="outline" 
              onClick={exportResults}
              disabled={stageResults.size === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Stage Progress Indicator */}
          <div className="flex items-center gap-2 py-2 overflow-x-auto">
            {STAGE_DEFINITIONS.map((stage, idx) => {
              const result = stageResults.get(stage.id);
              const status = result?.status || 'pending';
              return (
                <React.Fragment key={stage.id}>
                  <div className="flex flex-col items-center min-w-[80px]">
                    <div className={`p-1 rounded-full ${status === 'running' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                      {getStatusIcon(status)}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 text-center">{stage.id}</span>
                  </div>
                  {idx < STAGE_DEFINITIONS.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stage Cards */}
      <ScrollArea className="h-[calc(100vh-400px)]">
        <div className="space-y-4 pr-4">
          {STAGE_DEFINITIONS.map((stage) => {
            const result = stageResults.get(stage.id);
            const status = result?.status || 'pending';
            const canRun = !isLoading && tokenMint.trim().length > 0;

            return (
              <Card key={stage.id} className={`border ${status === 'running' ? 'border-primary' : 'border-border'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={getStatusBadge(status)}>
                        Stage {stage.id}
                      </Badge>
                      <CardTitle className="text-base">{stage.name}</CardTitle>
                      {result?.durationMs > 0 && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {result.durationMs}ms
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => runStage(stage.id)}
                      disabled={!canRun}
                      className="gap-2"
                    >
                      {status === 'running' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Run Stage {stage.id}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{stage.description}</p>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Stage Definition (always visible) */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="h-4 w-4" />
                        <span className="font-medium">External APIs</span>
                      </div>
                      <ul className="space-y-1 pl-6">
                        {stage.externalApis.map((api, idx) => (
                          <li key={idx} className="text-xs text-muted-foreground list-disc">{api}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Filter className="h-4 w-4" />
                        <span className="font-medium">Logic Applied</span>
                      </div>
                      <ul className="space-y-1 pl-6">
                        {stage.logicApplied.map((logic, idx) => (
                          <li key={idx} className="text-xs text-muted-foreground list-disc">{logic}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Results (only if run) */}
                  {result && status !== 'pending' && (
                    <div className="border-t pt-4 space-y-4">
                      {/* Decision */}
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        {getStatusIcon(status)}
                        <span className="font-medium">Decision:</span>
                        <span className={status === 'passed' ? 'text-green-400' : status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                          {result.decision}
                        </span>
                      </div>

                      {/* API Calls Section */}
                      {result.apiCalls && result.apiCalls.length > 0 && (
                        <Collapsible open={expandedSections.has(`api-${stage.id}`)} onOpenChange={() => toggleSection(`api-${stage.id}`)}>
                          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                            {expandedSections.has(`api-${stage.id}`) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Globe className="h-4 w-4" />
                            API Calls ({result.apiCalls.length})
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3 space-y-3">
                            {result.apiCalls.map((call, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-muted/30 border text-sm space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{call.name}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={call.status < 300 ? 'default' : 'destructive'} className="text-xs">
                                      {call.status}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{call.durationMs}ms</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                                  <Badge variant="outline" className="text-xs">{call.method}</Badge>
                                  <span className="truncate">{call.url}</span>
                                  <a href={call.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                                {call.responseData && (
                                  <Collapsible>
                                    <CollapsibleTrigger className="text-xs text-primary hover:underline">
                                      View Response Data
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <pre className="mt-2 p-2 rounded bg-background/50 text-xs overflow-x-auto max-h-48">
                                        {JSON.stringify(call.responseData, null, 2)}
                                      </pre>
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Logic Checks Section */}
                      {result.logicChecks && result.logicChecks.length > 0 && (
                        <Collapsible open={expandedSections.has(`logic-${stage.id}`)} onOpenChange={() => toggleSection(`logic-${stage.id}`)}>
                          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full">
                            {expandedSections.has(`logic-${stage.id}`) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Filter className="h-4 w-4" />
                            Logic Checks ({result.logicChecks.length})
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3 space-y-2">
                            {result.logicChecks.map((check, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 border text-sm">
                                {check.passed ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium">{check.name}</div>
                                  <div className="text-xs text-muted-foreground">{check.description}</div>
                                  {check.threshold && (
                                    <div className="text-xs mt-1">
                                      <span className="text-muted-foreground">Threshold:</span>{' '}
                                      <span className="font-mono">{check.threshold}</span>
                                    </div>
                                  )}
                                  {check.actualValue !== undefined && (
                                    <div className="text-xs">
                                      <span className="text-muted-foreground">Actual:</span>{' '}
                                      <span className={`font-mono ${check.passed ? 'text-green-400' : 'text-red-400'}`}>
                                        {typeof check.actualValue === 'object' ? JSON.stringify(check.actualValue) : String(check.actualValue)}
                                      </span>
                                    </div>
                                  )}
                                  {check.reason && (
                                    <div className="text-xs mt-1 text-yellow-400">{check.reason}</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Raw Data Section */}
                      {result.rawData && (
                        <Collapsible>
                          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                            <Database className="h-4 w-4" />
                            Raw Stage Data
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-2 p-3 rounded-lg bg-muted/30 border text-xs overflow-x-auto max-h-64">
                              {JSON.stringify(result.rawData, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
