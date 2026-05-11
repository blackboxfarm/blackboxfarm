import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface UsageStats {
  hour: number;
  day: number;
  hour_success: number;
  day_success: number;
  hour_with_owner: number;
  day_with_owner: number;
  recent: Array<{ token_mint: string; resolved_creator: string | null; function_name: string; timestamp: string; response_status: number | null; success: boolean }>;
}

export default function BirdeyeUsagePanel() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['birdeye-usage-stats'],
    queryFn: async (): Promise<UsageStats> => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [hourAll, hourOk, hourOwner, dayAll, dayOk, dayOwner, recentRes] = await Promise.all([
        supabase.from('birdeye_api_usage').select('id', { count: 'exact', head: true }).gte('timestamp', oneHourAgo),
        supabase.from('birdeye_api_usage').select('id', { count: 'exact', head: true }).gte('timestamp', oneHourAgo).eq('success', true),
        supabase.from('birdeye_api_usage').select('id', { count: 'exact', head: true }).gte('timestamp', oneHourAgo).not('resolved_creator', 'is', null),
        supabase.from('birdeye_api_usage').select('id', { count: 'exact', head: true }).gte('timestamp', oneDayAgo),
        supabase.from('birdeye_api_usage').select('id', { count: 'exact', head: true }).gte('timestamp', oneDayAgo).eq('success', true),
        supabase.from('birdeye_api_usage').select('id', { count: 'exact', head: true }).gte('timestamp', oneDayAgo).not('resolved_creator', 'is', null),
        supabase.from('birdeye_api_usage')
          .select('token_mint, resolved_creator, function_name, timestamp, response_status, success')
          .order('timestamp', { ascending: false })
          .limit(10),
      ]);
      return {
        hour: hourAll.count ?? 0,
        day: dayAll.count ?? 0,
        hour_success: hourOk.count ?? 0,
        day_success: dayOk.count ?? 0,
        hour_with_owner: hourOwner.count ?? 0,
        day_with_owner: dayOwner.count ?? 0,
        recent: (recentRes.data ?? []) as any,
      };
    },
    refetchInterval: 30_000,
  });

  const ownerRateHr = data?.hour_success ? ((data.hour_with_owner / data.hour_success) * 100).toFixed(0) : '—';
  const ownerRateDay = data?.day_success ? ((data.day_with_owner / data.day_success) * 100).toFixed(0) : '—';

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/10 to-teal-950/5">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          🐦 Birdeye API Usage
          <Badge variant="outline" className="text-[10px]">defi/token_creation_info · 1 credit/call</Badge>
        </CardTitle>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground"
          disabled={isRefetching}
        >
          {isRefetching ? 'refreshing…' : 'refresh'}
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Last hour</div>
                <div className="font-mono text-lg">{data?.hour.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">
                  {data?.hour_success.toLocaleString()} ok · {data?.hour_with_owner.toLocaleString()} resolved owner ({ownerRateHr}%)
                </div>
              </div>
              <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Last 24h</div>
                <div className="font-mono text-lg">{data?.day.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">
                  {data?.day_success.toLocaleString()} ok · {data?.day_with_owner.toLocaleString()} resolved owner ({ownerRateDay}%)
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Last 10 calls</div>
              <div className="space-y-1 font-mono text-[11px]">
                {data?.recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-border/30 pb-1">
                    <span className="truncate text-muted-foreground" title={r.token_mint}>
                      {r.token_mint.slice(0, 8)}…{r.token_mint.slice(-4)}
                    </span>
                    <span className="truncate text-foreground/80" title={r.resolved_creator ?? ''}>
                      {r.resolved_creator ? `→ ${r.resolved_creator.slice(0, 6)}…` : <span className="text-muted-foreground">no owner</span>}
                    </span>
                    <span className="text-muted-foreground">{r.function_name}</span>
                    <span className={r.success ? 'text-emerald-400' : 'text-rose-400'}>{r.response_status ?? '—'}</span>
                  </div>
                ))}
                {(!data?.recent || data.recent.length === 0) && (
                  <div className="text-muted-foreground">No calls logged yet.</div>
                )}
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
              Logged via <code className="text-emerald-400">birdeye_api_usage</code>. All callers route through{' '}
              <code className="text-emerald-400">_shared/birdeye-creator.ts</code> so dashboard count and DB count should match.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
