import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { WalletSnapshotTree } from './WalletSnapshotTree';
import { 
  Wallet, GitBranch, Coins, ArrowRightLeft, RefreshCw,
  Activity, TreePine, Eye, AlertTriangle, Trash2, Zap
} from 'lucide-react';
import { format } from 'date-fns';

interface Offspring {
  id: string;
  wallet_address: string;
  depth_level: number;
  parent_offspring_id: string | null;
  total_sol_received: number;
  is_pump_fun_dev: boolean;
  is_active_trader: boolean;
  has_minted: boolean;
  minted_token: string | null;
  tokens_minted: any;
  first_funded_at: string | null;
  created_at: string;
  is_dust?: boolean;
  dust_marked_at?: string | null;
}

interface EventLog {
  id: string;
  type: 'wallet_created' | 'sol_transfer' | 'token_transfer' | 'mint_created';
  timestamp: string;
  description: string;
  wallet: string;
  details?: string;
}

interface DustStats {
  total_wallets: number;
  active_wallets: number;
  dust_wallets: number;
  dust_percentage: number;
  avg_dust_sol: number;
  recently_reactivated: number;
}

interface Props {
  megaWhaleId: string | null;
  userId: string;
}

const DISPLAY_LIMIT = 50;

export function WTFIsHappening({ megaWhaleId, userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('events');
  const [offspring, setOffspring] = useState<Offspring[]>([]);
  const [totalOffspringCount, setTotalOffspringCount] = useState(0);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [dustStats, setDustStats] = useState<DustStats | null>(null);

  useEffect(() => {
    loadData();
    loadDustStats();
  }, [megaWhaleId, userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get total count first
      let countQuery = supabase
        .from('mega_whale_offspring')
        .select('id', { count: 'exact', head: true });
      
      if (megaWhaleId) {
        countQuery = countQuery.eq('mega_whale_id', megaWhaleId);
      }
      
      const { count } = await countQuery;
      setTotalOffspringCount(count || 0);

      // Load offspring with limit, prioritizing active (non-dust) wallets
      let offspringQuery = supabase
        .from('mega_whale_offspring')
        .select('*')
        .order('depth_level', { ascending: true })
        .order('total_sol_received', { ascending: false })
        .limit(DISPLAY_LIMIT);
      
      if (megaWhaleId) {
        offspringQuery = offspringQuery.eq('mega_whale_id', megaWhaleId);
      }

      const { data: offspringData } = await offspringQuery;
      setOffspring(offspringData || []);

      // Build event log from offspring data
      buildEventLog(offspringData || []);
    } catch (error) {
      console.error('Failed to load WTF data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDustStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_dust_wallet_stats', {
        whale_id: megaWhaleId || null
      });
      
      if (error) throw error;
      if (data && data.length > 0) {
        setDustStats(data[0] as DustStats);
      }
    } catch (error) {
      console.error('Failed to load dust stats:', error);
    }
  };

  const buildEventLog = (offspringData: Offspring[]) => {
    const logs: EventLog[] = [];

    offspringData.forEach(o => {
      // Skip dust wallets in event log
      if (o.is_dust) return;

      // Wallet creation event
      logs.push({
        id: `create-${o.id}`,
        type: 'wallet_created',
        timestamp: o.first_funded_at || o.created_at,
        description: `Wallet spawned at depth ${o.depth_level}`,
        wallet: o.wallet_address,
        details: `Received ${o.total_sol_received?.toFixed(3)} SOL`
      });

      // Mint event if applicable
      if (o.has_minted || o.is_pump_fun_dev) {
        logs.push({
          id: `mint-${o.id}`,
          type: 'mint_created',
          timestamp: o.created_at,
          description: `MINT TOKEN CREATED${o.minted_token ? `: ${o.minted_token.slice(0, 8)}...` : ''}`,
          wallet: o.wallet_address,
          details: o.tokens_minted ? `Tokens: ${JSON.stringify(o.tokens_minted).slice(0, 50)}` : undefined
        });
      }

      // SOL transfer implied
      if (o.total_sol_received > 0) {
        logs.push({
          id: `sol-${o.id}`,
          type: 'sol_transfer',
          timestamp: o.first_funded_at || o.created_at,
          description: `Received ${o.total_sol_received?.toFixed(3)} SOL`,
          wallet: o.wallet_address,
          details: `From parent at depth ${Math.max(0, o.depth_level - 1)}`
        });
      }
    });

    // Sort by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEvents(logs.slice(0, 100)); // Limit events shown
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'wallet_created': return <Wallet className="h-4 w-4 text-blue-500" />;
      case 'sol_transfer': return <ArrowRightLeft className="h-4 w-4 text-green-500" />;
      case 'token_transfer': return <Coins className="h-4 w-4 text-purple-500" />;
      case 'mint_created': return <Coins className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'wallet_created': return <Badge variant="secondary">Spawn</Badge>;
      case 'sol_transfer': return <Badge variant="outline" className="text-green-600">SOL</Badge>;
      case 'token_transfer': return <Badge variant="outline" className="text-purple-600">Token</Badge>;
      case 'mint_created': return <Badge className="bg-yellow-500">MINT</Badge>;
      default: return <Badge variant="outline">Event</Badge>;
    }
  };

  // Calculate stats (excluding dust)
  const activeOffspring = offspring.filter(o => !o.is_dust);
  const mintersCount = activeOffspring.filter(o => o.has_minted || o.is_pump_fun_dev).length;
  const tradersCount = activeOffspring.filter(o => o.is_active_trader).length;
  const lowSolCount = activeOffspring.filter(o => o.total_sol_received < 0.5).length;
  const depthCounts = activeOffspring.reduce((acc, o) => {
    acc[o.depth_level] = (acc[o.depth_level] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const scanEfficiency = dustStats 
    ? Math.round((dustStats.dust_wallets / Math.max(dustStats.total_wallets, 1)) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              WTF is Happening
            </CardTitle>
            <CardDescription>
              Event log and wallet family snapshot
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { loadData(); loadDustStats(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dust Statistics Panel - NEW */}
        {dustStats && (
          <div className="p-4 rounded-lg border-2 border-dashed border-orange-500/30 bg-orange-500/5 space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Trash2 className="h-4 w-4 text-orange-500" />
              Wallet Status Overview
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-background rounded border">
                <div className="text-xl font-bold text-green-500">{dustStats.active_wallets}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span> Active
                </div>
              </div>
              <div className="text-center p-2 bg-background rounded border">
                <div className="text-xl font-bold text-red-500">{dustStats.dust_wallets}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> Dust
                </div>
              </div>
              <div className="text-center p-2 bg-background rounded border">
                <div className="text-xl font-bold">{dustStats.total_wallets}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-2 bg-background rounded border">
                <div className="text-xl font-bold text-blue-500">{dustStats.recently_reactivated}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Zap className="h-3 w-3" /> Reactivated
                </div>
              </div>
            </div>

            {/* Scan Efficiency Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Scan Efficiency</span>
                <span className="font-mono">{scanEfficiency}% skip rate</span>
              </div>
              <Progress value={scanEfficiency} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg dust SOL: {dustStats.avg_dust_sol?.toFixed(4) || 0}</span>
                <span className="text-green-600">
                  Saving ~{Math.round(dustStats.dust_wallets * 2)} API calls/scan
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-5 gap-3">
          <div className="p-3 rounded-lg border bg-card text-center">
            <div className="text-xl font-bold">{totalOffspringCount.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Wallets</div>
          </div>
          <div className="p-3 rounded-lg border bg-card text-center">
            <div className="text-xl font-bold text-yellow-500">{mintersCount}</div>
            <div className="text-xs text-muted-foreground">Minters</div>
          </div>
          <div className="p-3 rounded-lg border bg-card text-center">
            <div className="text-xl font-bold text-green-500">{tradersCount}</div>
            <div className="text-xs text-muted-foreground">Active Traders</div>
          </div>
          <div className="p-3 rounded-lg border bg-card text-center">
            <div className="text-xl font-bold text-muted-foreground">{lowSolCount}</div>
            <div className="text-xs text-muted-foreground">&lt;0.5 SOL</div>
          </div>
          <div className="p-3 rounded-lg border bg-card text-center">
            <div className="text-xs font-mono">
              {Object.entries(depthCounts).map(([d, c]) => (
                <span key={d} className="mr-2">L{d}:{c}</span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">By Depth</div>
          </div>
        </div>

        {/* Note about limits */}
        <div className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span>Displaying <strong>{activeOffspring.length}</strong> active of <strong>{totalOffspringCount.toLocaleString()}</strong> total wallets (prioritized by depth & SOL balance)</span>
        </div>

        {/* Sub Tabs */}
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Event Log
            </TabsTrigger>
            <TabsTrigger value="tree" className="flex items-center gap-2">
              <TreePine className="h-4 w-4" /> Wallet Tree
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {events.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No events recorded yet
                  </div>
                ) : (
                  events.map(event => (
                    <div key={event.id} className="flex items-start gap-3 p-2 border-b last:border-0">
                      {getEventIcon(event.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getEventBadge(event.type)}
                          <span className="text-sm font-medium truncate">{event.description}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <a
                            href={`https://solscan.io/account/${event.wallet}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary font-mono"
                          >
                            {event.wallet.slice(0, 8)}...{event.wallet.slice(-4)}
                          </a>
                          {event.details && <span>• {event.details}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(event.timestamp), 'MMM d HH:mm')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tree" className="mt-4">
            <WalletSnapshotTree 
              wallets={activeOffspring}
              totalCount={totalOffspringCount}
              displayLimit={DISPLAY_LIMIT}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}