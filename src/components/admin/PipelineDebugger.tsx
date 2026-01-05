import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  Clock,
  Database,
  Globe,
  Filter,
  Zap,
  Users,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';

// Step definitions for the system-level pipeline
const STEP_DEFINITIONS = [
  {
    id: 1,
    name: 'Token Discovery',
    icon: Wifi,
    description: 'Fetch new tokens from PumpPortal WebSocket or Solana Tracker API',
    sources: ['PumpPortal WebSocket (wss://pumpportal.fun/api/data)', 'Solana Tracker API (/tokens/latest)'],
  },
  {
    id: 2,
    name: 'Intake Filtering',
    icon: Filter,
    description: 'Apply filters to reject invalid or risky tokens before watchlist',
    filters: ['Null name/ticker', 'Ticker length > 10', 'Emoji/Unicode', 'Mayhem Mode', 'Bundle Score > 70', 'Duplicate ticker'],
  },
  {
    id: 3,
    name: 'Watchlist Monitoring',
    icon: Activity,
    description: 'Monitor watching tokens with periodic metrics updates',
    apis: ['pump.fun /coins/{mint}', 'Helius RPC', 'SolanaTracker', 'DexScreener'],
  },
  {
    id: 4,
    name: 'Qualification Gate',
    icon: CheckCircle2,
    description: 'Check if watching tokens meet qualification criteria',
    criteria: ['holder_count >= 20', 'volume_sol >= 0.5', 'watched_time >= 2 min', 'RugCheck score >= 50'],
  },
  {
    id: 5,
    name: 'Dev Wallet Check',
    icon: Users,
    description: 'Analyze developer behavior for qualified tokens',
    checks: ['Dev sold tokens?', 'Dev launched newer token?', 'Helius transaction analysis'],
  },
  {
    id: 6,
    name: 'Buy Execution',
    icon: ShoppingCart,
    description: 'Execute buys for tokens passing all checks',
    logic: ['Check bonding curve status', 'Fantasy mode vs Live mode', 'Position tracking'],
  },
  {
    id: 7,
    name: 'Sell Monitoring',
    icon: DollarSign,
    description: 'Monitor positions and execute sells based on multipliers',
    logic: ['Price monitoring', '1.5x sell trigger', '10% moonbag retention'],
  },
];

interface StepResult {
  step: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  data: any;
  error?: string;
  durationMs?: number;
}

interface TokenItem {
  mint: string;
  symbol: string;
  name: string;
  [key: string]: any;
}

