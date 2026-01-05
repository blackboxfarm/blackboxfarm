import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Play,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Download,
  Clock,
  Globe,
  Filter,
  Zap,
  Users,
  ShoppingCart,
  DollarSign,
  Activity,
  Wifi,
  Copy,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// Step definitions with logic explanations
const STEP_DEFINITIONS = [
  {
    id: 1,
    name: 'Token Discovery',
    icon: Wifi,
    description: 'Fetch newest tokens from WebSocket listener',
    sources: ['PumpPortal WebSocket (wss://pumpportal.fun/api/data)'],
  },
  {
    id: 2,
    name: 'Intake Filtering',
    icon: Filter,
    description: 'Apply filters in priority order to reject invalid/risky tokens',
    filters: ['1. Mayhem Mode', '2. Null name/ticker', '3. Duplicate ticker', '4. Emoji/Unicode', '5. Ticker > 12 chars'],
  },
  {
    id: 3,
    name: 'Watchlist Monitoring',
    icon: Activity,
    description: 'Monitor tokens with periodic metrics updates',
    apis: ['pump.fun /coins/{mint}', 'Helius RPC', 'SolanaTracker', 'DexScreener', 'Jupiter'],
  },
  {
    id: 4,
    name: 'Qualification Gate',
    icon: CheckCircle2,
    description: 'Check tokens against configurable thresholds',
    criteria: ['Holders ≥ threshold', 'Volume ≥ threshold', 'Watch time ≥ threshold', 'RugCheck ≥ threshold'],
  },
  {
    id: 5,
    name: 'Dev Wallet Check',
    icon: Users,
    description: 'Analyze developer behavior and reputation',
    checks: ['Dev reputation score', 'Blacklist check', 'Dev sold?', 'Dev launched new?'],
  },
  {
    id: 6,
    name: 'Buy Execution',
    icon: ShoppingCart,
    description: 'Execute tiered buys based on signal strength',
    logic: ['Weak: $2', 'Moderate: $10', 'Strong: $20', 'Very Strong: $50'],
  },
  {
    id: 7,
    name: 'Sell Monitoring',
    icon: DollarSign,
    description: 'Monitor positions and execute sells',
    logic: ['1.5x sell trigger', '10% moonbag retention'],
  },
];

interface StepResult {
  step: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  data: any;
  error?: string;
  durationMs?: number;
}

// Copy to clipboard helper
const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
};

// Format timestamp helper
const formatTimestamp = (ts: string | null | undefined): { relative: string; absolute: string } => {
  if (!ts) return { relative: 'N/A', absolute: 'N/A' };
  const date = new Date(ts);
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    absolute: date.toLocaleString(),
  };
};

