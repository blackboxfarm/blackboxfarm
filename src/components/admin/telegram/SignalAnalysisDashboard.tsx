import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, TrendingUp, Eye, Zap, Users, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SignalInterpretation {
  id: string;
  channel_id: string;
  raw_message: string | null;
  token_mint: string | null;
  token_symbol: string | null;
  signal_type: string;
  whale_name: string | null;
  whale_consensus_count: number;
  call_sequence: number;
  urgency_score: number;
  decision: string;
  decision_reasoning: string;
  created_at: string;
}

interface WhaleProfile {
  id: string;
  whale_name: string;
  total_calls: number;
  profitable_calls: number;
  success_rate: number;
  avg_roi: number;
  priority_tier: string;
  last_seen_at: string;
}

interface SignalStats {
  emergency: number;
  recommendation: number;
  momentum: number;
  fresh_discovery: number;
  watch: number;
  standard: number;
}

export function SignalAnalysisDashboard() {
  const [signals, setSignals] = useState<SignalInterpretation[]>([]);
  const [whaleProfiles, setWhaleProfiles] = useState<WhaleProfile[]>([]);
  const [stats, setStats] = useState<SignalStats>({
    emergency: 0,
    recommendation: 0,
    momentum: 0,
    fresh_discovery: 0,
    watch: 0,
    standard: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load recent signal interpretations
      const { data: signalData } = await supabase
        .from('telegram_message_interpretations')
        .select('id, channel_id, raw_message, token_mint, token_symbol, signal_type, whale_name, whale_consensus_count, call_sequence, urgency_score, decision, decision_reasoning, created_at')
        .not('signal_type', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (signalData) {
        setSignals(signalData as SignalInterpretation[]);
        
        // Calculate stats
        const newStats: SignalStats = {
          emergency: 0,
          recommendation: 0,
          momentum: 0,
          fresh_discovery: 0,
          watch: 0,
          standard: 0
        };
        
        signalData.forEach((s: any) => {
          const type = s.signal_type?.toLowerCase() || 'standard';
          if (type in newStats) {
            newStats[type as keyof SignalStats]++;
          }
        });
        
        setStats(newStats);
      }

      // Load whale profiles
      const { data: whaleData } = await supabase
        .from('telegram_whale_profiles')
        .select('*')
        .order('total_calls', { ascending: false })
        .limit(20);

      if (whaleData) {
        setWhaleProfiles(whaleData as WhaleProfile[]);
      }
    } catch (error) {
      console.error('Error loading signal data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSignalBadge = (signalType: string, urgencyScore: number) => {
    const type = signalType?.toUpperCase() || 'STANDARD';
    
    switch (type) {
      case 'EMERGENCY':
        return (
          <Badge className="bg-red-500 text-white animate-pulse">
            🚨 EMERGENCY
          </Badge>
        );
      case 'RECOMMENDATION':
        return (
          <Badge className="bg-yellow-500 text-black">
            🌟 RECOMMENDATION
          </Badge>
        );
      case 'MOMENTUM':
        return (
          <Badge className="bg-green-500 text-white">
            📈 MOMENTUM
          </Badge>
        );
      case 'FRESH_DISCOVERY':
        return (
          <Badge className="bg-blue-500 text-white">
            🔍 FRESH DISCOVERY
          </Badge>
        );
      case 'WATCH':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            👀 WATCH
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            📊 STANDARD
          </Badge>
        );
    }
  };

  const getUrgencyBar = (score: number) => {
    const width = `${Math.min(score * 100, 100)}%`;
    let colorClass = 'bg-muted-foreground';
    
    if (score >= 0.9) colorClass = 'bg-red-500';
    else if (score >= 0.7) colorClass = 'bg-orange-500';
    else if (score >= 0.5) colorClass = 'bg-yellow-500';
    else if (score >= 0.3) colorClass = 'bg-blue-500';
    
    return (
      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width }} />
      </div>
    );
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'VIP':
        return <Badge className="bg-purple-500">VIP</Badge>;
      case 'LOW':
        return <Badge variant="outline">LOW</Badge>;
      default:
        return <Badge variant="secondary">STANDARD</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Signal Type Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Emergency</p>
                <p className="text-xl font-bold text-red-500">{stats.emergency}</p>
              </div>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Recommendation</p>
                <p className="text-xl font-bold text-yellow-500">{stats.recommendation}</p>
              </div>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Momentum</p>
                <p className="text-xl font-bold text-green-500">{stats.momentum}</p>
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Fresh Discovery</p>
                <p className="text-xl font-bold text-blue-500">{stats.fresh_discovery}</p>
              </div>
              <Zap className="w-5 h-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Watch</p>
                <p className="text-xl font-bold text-muted-foreground">{stats.watch}</p>
              </div>
              <Eye className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Standard</p>
                <p className="text-xl font-bold">{stats.standard}</p>
              </div>
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Whale Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Whale Performance Tracker
          </CardTitle>
          <CardDescription>
            Track which whale wallets have the best signal accuracy
          </CardDescription>
        </CardHeader>
        <CardContent>
          {whaleProfiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No whale profiles yet. Run scans to populate whale data.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Whale</TableHead>
                  <TableHead>Total Calls</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Avg ROI</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {whaleProfiles.map((whale) => (
                  <TableRow key={whale.id}>
                    <TableCell className="font-medium">
                      [{whale.whale_name}]
                    </TableCell>
                    <TableCell>{whale.total_calls}</TableCell>
                    <TableCell>
                      <span className={whale.success_rate >= 50 ? 'text-green-500' : 'text-red-500'}>
                        {whale.success_rate.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={whale.avg_roi >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {whale.avg_roi >= 0 ? '+' : ''}{whale.avg_roi.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{getTierBadge(whale.priority_tier)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(whale.last_seen_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Signals Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Real-Time Signal Classifications
          </CardTitle>
          <CardDescription>
            Live feed of classified signals from INSIDER WALLET TRACKING
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No classified signals yet. Enable signal classification and run a scan.
            </p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {signals.map((signal) => (
                <div key={signal.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {getSignalBadge(signal.signal_type, signal.urgency_score)}
                      {signal.whale_name && (
                        <Badge variant="outline" className="font-mono">
                          [{signal.whale_name}]
                        </Badge>
                      )}
                      {signal.whale_consensus_count > 1 && (
                        <Badge className="bg-purple-500">
                          {signal.whale_consensus_count} whales
                        </Badge>
                      )}
                      {signal.call_sequence > 1 && (
                        <Badge variant="secondary">
                          Call #{signal.call_sequence}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Urgency:</span>
                        {getUrgencyBar(signal.urgency_score)}
                        <span className="text-xs font-mono">
                          {(signal.urgency_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {signal.token_symbol && (
                        <a
                          href={`https://dexscreener.com/solana/${signal.token_mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-medium"
                        >
                          ${signal.token_symbol}
                        </a>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-2 bg-muted/50 rounded p-2">
                    {signal.raw_message?.substring(0, 200)}...
                  </p>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{signal.decision_reasoning}</span>
                    <span>
                      {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SignalAnalysisDashboard;
