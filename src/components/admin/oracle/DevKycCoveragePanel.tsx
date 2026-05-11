import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface CoverageRow {
  total_tokens: number;
  with_dev_wallet: number;
  missing_dev_wallet: number;
  kyc_verified: number;
  dev_no_kyc: number;
}

interface KycEntityBreakdown {
  total_profiles: number;
  verified: number;
  trail_no_kyc: number;
  trail_incomplete: number;
  not_attempted: number;
  by_type: Record<string, number>; // cex / bridge / onramp / aggregator / mm_desk / custodian
}

/**
 * Live coverage panel: shows what % of every-token-ever has a resolved
 * dev wallet and what % has a KYC root traced. Drives the two backfill
 * crons (creator-wallet-resolver-2m + kyc-backfill-master-2m) which both
 * auto-skip when there's nothing left to do.
 */
export default function DevKycCoveragePanel() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['oracle-dev-kyc-coverage'],
    queryFn: async (): Promise<CoverageRow> => {
      // Run a single SQL via postgrest? Not available; use client counts.
      const [totalRes, devRes, kycRes] = await Promise.all([
        supabase.from('master_token_directory').select('token_mint', { count: 'exact', head: true }),
        supabase.from('master_token_directory').select('token_mint', { count: 'exact', head: true }).not('creator_wallet', 'is', null),
        supabase.from('master_token_directory').select('token_mint', { count: 'exact', head: true }).eq('kyc_verified', true),
      ]);
      const total = totalRes.count ?? 0;
      const withDev = devRes.count ?? 0;
      const kyc = kycRes.count ?? 0;
      return {
        total_tokens: total,
        with_dev_wallet: withDev,
        missing_dev_wallet: Math.max(0, total - withDev),
        kyc_verified: kyc,
        dev_no_kyc: Math.max(0, withDev - kyc),
      };
    },
    refetchInterval: 30_000,
  });

  const { data: kycBreakdown } = useQuery({
    queryKey: ['oracle-dev-kyc-entity-breakdown'],
    queryFn: async (): Promise<KycEntityBreakdown> => {
      // Pull aggregate counts via RPC-less head queries.
      const [
        totalRes,
        verifiedRes,
        trailNoKycRes,
        trailIncompleteRes,
      ] = await Promise.all([
        supabase.from('developer_profiles').select('master_wallet_address', { count: 'exact', head: true }),
        supabase.from('developer_profiles').select('master_wallet_address', { count: 'exact', head: true }).eq('kyc_verified', true),
        supabase.from('developer_profiles').select('master_wallet_address', { count: 'exact', head: true }).eq('kyc_trail_status', 'trail_no_kyc'),
        supabase.from('developer_profiles').select('master_wallet_address', { count: 'exact', head: true }).eq('kyc_trail_status', 'trail_incomplete'),
      ]);

      // Per-entity-type counts (small list, one round-trip).
      const types = ['cex', 'bridge', 'onramp', 'aggregator', 'mm_desk', 'custodian'] as const;
      const typeCounts = await Promise.all(types.map(t =>
        supabase.from('developer_profiles').select('master_wallet_address', { count: 'exact', head: true }).eq('kyc_source_type', t)
      ));
      const by_type: Record<string, number> = {};
      types.forEach((t, i) => { by_type[t] = typeCounts[i].count ?? 0; });

      const total = totalRes.count ?? 0;
      const verified = verifiedRes.count ?? 0;
      const trail_no_kyc = trailNoKycRes.count ?? 0;
      const trail_incomplete = trailIncompleteRes.count ?? 0;
      const not_attempted = Math.max(0, total - verified - trail_no_kyc - trail_incomplete);
      return { total_profiles: total, verified, trail_no_kyc, trail_incomplete, not_attempted, by_type };
    },
    refetchInterval: 60_000,
  });

  const total = data?.total_tokens ?? 0;
  const dev = data?.with_dev_wallet ?? 0;
  const kyc = data?.kyc_verified ?? 0;
  const devPct = total ? (dev / total) * 100 : 0;
  const kycPct = total ? (kyc / total) * 100 : 0;
  // Throughput estimates (Birdeye-powered creator resolver):
  //   backfill-creator-wallets-2m: 60 mints / 2 min  = 1,800/hr
  //   backfill-creator-wallets-catchup-10m: 200 / 10 min = 1,200/hr
  //   → combined ~3,000 creator-wallets resolved per hour.
  //   kyc-backfill-master-2m: ~100 wallets / 2 min  = 3,000/hr.
  const remainingDev = data?.missing_dev_wallet ?? 0;
  const remainingKyc = total - kyc;
  const etaDevHours = remainingDev / 3000;
  const etaKycHours = remainingKyc / 3000;

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/10 to-yellow-950/5">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          🛰️ Dev Wallet + KYC Coverage
          <Badge variant="outline" className="text-[10px]">auto-backfilling every 2 min</Badge>
        </CardTitle>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground"
          disabled={isRefetching}
        >
          {isRefetching ? 'refreshing…' : 'refresh'}
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading coverage…</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Total tokens tracked: <span className="font-mono text-foreground">{total.toLocaleString()}</span>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Dev wallet resolved</span>
                <span className="font-mono">
                  {dev.toLocaleString()} / {total.toLocaleString()} ({devPct.toFixed(1)}%)
                </span>
              </div>
              <Progress value={devPct} className="h-2" />
              {remainingDev > 0 && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  {remainingDev.toLocaleString()} missing — ETA ~{etaDevHours.toFixed(1)}h at current cron rate
                </div>
              )}
              {remainingDev === 0 && total > 0 && (
                <div className="text-[11px] text-green-500 mt-1">✅ 100% coverage — resolver idle.</div>
              )}
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>KYC root traced</span>
                <span className="font-mono">
                  {kyc.toLocaleString()} / {total.toLocaleString()} ({kycPct.toFixed(2)}%)
                </span>
              </div>
              <Progress value={kycPct} className="h-2" />
              {remainingKyc > 0 && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  {remainingKyc.toLocaleString()} pending — ETA ~{etaKycHours.toFixed(1)}h at current cron rate
                </div>
              )}
              {remainingKyc === 0 && total > 0 && (
                <div className="text-[11px] text-green-500 mt-1">✅ 100% coverage — KYC backfill idle.</div>
              )}
            </div>

            {kycBreakdown && (
              <div className="border-t border-border/40 pt-3 space-y-2">
                <div className="text-xs font-semibold flex items-center gap-2">
                  KYC Trail Breakdown
                  <Badge variant="outline" className="text-[10px]">developer_profiles</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded border border-green-500/30 bg-green-500/5 p-2">
                    <div className="text-green-400 font-mono">{kycBreakdown.verified.toLocaleString()}</div>
                    <div className="text-muted-foreground">verified</div>
                  </div>
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                    <div className="text-amber-400 font-mono">{kycBreakdown.trail_incomplete.toLocaleString()}</div>
                    <div className="text-muted-foreground">trail incomplete</div>
                  </div>
                  <div className="rounded border border-zinc-500/30 bg-zinc-500/5 p-2">
                    <div className="text-zinc-400 font-mono">{kycBreakdown.trail_no_kyc.toLocaleString()}</div>
                    <div className="text-muted-foreground">no KYC trail</div>
                  </div>
                  <div className="rounded border border-border/40 p-2">
                    <div className="font-mono">{kycBreakdown.not_attempted.toLocaleString()}</div>
                    <div className="text-muted-foreground">not attempted</div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Verified by entity:{' '}
                  {Object.entries(kycBreakdown.by_type)
                    .filter(([, n]) => n > 0)
                    .map(([t, n]) => `${t} ${n.toLocaleString()}`)
                    .join(' · ') || '—'}
                </div>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
              Crons:{' '}
              <code className="text-amber-400">backfill-creator-wallets-2m</code> (60/run, Birdeye → Helius) +{' '}
              <code className="text-amber-400">backfill-creator-wallets-catchup-10m</code> (200/run) +{' '}
              <code className="text-amber-400">kyc-backfill-master-2m</code> (100/run). SMS milestone alerts fire every 5 min on each new whole-percent crossing. All auto-skip when complete.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}