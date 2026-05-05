import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STRIPE_TIERS } from '@/config/stripeTiers';
import { CreditCard, ExternalLink, RefreshCw } from 'lucide-react';

type CheckoutIntent = {
  id: string;
  user_id: string;
  email: string;
  stripe_session_id: string | null;
  price_id: string;
  tier_key: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

// Build a reverse lookup: price_id -> tier name
const PRICE_TO_TIER: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, cfg] of Object.entries(STRIPE_TIERS)) {
    const c = cfg as Record<string, string>;
    if (c.price_id) map[c.price_id] = key;
    if (c.x_sub_price_id) map[c.x_sub_price_id] = `${key} (X)`;
    if (c.x_sub_yearly_price_id) map[c.x_sub_yearly_price_id] = `${key} (X yearly)`;
  }
  return map;
})();

const STATUS_FILTERS = ['all', 'pending', 'completed', 'abandoned'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function CheckoutTelemetryPanel() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: intents = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-checkout-intents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkout_intents')
        .select('id, user_id, email, stripe_session_id, price_id, tier_key, status, created_at, completed_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as CheckoutIntent[]) || [];
    },
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    const since = Date.now() - 24 * 3600 * 1000;
    const last24 = intents.filter((i) => new Date(i.created_at).getTime() >= since);
    const completed = last24.filter((i) => i.status === 'completed').length;
    const abandoned = last24.filter((i) => i.status !== 'completed').length;
    const rate = last24.length ? Math.round((completed / last24.length) * 100) : 0;
    return { total: last24.length, completed, abandoned, rate };
  }, [intents]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return intents;
    return intents.filter((i) => i.status === statusFilter);
  }, [intents, statusFilter]);

  const statusBadge = (s: string) => {
    if (s === 'completed') return <Badge className="bg-green-600 hover:bg-green-600">Completed</Badge>;
    if (s === 'abandoned') return <Badge variant="destructive">Abandoned</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />
          Checkout Telemetry — last 100 attempts
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">24h Attempts</div></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-green-500">{stats.completed}</div><div className="text-xs text-muted-foreground">24h Completed</div></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-red-400">{stats.abandoned}</div><div className="text-xs text-muted-foreground">24h Abandoned</div></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-primary">{stats.rate}%</div><div className="text-xs text-muted-foreground">24h Conversion</div></CardContent></Card>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No checkout attempts yet.</TableCell></TableRow>
              ) : filtered.map((i) => {
                const tier = i.tier_key || PRICE_TO_TIER[i.price_id] || i.price_id.slice(0, 12) + '…';
                return (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(i.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{i.email}</TableCell>
                    <TableCell className="text-xs">{tier}</TableCell>
                    <TableCell>{statusBadge(i.status)}</TableCell>
                    <TableCell className="text-xs">
                      {i.stripe_session_id ? (
                        <a
                          href={`https://dashboard.stripe.com/payments/${i.stripe_session_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {i.stripe_session_id.slice(0, 18)}…
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}