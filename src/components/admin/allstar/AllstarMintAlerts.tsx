import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, ExternalLink, RefreshCw, Check, Copy, MessageSquare, Twitter, Send, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

export function AllstarMintAlerts() {
  const [smsEnabled, setSmsEnabled] = React.useState<boolean>(false);
  const [smsLoaded, setSmsLoaded] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(() => Date.now());

  // Re-tick every 30s so "mint age" stays live without a refetch
  React.useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  // Enrich rows with live pump.fun MINT metadata (name, symbol, image, socials, true created_timestamp)
  const mintsToEnrich = React.useMemo(() => {
    return (alerts || []).slice(0, 25).map((a: any) => a.token_mint).filter(Boolean);
  }, [alerts]);

  const { data: metaMap } = useQuery({
    queryKey: ['mint-alert-token-meta', mintsToEnrich.join(',')],
    enabled: mintsToEnrich.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('token-metadata-batch', {
        body: { mints: mintsToEnrich },
      });
      if (error) throw error;
      const out: Record<string, any> = {};
      for (const t of (data?.tokens || [])) out[t.mint] = t;
      return out;
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
                <TableHead>Token (from MINT)</TableHead>
                <TableHead>Token Mint</TableHead>
                <TableHead>Creator Wallet</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Launchpad</TableHead>
                <TableHead>Mint Age (live)</TableHead>
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
                  const meta = metaMap?.[alert.token_mint] || {};
                  const name = meta.name || alert.token_name || 'UNKNOWN';
                  const symbol = meta.symbol || alert.token_symbol || 'UNKNOWN';
                  const image = meta.image as string | undefined;
                  const description = meta.description as string | undefined;
                  const twitter = meta.twitter as string | null | undefined;
                  const telegram = meta.telegram as string | null | undefined;
                  const website = meta.website as string | null | undefined;
                  // Live age from real on-chain mint timestamp (frozen "mint_age" string is ignored).
                  const mintTsMs =
                    meta.createdTimestampMs ??
                    (metadata?.mint_timestamp ? new Date(metadata.mint_timestamp).getTime() : null);
                  const liveAge = mintTsMs ? formatAge(nowTick - mintTsMs) : '—';
                  return (
                    <TableRow key={alert.id} className={`text-xs ${alert.is_acknowledged ? 'opacity-50' : ''}`}>
                      <TableCell>
                        <Badge
                          className={`text-[9px] ${alertLevelColor(alert.alert_level)}`}
                          title="Alert level is derived from the developer's tier (T-rating): T6+ = Critical, T4–5 = High, T2–3 = Medium. Higher tier = larger proven launches in this dev's history."
                        >
                          {alert.alert_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2 max-w-[320px]">
                          {image ? (
                            <img
                              src={image}
                              alt={symbol}
                              loading="lazy"
                              className="h-10 w-10 rounded object-cover border border-border/40 shrink-0"
                              onError={(e) => ((e.currentTarget.style.display = 'none'))}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted/40 border border-border/40 shrink-0" />
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold truncate">${symbol}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{name}</span>
                            {description && (
                              <span className="text-[10px] text-muted-foreground/80 line-clamp-2">{description}</span>
                            )}
                            {(twitter || telegram || website) && (
                              <div className="flex items-center gap-2 mt-1">
                                {twitter && (
                                  <a href={twitter} target="_blank" rel="noopener noreferrer" title={twitter} className="text-sky-400 hover:text-sky-300">
                                    <Twitter className="h-3 w-3" />
                                  </a>
                                )}
                                {telegram && (
                                  <a href={telegram} target="_blank" rel="noopener noreferrer" title={telegram} className="text-cyan-400 hover:text-cyan-300">
                                    <Send className="h-3 w-3" />
                                  </a>
                                )}
                                {website && (
                                  <a href={website} target="_blank" rel="noopener noreferrer" title={website} className="text-emerald-400 hover:text-emerald-300">
                                    <Globe className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
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
                        <div className="flex flex-col gap-0.5">
                          <code className="text-[10px] font-mono">
                            {alert.creator_wallet.slice(0, 6)}...{alert.creator_wallet.slice(-4)}
                          </code>
                          {metadata?.twitter_handle && (
                            <a
                              href={`https://x.com/${metadata.twitter_handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-sky-400 hover:text-sky-300"
                            >
                              @{metadata.twitter_handle}
                            </a>
                          )}
                        </div>
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
                        <span className="text-foreground/90" title={mintTsMs ? new Date(mintTsMs).toISOString() : 'no mint timestamp'}>
                          {liveAge}
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
