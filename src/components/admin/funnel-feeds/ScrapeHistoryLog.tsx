import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Filter } from "lucide-react";

interface ScrapeLogEntry {
  id: string;
  source_label: string | null;
  source_url: string;
  success: boolean;
  pair_count: number;
  provider: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export function ScrapeHistoryLog() {
  const [logs, setLogs] = useState<ScrapeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failuresOnly, setFailuresOnly] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("dex_scrape_log")
      .select("id, source_label, source_url, success, pair_count, provider, error_message, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (failuresOnly) {
      query = query.eq("success", false);
    }

    const { data } = await query;
    setLogs((data as ScrapeLogEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [failuresOnly]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Scrape History</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={failuresOnly ? "default" : "outline"}
            onClick={() => setFailuresOnly(!failuresOnly)}
            className="text-xs"
          >
            <Filter className="h-3 w-3 mr-1" />
            {failuresOnly ? "Failures Only" : "All"}
          </Button>
          <Button size="sm" variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {loading ? "Loading…" : "No scrape logs yet."}
        </p>
      ) : (
        <div className="max-h-[300px] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead compact>Time</TableHead>
                <TableHead compact>Source</TableHead>
                <TableHead compact>Status</TableHead>
                <TableHead compact>Pairs</TableHead>
                <TableHead compact>Provider</TableHead>
                <TableHead compact>Duration</TableHead>
                <TableHead compact>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className={log.success ? "" : "bg-destructive/5"}>
                  <TableCell compact className="text-muted-foreground font-mono whitespace-nowrap">
                    {fmtTime(log.created_at)}
                  </TableCell>
                  <TableCell compact className="max-w-[150px] truncate" title={log.source_url}>
                    {log.source_label || "Unknown"}
                  </TableCell>
                  <TableCell compact>
                    <Badge variant="outline" className={log.success
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                    }>
                      {log.success ? "✅" : "❌"}
                    </Badge>
                  </TableCell>
                  <TableCell compact className="font-mono">{log.pair_count}</TableCell>
                  <TableCell compact className="text-muted-foreground">{log.provider || "—"}</TableCell>
                  <TableCell compact className="font-mono">
                    {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </TableCell>
                  <TableCell compact className="max-w-[200px] truncate text-red-400" title={log.error_message || ""}>
                    {log.error_message || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
