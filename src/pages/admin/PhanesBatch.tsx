import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Play, Square, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Admin: Phanes Batch
 * Drives the existing `phanes-x-query` MTProto edge function over a queue
 * of X handles. Throttles at 90s/call with a 50/day cap (Phanes ToS risk).
 */

const THROTTLE_MS = 90_000;
const DAILY_CAP = 50;

interface Row {
  current_handle: string;
  x_user_id: string;
  phanes_queried_at: string | null;
  phanes_recycled_accounts: any;
  phanes_username_history: any;
}

function todayKey() {
  const d = new Date();
  return `phanes-batch-count-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function getDailyCount(): number {
  return Number(localStorage.getItem(todayKey()) || "0");
}
function bumpDailyCount() {
  localStorage.setItem(todayKey(), String(getDailyCount() + 1));
}

export default function PhanesBatch() {
  const [running, setRunning] = useState(false);
  const [stopFlag, setStopFlag] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [log, setLog] = useState<string[]>([]);
  const [dailyCount, setDailyCount] = useState(getDailyCount());

  const appendLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));

  const { data: queue, refetch } = useQuery({
    queryKey: ["phanes-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("x_account_registry")
        .select("current_handle, x_user_id, phanes_queried_at, phanes_recycled_accounts, phanes_username_history")
        .is("phanes_queried_at", null)
        .order("first_seen_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data || []) as Row[];
    },
    refetchInterval: 30_000,
  });

  const { data: recent } = useQuery({
    queryKey: ["phanes-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("x_account_registry")
        .select("current_handle, phanes_queried_at, phanes_recycled_accounts, phanes_username_history")
        .not("phanes_queried_at", "is", null)
        .order("phanes_queried_at", { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
    refetchInterval: 30_000,
  });

  const totalUnqueried = queue?.length ?? 0;

  async function runOne(handle: string) {
    appendLog(`→ DM /x @${handle} via MTProto…`);
    const { data, error } = await supabase.functions.invoke("phanes-x-query", {
      body: { action: "single", handle },
    });
    if (error) {
      appendLog(`  ✗ error: ${error.message}`);
      return;
    }
    const r = data?.result;
    if (r?.replyFound && r?.parsed) {
      appendLog(
        `  ✓ recycled=${r.parsed.isRecycled} | accounts=${r.parsed.recycledAccounts?.length ?? 0} | history=${r.parsed.usernameHistory?.length ?? 0}`,
      );
    } else {
      appendLog(`  ⚠ ${r?.error || "no reply parsed"}`);
    }
    bumpDailyCount();
    setDailyCount(getDailyCount());
  }

  async function runBatch() {
    if (running) return;
    setRunning(true);
    setStopFlag(false);
    appendLog(`▶ Starting batch of ${batchSize} (throttle ${THROTTLE_MS / 1000}s, daily cap ${DAILY_CAP})`);
    const list = (queue || []).slice(0, batchSize);
    for (let i = 0; i < list.length; i++) {
      if (stopFlag) {
        appendLog("■ Stopped by user");
        break;
      }
      if (getDailyCount() >= DAILY_CAP) {
        appendLog(`■ Daily cap (${DAILY_CAP}) reached — stopping`);
        break;
      }
      await runOne(list[i].current_handle);
      if (i < list.length - 1) {
        appendLog(`  …waiting ${THROTTLE_MS / 1000}s`);
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }
    setRunning(false);
    refetch();
    toast({ title: "Phanes batch complete" });
  }

  const remainingToday = Math.max(0, DAILY_CAP - dailyCount);

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/super-admin">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Phanes Batch Capture</CardTitle>
          <CardDescription>
            Queries @Phanes_bot from our MTProto user account and writes recycled-handle + username-history data to{" "}
            <code>x_account_registry</code>. Throttled to <strong>90s/call</strong> and capped at{" "}
            <strong>{DAILY_CAP}/day</strong> to stay below Phanes' bot-detection radar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Un-queried handles</p>
              <p className="text-2xl font-bold">{totalUnqueried}+</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Captured today</p>
              <p className="text-2xl font-bold">{dailyCount} / {DAILY_CAP}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining today</p>
              <p className="text-2xl font-bold">{remainingToday}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="batch-size" className="text-xs">Batch size</Label>
              <Input
                id="batch-size"
                type="number"
                min={1}
                max={DAILY_CAP}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(DAILY_CAP, Number(e.target.value) || 1)))}
                className="w-24"
              />
            </div>
            {!running ? (
              <Button onClick={runBatch} disabled={remainingToday === 0 || totalUnqueried === 0}>
                <Play className="h-4 w-4 mr-2" />
                Run batch
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setStopFlag(true)}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh queue
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded p-3 h-64 overflow-y-auto font-mono text-xs space-y-1">
            {log.length === 0 ? (
              <p className="text-muted-foreground">No activity yet.</p>
            ) : (
              log.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next in queue (top 25)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>@handle</TableHead>
                <TableHead>X user ID</TableHead>
                <TableHead className="w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(queue || []).slice(0, 25).map((r) => (
                <TableRow key={r.x_user_id}>
                  <TableCell className="font-mono text-xs">@{r.current_handle}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.x_user_id}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={running || remainingToday === 0}
                      onClick={() => runOne(r.current_handle).then(() => refetch())}
                    >
                      Run now
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently captured</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>@handle</TableHead>
                <TableHead>Captured</TableHead>
                <TableHead>Recycled</TableHead>
                <TableHead>History</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recent || []).map((r: any) => {
                const recArr = Array.isArray(r.phanes_recycled_accounts) ? r.phanes_recycled_accounts : [];
                const histArr = Array.isArray(r.phanes_username_history) ? r.phanes_username_history : [];
                return (
                  <TableRow key={r.current_handle}>
                    <TableCell className="font-mono text-xs">@{r.current_handle}</TableCell>
                    <TableCell className="text-xs">
                      {r.phanes_queried_at ? new Date(r.phanes_queried_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      {recArr.length > 0 ? (
                        <Badge variant="destructive">{recArr.length}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">none</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {histArr.length > 0 ? (
                        <Badge variant="secondary">{histArr.length}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">none</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}