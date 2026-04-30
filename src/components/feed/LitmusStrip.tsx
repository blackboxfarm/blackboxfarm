import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Snapshot {
  snapshot_hour: string;
  health_grade: string | null;
  health_score: number | null;
  risk_emoji: string | null;
  risk_label: string | null;
  total_holders: number | null;
  dust_percentage: number | null;
}

const GRADE_COLORS: Record<string, string> = {
  'A++': 'bg-emerald-500',
  'A+': 'bg-emerald-500',
  'A': 'bg-emerald-400',
  'B+': 'bg-green-400',
  'B': 'bg-lime-400',
  'B-': 'bg-lime-500',
  'C+': 'bg-yellow-400',
  'C': 'bg-amber-400',
  'D+': 'bg-orange-400',
  'D': 'bg-orange-500',
  'D-': 'bg-red-400',
  'F': 'bg-red-500',
};

function getHoursAgo(snapshotHour: string): string {
  const diff = Math.round((Date.now() - new Date(snapshotHour).getTime()) / (1000 * 60 * 60));
  if (diff === 0) return 'Now';
  return `${diff}h ago`;
}

interface LitmusStripProps {
  tokenMint: string;
  tokenCreatedAt?: string | null;
  className?: string;
  onRefresh?: () => void;
}

export function LitmusStrip({ tokenMint, tokenCreatedAt, className, onRefresh }: LitmusStripProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSnapshots = async () => {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data } = await (supabase as any)
      .from('token_health_snapshots')
      .select('snapshot_hour, health_grade, health_score, risk_emoji, risk_label, total_holders, dust_percentage')
      .eq('token_mint', tokenMint)
      .gte('snapshot_hour', since)
      .order('snapshot_hour', { ascending: true })
      .limit(12);
    
    setSnapshots((data as Snapshot[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSnapshots();
  }, [tokenMint]);

  // Build 12-hour grid
  const now = new Date();
  const hours: { hour: Date; snapshot: Snapshot | null }[] = [];
  for (let i = 11; i >= 0; i--) {
    const h = new Date(now);
    h.setMinutes(0, 0, 0);
    h.setHours(h.getHours() - i);
    const match = snapshots.find(s => {
      const sh = new Date(s.snapshot_hour);
      return sh.getUTCFullYear() === h.getUTCFullYear() &&
             sh.getUTCMonth() === h.getUTCMonth() &&
             sh.getUTCDate() === h.getUTCDate() &&
             sh.getUTCHours() === h.getUTCHours();
    });
    hours.push({ hour: h, snapshot: match || null });
  }

  // Check if token is younger than 12h
  const tokenBorn = tokenCreatedAt ? new Date(tokenCreatedAt) : null;

  const allEmpty = hours.every(h => !h.snapshot);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('bagless-holders-report', {
        body: { tokenMint, source: 'feed_refresh' },
      });
      if (!error) {
        // Wait a moment for the snapshot to be written
        await new Promise(r => setTimeout(r, 2000));
        await fetchSnapshots();
        onRefresh?.();
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    }
    setRefreshing(false);
  };

  if (loading) {
    return <div className={cn("flex gap-0.5", className)}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="w-3 h-4 rounded-sm bg-muted animate-pulse" />
      ))}
    </div>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center gap-0.5", className)}>
        {hours.map(({ hour, snapshot }, i) => {
          const isPreBirth = tokenBorn && hour < tokenBorn;
          const grade = snapshot?.health_grade;
          const colorClass = grade ? (GRADE_COLORS[grade] || 'bg-muted') : (isPreBirth ? 'bg-white/10' : 'bg-muted-foreground/20');

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "w-3 h-4 rounded-sm transition-colors cursor-default",
                    colorClass,
                    !snapshot && !isPreBirth && "opacity-40"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                <p className="font-medium">{getHoursAgo(hour.toISOString())}</p>
                {isPreBirth ? (
                  <p className="text-muted-foreground">Token not yet created</p>
                ) : snapshot ? (
                  <div className="space-y-0.5">
                    <p>{snapshot.health_grade} ({snapshot.health_score}/100)</p>
                    <p>{snapshot.risk_emoji} {snapshot.risk_label}</p>
                    {snapshot.total_holders && <p>{snapshot.total_holders.toLocaleString()} holders</p>}
                    {snapshot.dust_percentage != null && <p>{Math.round(snapshot.dust_percentage)}% dust</p>}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No scan landed that hour — hourly scanner is sweeping active watchlist, feed, and lifecycle tokens</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {allEmpty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] ml-1"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
