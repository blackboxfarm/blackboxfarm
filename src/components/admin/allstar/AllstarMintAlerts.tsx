import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, ExternalLink, RefreshCw, Check, Copy, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';

export function AllstarMintAlerts() {
  const [smsEnabled, setSmsEnabled] = React.useState<boolean>(false);
  const [smsLoaded, setSmsLoaded] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('intelligence_feature_flags')
        .select('enabled')
        .eq('feature_name', 'allstar_mint_sms_alerts')
        .maybeSingle();
      setSmsEnabled(!!data?.enabled);
      setSmsLoaded(true);
    })();
  }, []);

  const toggleSms = async (next: boolean) => {
    setSmsEnabled(next);
    const { error } = await supabase
      .from('intelligence_feature_flags')
      .update({ enabled: next })
      .eq('feature_name', 'allstar_mint_sms_alerts');
    if (error) {
      toast.error(`Could not update SMS flag: ${error.message}`);
      setSmsEnabled(!next);
    } else {
      toast.success(next ? 'SMS alerts ON' : 'SMS alerts OFF');
    }
  };

  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['allstar-mint-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allstar_mint_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime: new mint alerts pop in instantly
  React.useEffect(() => {
    const channel = supabase
      .channel('allstar-mint-alerts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allstar_mint_alerts' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const acknowledgeAlert = async (id: string) => {
    const { error } = await supabase
      .from('allstar_mint_alerts')
      .update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Failed to acknowledge');
    } else {
      toast.success('Alert acknowledged');
      refetch();
    }
  };

  const copyMint = (mint: string) => {
    navigator.clipboard.writeText(mint);
    toast.success('Mint copied');
  };

  const alertLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-orange-400" />
            Mint Alerts ({alerts?.length || 0})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/50">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">SMS</span>
              <Switch checked={smsEnabled} disabled={!smsLoaded} onCheckedChange={toggleSms} />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">⚠️</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Token Mint</TableHead>
                <TableHead>Creator Wallet</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Launchpad</TableHead>
                <TableHead>Mint Age</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead className="w-16">Ack</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : (alerts || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No mint alerts yet</TableCell>
                </TableRow>
              ) : (
                (alerts || []).map((alert) => {
                  const metadata = (alert.metadata || {}) as Record<string, any>;
                  return (
                    <TableRow key={alert.id} className={`text-xs ${alert.is_acknowledged ? 'opacity-50' : ''}`}>
                      <TableCell>
                        <Badge className={`text-[9px] ${alertLevelColor(alert.alert_level)}`}>
                          {alert.alert_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold">{alert.token_symbol || 'UNKNOWN'}</span>
                          <span className="text-[10px] text-muted-foreground">{alert.token_name || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-[10px] font-mono">
                            {alert.token_mint.slice(0, 6)}...{alert.token_mint.slice(-4)}
                          </code>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyMint(alert.token_mint)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                          <a
                            href={`https://pump.fun/coin/${alert.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-[10px] font-mono">
                          {alert.creator_wallet.slice(0, 6)}...{alert.creator_wallet.slice(-4)}
                        </code>
                      </TableCell>
                      <TableCell>
                        {alert.allstar_tier ? (
                          <span className="font-bold text-yellow-400">T{alert.allstar_tier}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{alert.launchpad || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {metadata?.mint_age || (metadata?.verified_onchain ? '✅ Verified' : '-')}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[10px]">
                        {format(new Date(alert.created_at), 'MMM d HH:mm')}
                      </TableCell>
                      <TableCell>
                        {alert.is_acknowledged ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
