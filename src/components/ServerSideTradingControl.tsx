import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useLocalSecrets } from '@/hooks/useLocalSecrets';
import { useWalletPool } from '@/hooks/useWalletPool';
import { supabase } from '@/integrations/supabase/client';
import { GasFeeEstimator } from '@/components/GasFeeEstimator';
import { ExecutionMonitor } from '@/components/ExecutionMonitor';
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';
// Note: Will integrate with LiveRunner component later
// import LiveRunner from './LiveRunner';
// import type { RunnerConfig } from './LiveRunner';

// Simple config interface for now
interface RunnerConfig {
  tokenMint: string;
  tradeSizeUsd: number;
  intervalSec: number;
  dipPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  dailyCapUsd: number;
  slippageBps: number;
  quoteAsset: 'SOL' | 'USDC';
  [key: string]: any; // For other properties
}

interface TradingSession {
  id: string;
  is_active: boolean;
  token_mint: string;
  config: RunnerConfig;
  start_mode: string;
  session_start_time: string;
  last_activity: string;
  daily_buy_usd: number;
  trading_positions: any[];
  activity_logs: any[];
  emergency_sells: any[];
}

interface ActivityLog {
  id: string;
  message: string;
  log_level: string;
  timestamp: string;
  metadata: any;
}

export default function ServerSideTradingControl() {
  const { ready, secrets } = useLocalSecrets();
  const { wallets } = useWalletPool();
  
  const [sessions, setSessions] = useState<TradingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<TradingSession | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLiveRunner, setShowLiveRunner] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Default config for new sessions
  const [defaultConfig, setDefaultConfig] = useState<RunnerConfig>({
    tokenMint: "FTggXu7nYowpXjScSw7BZjtZDXywLNjK88CGhydDGgMS",
    tradeSizeUsd: 20,
    intervalSec: 3,
    dipPct: 1.0,
    takeProfitPct: 10,
    stopLossPct: 35,
    dailyCapUsd: 300,
    slippageBps: 1500,
    quoteAsset: 'SOL',
  });

  // Emergency sell state
  const [emergencyHardSell, setEmergencyHardSell] = useState({
    enabled: false,
    limitPrice: "",
    isActive: false
  });

  // Load sessions
  const loadSessions = async () => {
    if (!ready) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {},
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) {
        console.error('Error loading sessions:', error);
        return;
      }

      if (data?.success) {
        setSessions(data.sessions || []);
        
        // Auto-select active session if any
        const activeSession = data.sessions?.find((s: TradingSession) => s.is_active);
        if (activeSession && !selectedSession) {
          setSelectedSession(activeSession);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  // Load activity logs for selected session
  const loadActivityLogs = async (sessionId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {},
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) return;

      if (data?.success) {
        setActivityLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to load activity logs:', error);
    }
  };

  // Start server-side trading session
  const startServerSideTrading = async (config: RunnerConfig) => {
    if (!ready || !secrets) {
      toast({ title: "Error", description: "Secrets not configured" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {
          config,
          walletPool: [], // Will populate later
          emergencyHardSell
        },
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) {
        toast({ title: "Error", description: error.message });
        return;
      }

      if (data?.success) {
        toast({ 
          title: "🚀 Server-Side Trading Started!", 
          description: "Your trading bot is now running 24/7 on Supabase servers" 
        });
        
        setSelectedSession(data.session);
        await loadSessions();
        setShowLiveRunner(false);
      }
    } catch (error) {
      toast({ title: "Error", description: `Failed to start: ${error}` });
    } finally {
      setLoading(false);
    }
  };

  // Stop trading session
  const stopTradingSession = async (sessionId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('session-manager', {
        body: {},
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) {
        toast({ title: "Error", description: error.message });
        return;
      }

      if (data?.success) {
        toast({ 
          title: "🛑 Trading Stopped", 
          description: "Server-side trading session has been stopped" 
        });
        
        await loadSessions();
      }
    } catch (error) {
      toast({ title: "Error", description: `Failed to stop: ${error}` });
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    loadSessions();
    
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadSessions();
      if (selectedSession) {
        loadActivityLogs(selectedSession.id);
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [ready, autoRefresh, selectedSession]);

  const activeSessions = sessions.filter(s => s.is_active);
  const hasActiveSessions = activeSessions.length > 0;

  if (showLiveRunner) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Configure Server-Side Trading</CardTitle>
              <Button 
                variant="outline" 
                onClick={() => setShowLiveRunner(false)}
              >
                ← Back to Control Panel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">🌟 Server-Side Trading Benefits</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Runs 24/7 even when your computer is off</li>
                <li>• No browser required - fully autonomous</li>
                <li>• Automatic price monitoring and trading</li>
                <li>• Emergency sell orders work around the clock</li>
              </ul>
            </div>
            
            {/* Simplified config form for now */}
            <div className="space-y-4">
              <div>
                <Label>Token Mint</Label>
                <Input 
                  value={defaultConfig.tokenMint}
                  onChange={(e) => setDefaultConfig({...defaultConfig, tokenMint: e.target.value})}
                />
              </div>
              <Button 
                onClick={() => startServerSideTrading(defaultConfig)}
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Starting...' : 'Start Server-Side Trading'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🤖 Server-Side Trading Control Panel
                {hasActiveSessions && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {activeSessions.length} Active
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Manage your 24/7 autonomous trading sessions running on Supabase servers
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={autoRefresh} 
                  onCheckedChange={setAutoRefresh}
                />
                <Label className="text-xs">Auto-refresh</Label>
              </div>
              <Button 
                onClick={() => setShowLiveRunner(true)}
                disabled={hasActiveSessions}
                className="tech-button"
              >
                {hasActiveSessions ? 'Session Active' : '🚀 Start New Session'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Trading Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeSessions.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Token: {session.token_mint}</div>
                      <div className="text-sm text-muted-foreground">
                        Started: {new Date(session.session_start_time).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Last Activity: {new Date(session.last_activity).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800">
                        Mode: {session.start_mode}
                      </Badge>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => stopTradingSession(session.id)}
                        disabled={loading}
                      >
                        Stop Session
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Positions:</span>
                      <span className="ml-2 font-medium">{session.trading_positions?.length || 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Daily Spent:</span>
                      <span className="ml-2 font-medium">${session.daily_buy_usd}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Emergency Sells:</span>
                      <span className="ml-2 font-medium">{session.emergency_sells?.filter(e => e.is_active).length || 0}</span>
                    </div>
                  </div>

                  {session.emergency_sells?.some(e => e.is_active) && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      🚨 Emergency sell active at ${session.emergency_sells.find(e => e.is_active)?.limit_price}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gas Fee & Execution Monitoring */}
      {hasActiveSessions && (
        <div className="grid gap-4 md:grid-cols-2">
          <GasFeeEstimator 
            transactionType="swap" 
            onFeeSelect={(fee, speed) => {
              toast({
                title: "Fee Selected",
                description: `${speed} speed: ${fee.toFixed(6)} SOL`
              });
            }}
          />
          <ExecutionMonitor sessionId={sessions.find(s => s.is_active)?.id} />
        </div>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Server Activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            Live feed from your server-side trading sessions
          </p>
        </CardHeader>
        <CardContent>
          {activityLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hasActiveSessions ? 'Waiting for activity logs...' : 'No active sessions. Start a new session to see activity.'}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {activityLogs.slice(0, 50).map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge 
                    variant={log.log_level === 'error' ? 'destructive' : 
                            log.log_level === 'warn' ? 'secondary' : 'default'}
                    className="text-xs"
                  >
                    {log.log_level}
                  </Badge>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session History */}
      {sessions.filter(s => !s.is_active).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Session History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessions.filter(s => !s.is_active).slice(0, 10).map((session) => (
                <div key={session.id} className="flex items-center justify-between py-2 border-b">
                  <div>
                    <div className="font-medium">{session.token_mint}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(session.session_start_time).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant="outline">Stopped</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}