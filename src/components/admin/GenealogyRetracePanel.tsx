import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, AlertTriangle, CheckCircle2, Zap, ChevronDown, Flame } from 'lucide-react';
import { toast } from 'sonner';

type Status = { processed?: number; traced?: number; kycResolved?: number; failed?: number; remaining?: number; total?: number; aborted?: string; scanned?: number; chainsPatched?: number };

type Coverage = { total: number; withCreator: number; withChain: number; withKyc: number; exhausted: number };

export const GenealogyRetracePanel = () => {
  const [insidersRunning, setInsidersRunning] = useState(false);
  const [archiveRunning, setArchiveRunning] = useState(false);
  const [rescanRunning, setRescanRunning] = useState(false);
  const [insidersStatus, setInsidersStatus] = useState<Status | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<Status | null>(null);
  const [rescanStatus, setRescanStatus] = useState<Status | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  const loadCoverage = async () => {
    try {
      const [totalQ, creatorQ, chainQ, kycQ, exhaustedQ] = await Promise.all([
        supabase.from('telegram_insider_token_lifecycle').select('id', { count: 'exact', head: true }),
        supabase.from('telegram_insider_token_lifecycle').select('id', { count: 'exact', head: true }).not('creator_wallet', 'is', null),
        supabase.from('telegram_insider_token_lifecycle').select('id', { count: 'exact', head: true }).not('genealogy_chain', 'is', null),
        supabase.from('telegram_insider_token_lifecycle').select('id', { count: 'exact', head: true }).not('genealogy_kyc_root', 'is', null),
        supabase.from('telegram_insider_token_lifecycle').select('id', { count: 'exact', head: true }).eq('kyc_label', 'Exhausted'),
      ]);
      setCoverage({
        total: totalQ.count ?? 0,
        withCreator: creatorQ.count ?? 0,
        withChain: chainQ.count ?? 0,
        withKyc: kycQ.count ?? 0,
        exhausted: exhaustedQ.count ?? 0,
      });
    } catch (e) {
      // non-fatal
    }
  };

  useEffect(() => {
    loadCoverage();
  }, []);

  const runInsiders = async () => {
    setInsidersRunning(true);
    setInsidersStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('insiders-genealogy-backfill', {
        body: { auto_loop: true, batchSize: 25 },
      });
      if (error) throw error;
      setInsidersStatus(data as Status);
      if ((data as any)?.aborted === 'helius_budget_guard') {
        toast.error('Helius budget guard tripped — aborted to protect quota.');
      } else {
        toast.success(`Insiders retrace started: ${(data as any)?.processed || 0} processed, ${(data as any)?.remaining || 0} remaining (auto-looping)`);
      }
    } catch (e: any) {
      toast.error(`Insiders retrace failed: ${e.message}`);
    } finally {
      setInsidersRunning(false);
      loadCoverage();
    }
  };

  const runRescan = async () => {
    setRescanRunning(true);
    setRescanStatus(null);
    try {
      let totalScanned = 0;
      let totalKyc = 0;
      let totalPatched = 0;
      // Loop until no more rows to rescan (it's free — no RPC cost)
      for (let i = 0; i < 20; i++) {
        const { data, error } = await supabase.functions.invoke('insiders-genealogy-rescan-kyc', {
          body: { batchSize: 1000 },
        });
        if (error) throw error;
        const d = data as Status;
        totalScanned += d.scanned || 0;
        totalKyc += d.kycResolved || 0;
        totalPatched += d.chainsPatched || 0;
        setRescanStatus({ scanned: totalScanned, kycResolved: totalKyc, chainsPatched: totalPatched, remaining: d.remaining });
        if (!d.scanned || d.scanned === 0) break;
      }
      toast.success(`KYC rescan complete: ${totalKyc} new KYC roots resolved (zero RPC cost)`);
    } catch (e: any) {
      toast.error(`KYC rescan failed: ${e.message}`);
    } finally {
      setRescanRunning(false);
      loadCoverage();
    }
  };

  const runArchive = async (tier: 'A' | 'B') => {
    setArchiveRunning(true);
    setArchiveStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-genealogy', {
        body: { batchSize: tier === 'A' ? 10 : 15, tier },
      });
      if (error) throw error;
      setArchiveStatus(data as Status);
      toast.success(`Tier ${tier} batch complete: ${(data as any)?.traced || 0} traced, ${(data as any)?.remaining || 0} remaining`);
    } catch (e: any) {
      toast.error(`Archive retrace failed: ${e.message}`);
    } finally {
      setArchiveRunning(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          🧬 Genealogy Retracer (KYC Trail Walker)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {coverage && (
          <div className="space-y-2 pb-2 border-b border-border/50">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Total: {coverage.total.toLocaleString()}</Badge>
              <Badge variant="outline">Creator known: {coverage.withCreator.toLocaleString()} ({coverage.total ? Math.round(coverage.withCreator / coverage.total * 100) : 0}%)</Badge>
              <Badge variant="outline">Chain traced: {coverage.withChain.toLocaleString()} ({coverage.total ? Math.round(coverage.withChain / coverage.total * 100) : 0}%)</Badge>
              <Badge variant={coverage.withKyc > 0 ? 'default' : 'destructive'}>
                KYC root: {coverage.withKyc.toLocaleString()} ({coverage.total ? Math.round(coverage.withKyc / coverage.total * 100) : 0}%)
              </Badge>
              {coverage.exhausted > 0 && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-500">
                  Dictionary-saturated: {coverage.exhausted.toLocaleString()}
                </Badge>
              )}
            </div>
            {coverage.withKyc === 0 && coverage.exhausted > 0 && (
              <p className="text-[11px] text-amber-500/90 leading-relaxed">
                ⚠️ {coverage.exhausted.toLocaleString()} chains walked to max depth without hitting any wallet in <code>_shared/cex-wallets.ts</code>.
                The retracer is working — the CEX dictionary just doesn't cover the terminal wallets these chains reach.
                Re-walking with Helius will not produce new roots until the dictionary is expanded.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-primary" /> KYC Rescan (zero RPC cost)
              </p>
              <p className="text-xs text-muted-foreground">Re-checks every existing chain wallet against the current CEX dictionary. Run after expanding cex-wallets.ts to instantly reclassify.</p>
            </div>
            <Button onClick={runRescan} disabled={rescanRunning} variant="default" size="sm" className="gap-2">
              {rescanRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Rescan KYC (free)
            </Button>
          </div>
          {rescanStatus && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{rescanStatus.scanned || 0} scanned</Badge>
              <Badge variant="default">🏦 {rescanStatus.kycResolved || 0} new KYC roots</Badge>
              {!!rescanStatus.chainsPatched && <Badge variant="outline">{rescanStatus.chainsPatched} chains patched</Badge>}
            </div>
          )}
        </div>

        <details className="group rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              Force re-walk (burns Helius credits)
            </span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-[11px] text-muted-foreground">
            These tools spend Helius RPC quota to re-walk funding chains from scratch. The 24h <code>kyc-backfill-master</code> cron already handles new tokens incrementally — only run these manually if you've changed walker logic or max depth.
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">Insiders Lifecycle — full retrace</p>
                <p className="text-xs text-muted-foreground">Re-walks every Insiders token's funding chain to KYC. Auto-loops in batches of 25.</p>
              </div>
              <Button onClick={runInsiders} disabled={insidersRunning} variant="outline" size="sm" className="gap-2">
                {insidersRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Retrace Insiders KYC
              </Button>
            </div>
            {insidersStatus && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />{insidersStatus.traced || 0} traced</Badge>
                <Badge variant="outline">🏦 {insidersStatus.kycResolved || 0} KYC roots</Badge>
                {!!insidersStatus.failed && <Badge variant="destructive">{insidersStatus.failed} failed</Badge>}
                <Badge variant="secondary">{insidersStatus.remaining || 0} / {insidersStatus.total || 0} remaining</Badge>
                {insidersStatus.aborted && (
                  <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{insidersStatus.aborted}</Badge>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 border-t border-border/50 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-sm">Archive — prioritized retrace</p>
                <p className="text-xs text-muted-foreground">Tier A = high-value tokens. Tier B = newest pump.fun watchlist. Skips already-settled trails.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => runArchive('A')} disabled={archiveRunning} variant="secondary" size="sm">Tier A</Button>
                <Button onClick={() => runArchive('B')} disabled={archiveRunning} variant="outline" size="sm">Tier B</Button>
              </div>
            </div>
            {archiveStatus && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />{archiveStatus.traced || 0} traced</Badge>
                {!!archiveStatus.failed && <Badge variant="destructive">{archiveStatus.failed} failed</Badge>}
                <Badge variant="secondary">{archiveStatus.remaining || 0} remaining</Badge>
              </div>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
};