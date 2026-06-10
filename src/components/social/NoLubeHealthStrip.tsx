import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Summary = {
  in_flight: number;
  in_process_stuck: number;
  mesh_pending: number;
  push_failures_24h: number;
  push_success_24h: number;
  rugged_recent: number;
};

type ChannelHealth = {
  profile_kind: string;
  last_ok_at: string | null;
  consecutive_failures: number;
  last_error_class: string | null;
  retry_after_at: string | null;
};

const fmtAgo = (iso: string | null): string => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const errBadge = (cls: string | null) => {
  if (!cls) return 'border-emerald-500/40 text-emerald-400';
  if (cls === 'permanent') return 'border-red-500/50 text-red-400';
  if (cls === 'rate_limited') return 'border-amber-500/50 text-amber-400';
  return 'border-yellow-500/50 text-yellow-400';
};

export const NoLubeHealthStrip: React.FC<{ onSweep?: () => void }> = ({ onSweep }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [channels, setChannels] = useState<ChannelHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: s, error: sErr } = await (supabase as any).rpc('no_lube_health_summary');
      if (sErr) { toast.error(`Health summary failed: ${sErr.message}`); }
      else if (s) setSummary(s as Summary);
      const { data: ch, error: chErr } = await (supabase as any)
        .from('channel_health')
        .select('profile_kind, last_ok_at, consecutive_failures, last_error_class, retry_after_at')
        .order('profile_kind');
      if (chErr) { toast.error(`Channel health failed: ${chErr.message}`); }
      else setChannels((ch || []) as ChannelHealth[]);
    } catch (e: any) {
      toast.error(`Health load failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const sweep = async () => {
    setSweeping(true);
    try {
      const { data, error } = await supabase.functions.invoke('no-lube-sweeper', { body: {} });
      if (error) toast.error(`Sweep failed: ${error.message || error}`);
      else toast.success('Sweep complete');
      if (data) console.log('[sweep]', data);
      await load();
      onSweep?.();
    } catch (e: any) {
      toast.error(`Sweep failed: ${e?.message || e}`);
    } finally { setSweeping(false); }
  };

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number | string; tone?: string }> = ({ icon, label, value, tone }) => (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-card/60 border border-border/40">
      <span className={tone || 'text-muted-foreground'}>{icon}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${tone || ''}`}>{value}</span>
    </div>
  );

  return (
    <Card className="bg-card/60 border-border">
      <CardContent className="pt-3 pb-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Stat icon={<Activity className="h-3.5 w-3.5" />} label="in-flight" value={summary?.in_flight ?? '—'} />
            <Stat
              icon={<Clock className="h-3.5 w-3.5" />}
              label="stuck >30m"
              value={summary?.in_process_stuck ?? '—'}
              tone={summary && summary.in_process_stuck > 0 ? 'text-amber-400' : undefined}
            />
            <Stat
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="mesh pending"
              value={summary?.mesh_pending ?? '—'}
              tone={summary && summary.mesh_pending > 5 ? 'text-amber-400' : undefined}
            />
            <Stat
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="push 24h ok"
              value={summary?.push_success_24h ?? '—'}
              tone="text-emerald-400"
            />
            <Stat
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="push 24h fail"
              value={summary?.push_failures_24h ?? '—'}
              tone={summary && summary.push_failures_24h > 0 ? 'text-red-400' : undefined}
            />
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={sweep} disabled={sweeping} title="Run no-lube-sweeper now">
              {sweeping ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1 text-[10px]">Sweep</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {channels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground uppercase">channels:</span>
            {channels.map(c => (
              <Badge
                key={c.profile_kind}
                variant="outline"
                className={`text-[10px] ${errBadge(c.last_error_class)}`}
                title={`Last ok: ${fmtAgo(c.last_ok_at)} ago · ${c.consecutive_failures} fails${c.retry_after_at ? ` · cooldown until ${new Date(c.retry_after_at).toLocaleTimeString()}` : ''}`}
              >
                {c.profile_kind}
                {c.consecutive_failures > 0 && <span className="ml-1">×{c.consecutive_failures}</span>}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NoLubeHealthStrip;