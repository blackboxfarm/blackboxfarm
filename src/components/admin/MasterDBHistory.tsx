import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays } from "date-fns";

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  funnel_feed: { label: "Telegram Funnel", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  pump_monitor: { label: "Pump Monitor", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  holders_intel: { label: "Holders Intel", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  lifecycle: { label: "Lifecycle", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  mesh: { label: "Mesh Network", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  scraper: { label: "Scraper", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  "dexscreener-trending": { label: "Dex Top 50", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  manual: { label: "Manual", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

function getSourceInfo(source: string) {
  return SOURCE_LABELS[source] ?? { label: source || "Unknown", color: "bg-muted text-muted-foreground border-border" };
}

type DayRow = { day: string; source: string; count: number };

export default function MasterDBHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ["master-db-history"],
    queryFn: async () => {
      // Get daily counts by source for the last 14 days
      const since = format(subDays(new Date(), 14), "yyyy-MM-dd");
      const { data: rows, error } = await supabase
        .from("master_token_directory" as any)
        .select("discovery_source, created_at")
        .gte("created_at", since);

      if (error) throw error;

      // Aggregate client-side since materialized views can't do grouping via PostgREST
      const map = new Map<string, Map<string, number>>();
      for (const row of (rows as any[]) ?? []) {
        const day = row.created_at ? format(new Date(row.created_at), "yyyy-MM-dd") : "unknown";
        const src = row.discovery_source || "unknown";
        if (!map.has(day)) map.set(day, new Map());
        const dayMap = map.get(day)!;
        dayMap.set(src, (dayMap.get(src) || 0) + 1);
      }

      const result: DayRow[] = [];
      for (const [day, sources] of map) {
        for (const [source, count] of sources) {
          result.push({ day, source, count });
        }
      }
      result.sort((a, b) => b.day.localeCompare(a.day) || b.count - a.count);
      return result;
    },
    staleTime: 60_000,
  });

  // Group by day
  const grouped = new Map<string, DayRow[]>();
  for (const row of data ?? []) {
    if (!grouped.has(row.day)) grouped.set(row.day, []);
    grouped.get(row.day)!.push(row);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          Daily Additions (Last 14 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : grouped.size === 0 ? (
          <p className="text-muted-foreground text-sm">No data available.</p>
        ) : (
          <div className="space-y-4">
            {[...grouped.entries()].map(([day, rows]) => {
              const dayTotal = rows.reduce((s, r) => s + r.count, 0);
              const displayDate = day === "unknown" ? "Unknown Date" : format(new Date(day + "T00:00:00"), "EEE, MMM d");
              return (
                <div key={day} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">{displayDate}</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {dayTotal.toLocaleString()} total
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {rows.map((r) => {
                      const info = getSourceInfo(r.source);
                      return (
                        <div key={r.source} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${info.color}`}>
                              {info.label}
                            </Badge>
                          </div>
                          <span className="font-mono text-muted-foreground">
                            {r.count.toLocaleString()} tokens
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
