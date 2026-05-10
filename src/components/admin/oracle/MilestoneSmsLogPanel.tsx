import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MessageSquare, RefreshCw, Phone, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

interface SmsLog {
  id: string;
  metric_key: string;
  pct: number;
  count_at_send: number | null;
  total_at_send: number | null;
  body: string | null;
  to_phone: string | null;
  status: string;
  error: string | null;
  sent_at: string;
}

const metricLabel = (k: string) =>
  k === 'dev_wallet' ? 'Dev Wallets' : k === 'kyc_traced' ? 'KYC Traced' : k;

export default function MilestoneSmsLogPanel() {
  const [triggering, setTriggering] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['milestone-sms-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coverage_milestone_sms_log' as any)
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as SmsLog[];
    },
    refetchInterval: 30_000,
  });

  const { data: state } = useQuery({
    queryKey: ['milestone-state'],
    queryFn: async () => {
      const { data } = await supabase
        .from('coverage_milestone_state' as any)
        .select('*');
      return (data ?? []) as any[];
    },
    refetchInterval: 30_000,
  });

  const triggerNow = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('coverage-milestone-notifier');
      if (error) throw error;
      toast.success('Notifier executed', { description: JSON.stringify(data).slice(0, 200) });
      refetch();
    } catch (e: any) {
      toast.error('Failed', { description: e.message });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-950/10 to-background">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            Coverage Milestone SMS Log
          </CardTitle>
          <CardDescription>
            Every milestone alert sent to <span className="font-mono">+1-226-583-5975</span>.
            Cron runs every 5 min; one SMS per new whole percent.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={triggerNow} disabled={triggering}>
            <Send className={`h-3 w-3 mr-1 ${triggering ? 'animate-pulse' : ''}`} />
            Run now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current state per metric */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(state ?? []).map((s: any) => (
            <div key={s.metric_key} className="rounded-md border bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{metricLabel(s.metric_key)}</div>
                <Badge variant="secondary" className="font-mono">{s.last_pct}%</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Last SMS:{' '}
                {s.last_notified_at
                  ? formatDistanceToNow(new Date(s.last_notified_at), { addSuffix: true })
                  : '—'}
              </div>
            </div>
          ))}
        </div>

        {/* Log table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>When</TableHead>
                <TableHead compact>Metric</TableHead>
                <TableHead compact>%</TableHead>
                <TableHead compact>Count</TableHead>
                <TableHead compact>Status</TableHead>
                <TableHead compact>Body</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell compact colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow>
                  <TableCell compact colSpan={6} className="text-center text-muted-foreground">
                    No SMS sent yet — the next milestone crossing will appear here.
                  </TableCell>
                </TableRow>
              )}
              {(data ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell compact className="whitespace-nowrap text-muted-foreground">
                    {formatDistanceToNow(new Date(row.sent_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell compact>{metricLabel(row.metric_key)}</TableCell>
                  <TableCell compact className="font-mono">{row.pct}%</TableCell>
                  <TableCell compact className="font-mono text-xs">
                    {row.count_at_send?.toLocaleString() ?? '—'} /{' '}
                    {row.total_at_send?.toLocaleString() ?? '—'}
                  </TableCell>
                  <TableCell compact>
                    <Badge
                      variant={row.status === 'sent' ? 'default' : 'destructive'}
                      className="text-[10px]"
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell compact className="max-w-[320px] truncate text-xs text-muted-foreground">
                    {row.body ?? row.error ?? ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          Delivered via Twilio direct REST API.
        </div>
      </CardContent>
    </Card>
  );
}