export default function PipelineDebugger() {
  const [stepResults, setStepResults] = useState<Map<number, StepResult>>(new Map());
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([1]));
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const toggleStep = (stepId: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const runStep = useCallback(async (stepId: number) => {
    setIsRunning(true);
    setCurrentStep(stepId);

    setStepResults(prev => new Map(prev).set(stepId, {
      step: stepId,
      status: 'running',
      data: null
    }));

    const startTime = Date.now();

    try {
      const actionMap: Record<number, string> = {
        1: 'run_discovery',
        2: 'run_intake',
        3: 'get_watchlist_status',
        4: 'run_qualification',
        5: 'run_dev_checks',
        6: 'get_buy_queue',
        7: 'get_positions'
      };

      const { data, error } = await supabase.functions.invoke('pumpfun-pipeline-debugger', {
        body: { action: actionMap[stepId] }
      });

      if (error) throw error;

      setStepResults(prev => new Map(prev).set(stepId, {
        step: stepId,
        status: 'completed',
        data,
        durationMs: Date.now() - startTime
      }));

      setExpandedSteps(prev => new Set(prev).add(stepId));
      toast.success(`Step ${stepId} completed`);
    } catch (err: any) {
      console.error(`Step ${stepId} error:`, err);
      setStepResults(prev => new Map(prev).set(stepId, {
        step: stepId,
        status: 'error',
        data: null,
        error: err.message,
        durationMs: Date.now() - startTime
      }));
      toast.error(`Step ${stepId} failed: ${err.message}`);
    } finally {
      setIsRunning(false);
      setCurrentStep(0);
    }
  }, []);

  useEffect(() => {
    void runStep(1);
  }, [runStep]);

  const runFullPipeline = async () => {
    setIsRunning(true);
    for (let i = 1; i <= 7; i++) {
      setCurrentStep(i);
      await runStep(i);
      await new Promise(r => setTimeout(r, 500));
    }
    setIsRunning(false);
    setCurrentStep(0);
    toast.success('Full pipeline completed');
  };

  const resetDebugger = () => {
    setStepResults(new Map());
    setExpandedSteps(new Set([1]));
    setCurrentStep(0);
  };

  const exportResults = () => {
    const exportData = {
      timestamp: new Date().toISOString(),
      mode: 'live',
      steps: Array.from(stepResults.entries()).map(([id, result]) => ({ id, ...result }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Debug report exported');
  };

  const getStepStatusIcon = (stepId: number) => {
    const result = stepResults.get(stepId);
    if (!result || result.status === 'pending') {
      return <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground">{stepId}</div>;
    }
    switch (result.status) {
      case 'running':
        return <Loader2 className="h-6 w-6 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-6 w-6 text-green-500" />;
      case 'error':
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  // Render token row with links and copy
  const renderTokenRow = (token: any, showReason = false) => {
    const ts = formatTimestamp(token.createdAtBlockchain || token.createdAt);
    return (
      <TableRow key={token.mint}>
        <TableCell className="font-mono text-xs">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">{ts.relative}</span>
              </TooltipTrigger>
              <TooltipContent>{ts.absolute}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell className="font-mono text-xs font-semibold">{token.symbol || '-'}</TableCell>
        <TableCell className="text-sm max-w-[150px] truncate">{token.name || '-'}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs">{token.mint?.slice(0, 6)}...{token.mint?.slice(-4)}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(token.mint, 'Mint')}>
              <Copy className="h-3 w-3" />
            </Button>
            <a href={`https://solscan.io/token/${token.mint}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
              <ExternalLink className="h-3 w-3" />
            </a>
            <a href={`https://pump.fun/coin/${token.mint}`} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400">
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </TableCell>
        {showReason && (
          <TableCell className="text-xs text-muted-foreground max-w-[200px]">
            <span className="font-medium text-red-400">{token.reason}</span>
            {token.detail && <span className="block text-muted-foreground/70">{token.detail}</span>}
          </TableCell>
        )}
      </TableRow>
    );
  };

  const renderStepContent = (stepId: number, result: StepResult | undefined) => {
    const stepDef = STEP_DEFINITIONS.find(s => s.id === stepId);
    if (!stepDef) return null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="font-medium">
                {stepDef.sources ? 'Sources' : stepDef.apis ? 'APIs' : stepDef.filters ? 'Filters (Priority Order)' : stepDef.criteria ? 'Criteria' : stepDef.checks ? 'Checks' : 'Logic'}
              </span>
            </div>
            <ul className="space-y-1 pl-6">
              {(stepDef.sources || stepDef.apis || stepDef.filters || stepDef.criteria || stepDef.checks || stepDef.logic || []).map((item, idx) => (
                <li key={idx} className="text-xs text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {result && result.status !== 'pending' && result.status !== 'running' && (
          <div className="border-t pt-4 space-y-4">
            {result.error ? (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                <p className="font-medium">Error</p>
                <p className="text-sm">{result.error}</p>
              </div>
            ) : (
              renderStepData(stepId, result.data)
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStepData = (stepId: number, data: any) => {
    if (!data) return <p className="text-sm text-muted-foreground">No data returned</p>;

    switch (stepId) {
      case 1: // Discovery
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="text-lg font-semibold">{data.source || 'API'}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Tokens Fetched</p>
                <p className="text-lg font-semibold text-primary">{data.fetchedCount || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Fetch Time</p>
                <p className="text-lg font-semibold">{data.fetchTimeMs || 0}ms</p>
              </Card>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Raw Tokens Discovered ({data.tokens?.length || 0})</p>
              <ScrollArea className="h-[400px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Created</TableHead>
                      <TableHead className="w-[80px]">Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[200px]">Mint (Solscan / Pump.fun)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.tokens || []).map((token: any) => renderTokenRow(token))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
        );

      case 2: // Intake
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-3 border-green-500/30">
                <p className="text-xs text-muted-foreground">Passed</p>
                <p className="text-lg font-semibold text-green-500">{data.passedCount || 0}</p>
              </Card>
              <Card className="p-3 border-red-500/30">
                <p className="text-xs text-muted-foreground">Rejected</p>
                <p className="text-lg font-semibold text-red-500">{data.rejectedCount || 0}</p>
              </Card>
            </div>

            {data.filterBreakdown && (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  Filter Breakdown (Priority Order)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs">Filters are applied in this order. Once a token fails a filter, it's rejected.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <div className="space-y-2">
                  {Object.entries(data.filterBreakdown)
                    .sort(([, a]: any, [, b]: any) => a.order - b.order)
                    .map(([filter, info]: [string, any]) => (
                      <div key={filter} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                        <div>
                          <span className="font-mono text-xs text-muted-foreground mr-2">#{info.order}</span>
                          <span>{filter.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-muted-foreground ml-2">({info.description})</span>
                        </div>
                        <Badge variant={info.count > 0 ? 'destructive' : 'outline'}>{info.count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-500">Passed → Watchlist ({data.passed?.length || 0})</p>
                <ScrollArea className="h-[250px] border rounded-lg border-green-500/30">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Mint</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.passed || []).map((token: any) => renderTokenRow(token))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-red-500">Rejected ({data.rejected?.length || 0})</p>
                <ScrollArea className="h-[250px] border rounded-lg border-red-500/30">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Mint</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.rejected || []).map((token: any) => renderTokenRow(token, true))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          </div>
        );

      case 3: // Watchlist
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Total Watching</p>
                <p className="text-lg font-semibold">{data.totalWatching || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Stale</p>
                <p className="text-lg font-semibold text-yellow-500">{data.staleCount || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Dead</p>
                <p className="text-lg font-semibold text-red-500">{data.deadCount || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Healthy</p>
                <p className="text-lg font-semibold text-green-500">{data.healthyCount || 0}</p>
              </Card>
            </div>

            {data.metricsInfo && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-2">Metrics Being Updated</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(data.metricsInfo).map(([metric, info]: [string, any]) => (
                    <div key={metric} className="flex justify-between">
                      <span className="font-mono">{metric}</span>
                      <span className="text-muted-foreground">{info.sources.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recentUpdates && data.recentUpdates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Watching Tokens - Current vs Previous</p>
                <ScrollArea className="h-[300px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Holders</TableHead>
                        <TableHead>Volume (SOL)</TableHead>
                        <TableHead>Bonding %</TableHead>
                        <TableHead>Watch Time</TableHead>
                        <TableHead>Stale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentUpdates.map((token: any, idx: number) => {
                        const holdersChange = token.holders - token.holdersPrev;
                        const volumeChange = token.volume - token.volumePrev;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-mono">
                              <div className="flex items-center gap-1">
                                {token.symbol}
                                <a href={`https://pump.fun/coin/${token.mint}`} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {token.holders}
                                {holdersChange !== 0 && (
                                  <span className={`text-xs flex items-center ${holdersChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {holdersChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {Math.abs(holdersChange)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {token.volume?.toFixed(2)}
                                {volumeChange !== 0 && (
                                  <span className={`text-xs flex items-center ${volumeChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {volumeChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{token.bondingPct?.toFixed(1)}%</TableCell>
                            <TableCell>{token.watchedMins} min</TableCell>
                            <TableCell>
                              <Badge variant={token.staleCount >= 3 ? 'destructive' : 'outline'}>{token.staleCount}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        );

      case 4: // Qualification
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-3 border-green-500/30">
                <p className="text-xs text-muted-foreground">Qualified</p>
                <p className="text-lg font-semibold text-green-500">{data.qualifiedCount || 0}</p>
              </Card>
              <Card className="p-3 border-yellow-500/30">
                <p className="text-xs text-muted-foreground">Soft Rejected</p>
                <p className="text-lg font-semibold text-yellow-500">{data.softRejectedCount || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Still Watching</p>
                <p className="text-lg font-semibold">{data.stillWatchingCount || 0}</p>
              </Card>
            </div>

            {data.thresholds && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-2">Active Thresholds</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span>Min Holders</span>
                    <Badge variant="outline">{data.thresholds.min_holders}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Min Volume (SOL)</span>
                    <Badge variant="outline">{data.thresholds.min_volume_sol}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Min Watch Time</span>
                    <Badge variant="outline">{data.thresholds.min_watch_time_sec}s</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Min RugCheck</span>
                    <Badge variant="outline">{data.thresholds.min_rugcheck_score}</Badge>
                  </div>
                </div>
              </div>
            )}

            {data.qualified && data.qualified.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-500">Qualified Tokens</p>
                <ScrollArea className="h-[200px] border rounded-lg border-green-500/30">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Holders</TableHead>
                        <TableHead>Volume</TableHead>
                        <TableHead>RugCheck</TableHead>
                        <TableHead>Signal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.qualified.map((token: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{token.symbol}</TableCell>
                          <TableCell>{token.holders}</TableCell>
                          <TableCell>{token.volume?.toFixed(2)}</TableCell>
                          <TableCell>{token.rugScore || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant={token.signalStrength === 'strong' || token.signalStrength === 'very_strong' ? 'default' : 'outline'}>
                              {token.signalStrength}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        );

      case 5: // Dev Checks
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-3 border-green-500/30">
                <p className="text-xs text-muted-foreground">Passed</p>
                <p className="text-lg font-semibold text-green-500">{data.passedCount || 0}</p>
              </Card>
              <Card className="p-3 border-red-500/30">
                <p className="text-xs text-muted-foreground">Dev Sold</p>
                <p className="text-lg font-semibold text-red-500">{data.devSoldCount || 0}</p>
              </Card>
              <Card className="p-3 border-orange-500/30">
                <p className="text-xs text-muted-foreground">New Launch</p>
                <p className="text-lg font-semibold text-orange-500">{data.newLaunchCount || 0}</p>
              </Card>
              <Card className="p-3 border-red-500/30">
                <p className="text-xs text-muted-foreground">Blacklisted</p>
                <p className="text-lg font-semibold text-red-500">{data.blacklistedCount || 0}</p>
              </Card>
            </div>

            {data.passed && data.passed.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-500">Ready for Buy</p>
                <ScrollArea className="h-[200px] border rounded-lg border-green-500/30">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Dev Wallet</TableHead>
                        <TableHead>Reputation</TableHead>
                        <TableHead>Trust</TableHead>
                        <TableHead>History</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.passed.map((token: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{token.symbol}</TableCell>
                          <TableCell className="font-mono text-xs">{token.devInfo?.wallet?.slice(0, 8)}...</TableCell>
                          <TableCell>{token.devInfo?.reputation || 50}</TableCell>
                          <TableCell>
                            <Badge variant={token.devInfo?.trustLevel === 'trusted' ? 'default' : 'outline'}>
                              {token.devInfo?.trustLevel || 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {token.devInfo?.tokensLaunched || 0} launched, {token.devInfo?.tokensRugged || 0} rugs
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        );

      case 6: // Buy Queue
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="text-lg font-semibold">{data.fantasyMode ? 'Fantasy' : 'Live'}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">In Queue</p>
                <p className="text-lg font-semibold text-primary">{data.queueCount || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Daily Buys</p>
                <p className="text-lg font-semibold">{data.dailyBuys || 0} / {data.dailyCap || 20}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Buy Tiers Active</p>
                <p className="text-lg font-semibold">4</p>
              </Card>
            </div>

            {data.buyTiers && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-2">Tiered Buy Amounts (Signal → USD)</p>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {Object.entries(data.buyTiers).map(([signal, tier]: [string, any]) => (
                    <div key={signal} className="text-center p-2 bg-background rounded">
                      <p className="font-semibold capitalize">{signal.replace('_', ' ')}</p>
                      <p className="text-lg text-primary">${tier.amount_usd}</p>
                      <p className="text-muted-foreground text-[10px]">{tier.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.queue && data.queue.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Buy Queue</p>
                <ScrollArea className="h-[200px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Price (USD)</TableHead>
                        <TableHead>On Curve</TableHead>
                        <TableHead>Signal</TableHead>
                        <TableHead>Buy Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.queue.map((token: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{token.symbol}</TableCell>
                          <TableCell>${token.priceUsd?.toFixed(8)}</TableCell>
                          <TableCell>{token.onCurve ? 'Yes' : 'No'}</TableCell>
                          <TableCell>
                            <Badge variant={token.signalStrength === 'strong' || token.signalStrength === 'very_strong' ? 'default' : 'outline'}>
                              {token.signalStrength}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-primary">${token.buyAmountUsd}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        );

      case 7: // Positions
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Open Positions</p>
                <p className="text-lg font-semibold">{data.positionCount || 0}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Total Invested</p>
                <p className="text-lg font-semibold">{(data.totalInvested || 0).toFixed(2)} SOL</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Unrealized P/L</p>
                <p className={`text-lg font-semibold ${(data.unrealizedPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {(data.unrealizedPnl || 0) >= 0 ? '+' : ''}{(data.unrealizedPnl || 0).toFixed(2)} SOL
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Sell Target</p>
                <p className="text-lg font-semibold">1.5x</p>
              </Card>
            </div>

            {data.positions && data.positions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Open Positions</p>
                <ScrollArea className="h-[200px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Entry</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Multiplier</TableHead>
                        <TableHead>P/L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.positions.map((pos: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{pos.symbol}</TableCell>
                          <TableCell>${pos.entryPrice?.toFixed(8)}</TableCell>
                          <TableCell>${pos.currentPrice?.toFixed(8)}</TableCell>
                          <TableCell>
                            <Badge variant={pos.multiplier >= 1.5 ? 'default' : 'outline'}>
                              {pos.multiplier?.toFixed(2)}x
                            </Badge>
                          </TableCell>
                          <TableCell className={pos.pnlPct >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct?.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {data.moonbags && data.moonbags.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Moonbags (10% retention)</p>
                <ScrollArea className="h-[150px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Sold Price</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Since Sell</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.moonbags.map((mb: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{mb.symbol}</TableCell>
                          <TableCell>${mb.soldPrice?.toFixed(8)}</TableCell>
                          <TableCell>${mb.currentPrice?.toFixed(8)}</TableCell>
                          <TableCell className={mb.changeSinceSell >= 0 ? 'text-green-500' : 'text-red-500'}>
                            {mb.changeSinceSell >= 0 ? '+' : ''}{mb.changeSinceSell?.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        );

      default:
        return <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" />
              System Pipeline Debugger
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Live</span>
              </div>
              <Button onClick={runFullPipeline} disabled={isRunning} className="gap-2">
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run Full Pipeline
              </Button>
              <Button variant="outline" onClick={resetDebugger} disabled={isRunning}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button variant="outline" onClick={exportResults} disabled={stepResults.size === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-2">
            {STEP_DEFINITIONS.map((step, idx) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div className={`p-1 rounded-full transition-all ${currentStep === step.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                    {getStepStatusIcon(step.id)}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 text-center max-w-[80px]">{step.name}</span>
                </div>
                {idx < STEP_DEFINITIONS.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {STEP_DEFINITIONS.map((step) => {
          const result = stepResults.get(step.id);
          const isExpanded = expandedSteps.has(step.id);
          const StepIcon = step.icon;

          return (
            <Card key={step.id} className={`border transition-colors ${currentStep === step.id ? 'border-primary' : ''}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleStep(step.id)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger className="flex items-center gap-3 hover:text-primary transition-colors">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Badge variant="outline" className="gap-1">
                        <StepIcon className="h-3 w-3" />
                        Step {step.id}
                      </Badge>
                      <CardTitle className="text-base">{step.name}</CardTitle>
                      {result?.durationMs && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {result.durationMs}ms
                        </span>
                      )}
                    </CollapsibleTrigger>
                    <Button size="sm" onClick={() => runStep(step.id)} disabled={isRunning} className="gap-2">
                      {currentStep === step.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Run Step {step.id}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 pl-7">{step.description}</p>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {renderStepContent(step.id, result)}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
