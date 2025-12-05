import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { 
  History, RefreshCw, CheckCircle, XCircle, SkipForward, 
  AlertTriangle, TrendingUp, Loader2, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

interface Decision {
  id: string;
  decision: string;
  reason: string;
  token_mint: string;
  token_symbol?: string;
  sol_amount?: number;
  tx_signature?: string;
  launcher_score?: number;
  details?: Record<string, unknown>;
  created_at: string;
}

interface MegaWhaleDecisionHistoryProps {
  userId: string;
}

export function MegaWhaleDecisionHistory({ userId }: MegaWhaleDecisionHistoryProps) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDecisions = async () => {
    try {
      // Use edge function since table may not be in types yet
      const { data, error } = await supabase.functions.invoke('mega-whale-mint-monitor', {
        body: { action: 'get_decision_log', user_id: userId, limit: 100 }
      });

      if (error) {
        console.error('Error loading decisions:', error);
        setDecisions([]);
        return;
      }

      setDecisions(data?.decisions || []);
    } catch (e) {
      console.error('Failed to load decisions:', e);
      setDecisions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDecisions();
  }, [userId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDecisions();
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'buy_executed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'sell_executed':
        return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case 'buy_skipped':
        return <SkipForward className="h-4 w-4 text-yellow-500" />;
      case 'sell_skipped':
        return <SkipForward className="h-4 w-4 text-yellow-500" />;
      case 'buy_failed':
      case 'sell_failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'mint_detected':
        return <AlertTriangle className="h-4 w-4 text-purple-500" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getDecisionBadge = (decision: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'buy_executed': 'default',
      'sell_executed': 'default',
      'buy_skipped': 'secondary',
      'sell_skipped': 'secondary',
      'buy_failed': 'destructive',
      'sell_failed': 'destructive',
      'mint_detected': 'outline',
    };
    
    const labels: Record<string, string> = {
      'buy_executed': '✅ BOUGHT',
      'sell_executed': '💰 SOLD',
      'buy_skipped': '⏭️ SKIPPED',
      'sell_skipped': '⏭️ SKIP SELL',
      'buy_failed': '❌ BUY FAILED',
      'sell_failed': '❌ SELL FAILED',
      'mint_detected': '🆕 MINT',
    };

    return (
      <Badge variant={variants[decision] || 'outline'}>
        {labels[decision] || decision}
      </Badge>
    );
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return 'N/A';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Decision History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Decision History
            </CardTitle>
            <CardDescription>
              All buy/sell/skip decisions with reasons
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No decisions recorded yet</p>
            <p className="text-sm mt-2">
              Decisions will appear here when the auto-buyer makes buy/sell/skip choices
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {decisions.map((decision) => (
                <div 
                  key={decision.id} 
                  className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getDecisionIcon(decision.decision)}
                      {getDecisionBadge(decision.decision)}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(decision.created_at), 'MMM d, HH:mm:ss')}
                    </span>
                  </div>
                  
                  <div className="mt-2 space-y-1">
                    {decision.token_symbol && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {decision.token_symbol}
                        </span>
                        {decision.launcher_score && (
                          <Badge variant="outline" className="text-xs">
                            Score: {decision.launcher_score}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {decision.token_mint && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Mint:</span>
                        <code className="bg-muted px-1 rounded">
                          {truncateAddress(decision.token_mint)}
                        </code>
                        <a 
                          href={`https://solscan.io/token/${decision.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    
                    {decision.reason && (
                      <p className="text-sm text-muted-foreground">
                        {decision.reason}
                      </p>
                    )}
                    
                    {decision.sol_amount && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Amount:</span>{' '}
                        <span className="font-mono">{Number(decision.sol_amount).toFixed(4)} SOL</span>
                      </div>
                    )}
                    
                    {decision.tx_signature && (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">TX:</span>
                        <a 
                          href={`https://solscan.io/tx/${decision.tx_signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-mono"
                        >
                          {truncateAddress(decision.tx_signature)}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}