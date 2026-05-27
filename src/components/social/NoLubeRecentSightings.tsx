import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SightingRow {
  id: string;
  token_mint: string;
  ticker: string | null;
  times_posted: number | null;
  last_mcap_at_post: number | null;
  last_multiplier: number | null;
  last_posted_at: string | null;
  posted: boolean | null;
  composed_at: string | null;
}

function fmtMoney(n: number | null): string {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
function fmtTime(s: string | null): string {
  if (!s) return '—';
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function NoLubeRecentSightings() {
  const [rows, setRows] = useState<SightingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('no_lube_post_log')
      .select('id, token_mint, ticker, times_posted, last_mcap_at_post, last_multiplier, last_posted_at, posted, composed_at')
      .order('composed_at', { ascending: false })
      .limit(25);
    if (error) toast.error(`Load failed: ${error.message}`);
    else setRows((data || []) as SightingRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerOrchestrate = async (mint: string) => {
    setTriggering(mint);
    const { data, error } = await supabase.functions.invoke('no-lube-orchestrate', { body: { mint } });
    setTriggering(null);
    if (error) toast.error(`Orchestrate: ${error.message}`);
    else toast.success(`Flow: ${data?.flow || 'ok'}${data?.multiplier ? ` (${data.multiplier}x)` : ''}`);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">No Lube — Recent Sightings</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">No sightings logged yet.</p>
        )}
        <div className="space-y-1 max-h-[360px] overflow-y-auto">
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-center text-xs py-1.5 border-b border-border/40">
              <div className="truncate">
                <span className="font-mono font-semibold">{r.ticker || '???'}</span>
                <span className="text-muted-foreground ml-2 font-mono text-[10px]">{r.token_mint.slice(0, 6)}…{r.token_mint.slice(-4)}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">×{r.times_posted ?? 0}</Badge>
              <span className="text-muted-foreground tabular-nums">{fmtMoney(r.last_mcap_at_post)}</span>
              {r.last_multiplier ? (
                <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/40">{r.last_multiplier}x</Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">first</span>
              )}
              <span className="text-muted-foreground text-[10px]">{fmtTime(r.last_posted_at || r.composed_at)}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2"
                title="Re-run orchestrator for this token"
                disabled={triggering === r.token_mint}
                onClick={() => triggerOrchestrate(r.token_mint)}>
                <Send className={`h-3 w-3 ${triggering === r.token_mint ? 'animate-pulse' : ''}`} />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          First sighting → Private only. Re-sighting at ≥ threshold × prior MCap → Private + Public.
        </p>
      </CardContent>
    </Card>
  );
}