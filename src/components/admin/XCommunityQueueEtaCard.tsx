import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, Clock, PauseCircle, PlayCircle, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatEta(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return "—";
  if (hours < 1) return `~${Math.round(hours * 60)} min`;
  if (hours < 24) return `~${hours.toFixed(1)} hr`;
  return `~${(hours / 24).toFixed(1)} days`;
}

export function XCommunityQueueEtaCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [resuming, setResuming] = useState(false);

  // Pending = numeric communities missing mods + queue rows pending
  const { data: stats, isLoading } = useQuery({
    queryKey: ["x-community-queue-stats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();

      const [missingRes, queueRes, throughputRes, exhaustedRes, pauseRes] = await Promise.all([
        // Communities missing mods, numeric IDs only
        (supabase.from("x_communities" as any)
          .select("community_id", { count: "exact", head: true })
          .eq("is_deleted", false)
          .not("community_id", "like", "%\\_%")
          .or("moderator_usernames.is.null,last_scraped_at.is.null") as any),
        (supabase.from("x_community_resolution_queue" as any)
          .select("community_id", { count: "exact", head: true })
          .is("resolved_at", null)
          .lt("attempts", 3) as any),
        // Successful Apify resolves in last 6h → throughput
        (supabase.from("api_usage_log" as any)
          .select("id", { count: "exact", head: true })
          .eq("service_name", "apify")
          .eq("function_name", "x-community-resolver")
          .eq("success", true)
          .gte("timestamp", since) as any),
        (supabase.from("x_community_resolution_queue" as any)
          .select("community_id", { count: "exact", head: true })
          .gte("attempts", 3)
          .is("resolved_at", null) as any),
        (supabase.from("apify_pause_state" as any).select("*").eq("id", 1).maybeSingle() as any),
      ]);

      const missing = (missingRes as any).count ?? 0;
      const queued = (queueRes as any).count ?? 0;
      // Pending is the *union*; missing-mods scan covers most queue rows. Take the larger.
      const pending = Math.max(missing, queued);
      const successesLast6h = (throughputRes as any).count ?? 0;
      const throughputPerHour = successesLast6h / 6;
      const exhausted = (exhaustedRes as any).count ?? 0;
      const pause = (pauseRes as any).data as null | {
        paused_until: string | null;
        reason: string | null;
        last_failure_status: number | null;
        triggered_by: string | null;
      };
      const pausedUntilMs = pause?.paused_until ? new Date(pause.paused_until).getTime() : 0;
      const isPaused = pausedUntilMs > Date.now();
      const etaHours = throughputPerHour > 0 ? pending / throughputPerHour : Infinity;
      const stalled = !isPaused && pending > 0 && successesLast6h === 0;

      return {
        pending,
        queued,
        missing,
        exhausted,
        successesLast6h,
        throughputPerHour,
        etaHours,
        isPaused,
        pausedUntilMs,
        pauseReason: pause?.reason ?? null,
        pauseStatus: pause?.last_failure_status ?? null,
        pauseTriggeredBy: pause?.triggered_by ?? null,
        stalled,
      };
    },
    refetchInterval: 60_000,
  });

  // Tick to re-render the "X min remaining" countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleResume = async () => {
    setResuming(true);
    try {
      const { error } = await supabase.functions.invoke("admin-resume-apify");
      if (error) throw error;
      toast({ title: "Apify resumed", description: "Pause cleared. Next cron tick will drain the queue." });
      await qc.invalidateQueries({ queryKey: ["x-community-queue-stats"] });
    } catch (e: any) {
      toast({ title: "Resume failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setResuming(false);
    }
  };

  if (isLoading || !stats) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">X Community Queue</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const totalEverNeeded = stats.pending + stats.exhausted + Math.max(stats.successesLast6h, 1);
  const progressPct = Math.min(100, Math.round(((totalEverNeeded - stats.pending) / totalEverNeeded) * 100));
  const remainingMs = Math.max(0, stats.pausedUntilMs - Date.now());
  const remainingMin = Math.ceil(remainingMs / 60_000);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            X Community Resolution Queue
          </CardTitle>
          {stats.isPaused ? (
            <Badge variant="destructive" className="gap-1">
              <PauseCircle className="h-3 w-3" /> PAUSED ({remainingMin}m)
            </Badge>
          ) : stats.stalled ? (
            <Badge variant="destructive" className="gap-1">
              <TrendingDown className="h-3 w-3" /> STALLED
            </Badge>
          ) : stats.pending > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" /> Draining
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">✅ Clean</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.isPaused && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-1">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Apify paused — {stats.pauseStatus ? `HTTP ${stats.pauseStatus}` : "manual"}
            </div>
            {stats.pauseReason && (
              <div className="text-muted-foreground line-clamp-2">{stats.pauseReason}</div>
            )}
            <div className="text-muted-foreground">
              Triggered by: {stats.pauseTriggeredBy ?? "—"} · auto-resumes in {remainingMin}m
            </div>
            <Button size="sm" variant="outline" onClick={handleResume} disabled={resuming} className="mt-1 h-7 gap-1">
              <PlayCircle className="h-3.5 w-3.5" />
              {resuming ? "Resuming…" : "Resume Apify Now"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold">{stats.pending.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">{stats.queued.toLocaleString()} queued / {stats.missing.toLocaleString()} scan</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Throughput</div>
            <div className="text-2xl font-bold">{stats.throughputPerHour.toFixed(0)}<span className="text-sm text-muted-foreground">/hr</span></div>
            <div className="text-[10px] text-muted-foreground">{stats.successesLast6h} ok in 6h</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">ETA</div>
            <div className="text-2xl font-bold">{formatEta(stats.etaHours)}</div>
            <div className="text-[10px] text-muted-foreground">at current rate</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Exhausted (3+ fails)</div>
            <div className="text-2xl font-bold text-destructive">{stats.exhausted.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">manual review</div>
          </div>
        </div>

        <div>
          <Progress value={progressPct} className="h-2" />
          <div className="text-[10px] text-muted-foreground mt-1">Backfill progress: ~{progressPct}%</div>
        </div>

        <p className="text-[10px] text-muted-foreground">
          ETA = pending ÷ avg successful Apify resolves in last 6 h. Pauses fire automatically on Apify
          402/quota responses; SMS sent to admin (+1-226-583-5975) and resumes on next successful call.
        </p>
      </CardContent>
    </Card>
  );
}

export default XCommunityQueueEtaCard;