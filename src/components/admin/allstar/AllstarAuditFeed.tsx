import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, RefreshCw, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function AllstarAuditFeed() {
  const { data: audited, isLoading, refetch } = useQuery({
    queryKey: ['allstar-audit-feed'],
    refetchInterval: 30_000, // live refresh every 30s
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allstar_dev_registry')
        .select('id, master_wallet, best_tier, best_token_symbol, best_mcap_achieved, new_mints_found, last_audit_at, audit_count, status, twitter_handle')
        .not('last_audit_at', 'is', null)
        .order('last_audit_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime: refetch when registry rows or mint alerts change
  React.useEffect(() => {
    const channel = supabase
      .channel('allstar-audit-feed-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allstar_dev_registry' }, () => refetch())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'allstar_mint_alerts' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const copyWallet = (w: string) => {
    navigator.clipboard.writeText(w);
    toast.success('Copied');
  };

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-400" />
            Live Audit Feed
            <Badge variant="outline" className="text-[10px] animate-pulse">LIVE</Badge>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Real-time feed of allstar wallet audits — checks Solscan history for new mints every 30min
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Last Audited</TableHead>
                <TableHead>Dev Wallet</TableHead>
                <TableHead>Best Token</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Audits</TableHead>
                <TableHead className="text-right">New Mints</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : (audited || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No audits yet</TableCell>
                </TableRow>
              ) : (
                (audited || []).map((dev) => (
                  <TableRow key={dev.id} className="text-xs">
                    <TableCell>
                      <span className="text-muted-foreground text-[10px]">
                        {dev.last_audit_at ? timeSince(dev.last_audit_at) : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-[10px] font-mono">
                          {dev.master_wallet.slice(0, 6)}...{dev.master_wallet.slice(-4)}
                        </code>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyWallet(dev.master_wallet)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <a
                          href={`https://solscan.io/account/${dev.master_wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      {dev.best_token_symbol ? (
                        <Badge variant="secondary" className="text-[10px]">${dev.best_token_symbol}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <span className={`font-bold ${dev.best_tier >= 6 ? 'text-yellow-400' : dev.best_tier >= 4 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        T{dev.best_tier}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{dev.audit_count || 0}</TableCell>
                    <TableCell className="text-right">
                      {dev.new_mints_found ? (
                        <Badge variant="destructive" className="text-[10px]">{dev.new_mints_found}</Badge>
                      ) : (
                        <span className="text-green-400">✓ clean</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={dev.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                        {dev.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