export default function PipelineDebugger() {
  const [isLiveMode, setIsLiveMode] = useState(false);
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

  const runStep = async (stepId: number) => {
    setIsRunning(true);
    setCurrentStep(stepId);
    
    // Set step to running
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
        body: { 
          action: actionMap[stepId],
          liveMode: isLiveMode
        }
      });

      if (error) throw error;

      setStepResults(prev => new Map(prev).set(stepId, {
        step: stepId,
        status: 'completed',
        data,
        durationMs: Date.now() - startTime
      }));

      // Auto-expand this step
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
  };

  const runFullPipeline = async () => {
    setIsRunning(true);
    for (let i = 1; i <= 7; i++) {
      setCurrentStep(i);
      await runStep(i);
      // Small delay between steps
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
      mode: isLiveMode ? 'live' : 'demo',
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

  const renderTokenTable = (tokens: TokenItem[], title: string, showReason = false) => {
    if (!tokens || tokens.length === 0) {
      return <p className="text-sm text-muted-foreground">No tokens</p>;
    }
    
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{title} ({tokens.length})</p>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-[150px]">Mint</TableHead>
                {showReason && <TableHead>Reason</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.slice(0, 20).map((token, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs">{token.symbol || '-'}</TableCell>
                  <TableCell className="text-sm">{token.name || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{token.mint?.slice(0, 8)}...</TableCell>
                  {showReason && <TableCell className="text-xs text-muted-foreground">{token.reason || '-'}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {tokens.length > 20 && (
            <p className="text-xs text-muted-foreground p-2 border-t">...and {tokens.length - 20} more</p>
          )}
        </div>
      </div>
    );
  };

  const renderStepContent = (stepId: number, result: StepResult | undefined) => {
    const stepDef = STEP_DEFINITIONS.find(s => s.id === stepId);
    if (!stepDef) return null;

    return (
      <div className="space-y-4">
        {/* Step Definition */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="font-medium">
                {stepDef.sources ? 'Sources' : stepDef.apis ? 'APIs' : stepDef.filters ? 'Filters' : stepDef.criteria ? 'Criteria' : stepDef.checks ? 'Checks' : 'Logic'}
              </span>
            </div>
            <ul className="space-y-1 pl-6">
              {(stepDef.sources || stepDef.apis || stepDef.filters || stepDef.criteria || stepDef.checks || stepDef.logic || []).map((item, idx) => (
                <li key={idx} className="text-xs text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Results */}
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
            {renderTokenTable(data.tokens || [], 'Raw Tokens Discovered')}
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
            
            {/* Filter breakdown */}
            {data.filterBreakdown && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Filter Breakdown</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.filterBreakdown).map(([filter, count]) => (
                    <div key={filter} className="flex justify-between p-2 bg-muted/50 rounded text-sm">
                      <span>{filter}</span>
                      <Badge variant="outline">{String(count)}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {renderTokenTable(data.passed || [], 'Passed → Added to Watchlist')}
            {renderTokenTable(data.rejected || [], 'Rejected', true)}
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

            {data.recentUpdates && data.recentUpdates.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Metric Updates</p>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Holders</TableHead>
                        <TableHead>Volume (SOL)</TableHead>
                        <TableHead>Bonding %</TableHead>
                        <TableHead>Last Update</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.recentUpdates.slice(0, 10).map((token: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{token.symbol}</TableCell>
                          <TableCell>{token.holders}</TableCell>
                          <TableCell>{token.volume?.toFixed(2)}</TableCell>
                          <TableCell>{token.bondingPct?.toFixed(1)}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{token.lastUpdate}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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

            {renderTokenTable(data.qualified || [], 'Qualified Tokens')}
            {renderTokenTable(data.softRejected || [], 'Soft Rejected (may retry)', true)}
          </div>
        );

      case 5: // Dev Checks
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
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
            </div>

            {renderTokenTable(data.passed || [], 'Ready for Buy')}
            {renderTokenTable(data.failed || [], 'Dev Check Failed', true)}
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
                <p className="text-xs text-muted-foreground">Buy Amount</p>
                <p className="text-lg font-semibold">{data.buyAmountSol || 0.05} SOL</p>
              </Card>
            </div>

            {data.queue && data.queue.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Buy Queue</p>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Price (USD)</TableHead>
                        <TableHead>On Curve</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.queue.map((token: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono">{token.symbol}</TableCell>
                          <TableCell>${token.priceUsd?.toFixed(8)}</TableCell>
                          <TableCell>{token.onCurve ? 'Yes' : 'No'}</TableCell>
                          <TableCell>
                            <Badge variant={token.executed ? 'default' : 'outline'}>
                              {token.executed ? 'Executed' : 'Pending'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Entry Price</TableHead>
                        <TableHead>Current Price</TableHead>
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
                </div>
              </div>
            )}

            {data.moonbags && data.moonbags.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Moonbags (10% retention)</p>
                <div className="border rounded-lg overflow-hidden">
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
                </div>
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
      {/* Header Controls */}
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" />
              System Pipeline Debugger
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="live-mode"
                  checked={isLiveMode}
                  onCheckedChange={setIsLiveMode}
                  disabled={isRunning}
                />
                <Label htmlFor="live-mode" className="flex items-center gap-1 text-sm">
                  {isLiveMode ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                  {isLiveMode ? 'Live' : 'Demo'}
                </Label>
              </div>
              <Button 
                onClick={runFullPipeline}
                disabled={isRunning}
                className="gap-2"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run Full Pipeline
              </Button>
              <Button 
                variant="outline" 
                onClick={resetDebugger}
                disabled={isRunning}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button 
                variant="outline" 
                onClick={exportResults}
                disabled={stepResults.size === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Step Progress */}
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

      {/* Step Cards */}
      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-4 pr-4">
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
                      <Button
                        size="sm"
                        onClick={() => runStep(step.id)}
                        disabled={isRunning}
                        className="gap-2"
                      >
                        {currentStep === step.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
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
      </ScrollArea>
    </div>
  );
}
