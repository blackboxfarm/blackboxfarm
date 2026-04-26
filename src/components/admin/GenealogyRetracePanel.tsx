import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type Status = { processed?: number; traced?: number; kycResolved?: number; failed?: number; remaining?: number; total?: number; aborted?: string };

export const GenealogyRetracePanel = () => {
  const [insidersRunning, setInsidersRunning] = useState(false);
  const [archiveRunning, setArchiveRunning] = useState(false);
  const [insidersStatus, setInsidersStatus] = useState<Status | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<Status | null>(null);

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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Insiders Lifecycle — full retrace</p>
              <p className="text-xs text-muted-foreground">Re-walks every Insiders token's funding chain to KYC. Auto-loops in batches of 25.</p>
            </div>
            <Button onClick={runInsiders} disabled={insidersRunning} className="gap-2">
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

        <div className="border-t border-border/50 pt-4 space-y-2">
          <div className="flex items-center justify-between">
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
      </CardContent>
    </Card>
  );
};