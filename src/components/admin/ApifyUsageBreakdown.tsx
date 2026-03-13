import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import { Activity, DollarSign, Clock, AlertTriangle, TrendingUp } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#f59e0b", "#ef4444", "#8b5cf6"];

const TIME_RANGES = [
  { value: "1", label: "Last 24h" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

interface FunctionUsage {
  function_name: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  total_credits: number;
  avg_response_time: number;
  error_rate: number;
}

interface DailyUsage {
  date: string;
  calls: number;
  credits: number;
  errors: number;
}

interface EndpointUsage {
  endpoint: string;
  calls: number;
  credits: number;
}

export function ApifyUsageBreakdown() {
  const [days, setDays] = useState("7");

  // Per-function breakdown
  const { data: functionUsage, isLoading: loadingFunctions } = useQuery({
    queryKey: ["apify-function-usage", days],
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
      const { data, error } = await (supabase
        .from("api_usage_log" as any)
        .select("function_name, success, credits_used, response_time_ms")
        .eq("service_name", "apify")
        .gte("timestamp", since) as any);
      if (error) throw error;

      const byFunction: Record<string, { calls: number; success: number; fail: number; credits: number; totalTime: number }> = {};
      for (const row of (data || [])) {
        const fn = row.function_name || "unknown";
        if (!byFunction[fn]) byFunction[fn] = { calls: 0, success: 0, fail: 0, credits: 0, totalTime: 0 };
        byFunction[fn].calls++;
        if (row.success) byFunction[fn].success++;
        else byFunction[fn].fail++;
        byFunction[fn].credits += row.credits_used || 0;
        byFunction[fn].totalTime += row.response_time_ms || 0;
      }

      return Object.entries(byFunction).map(([fn, stats]): FunctionUsage => ({
        function_name: fn,
        total_calls: stats.calls,
        successful_calls: stats.success,
        failed_calls: stats.fail,
        total_credits: stats.credits,
        avg_response_time: stats.calls > 0 ? Math.round(stats.totalTime / stats.calls) : 0,
        error_rate: stats.calls > 0 ? Math.round((stats.fail / stats.calls) * 100) : 0,
      })).sort((a, b) => b.total_calls - a.total_calls);
    },
    refetchInterval: 60000,
  });

  // Daily trend
  const { data: dailyUsage } = useQuery({
    queryKey: ["apify-daily-usage", days],
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
      const { data, error } = await (supabase
        .from("api_usage_log" as any)
        .select("timestamp, credits_used, success")
        .eq("service_name", "apify")
        .gte("timestamp", since)
        .order("timestamp", { ascending: true }) as any);
      if (error) throw error;

      const byDay: Record<string, { calls: number; credits: number; errors: number }> = {};
      for (const row of (data || [])) {
        const day = row.timestamp.split("T")[0];
        if (!byDay[day]) byDay[day] = { calls: 0, credits: 0, errors: 0 };
        byDay[day].calls++;
        byDay[day].credits += row.credits_used || 0;
        if (!row.success) byDay[day].errors++;
      }

      return Object.entries(byDay).map(([date, stats]): DailyUsage => ({
        date: date.slice(5), // MM-DD
        calls: stats.calls,
        credits: stats.credits,
        errors: stats.errors,
      }));
    },
    refetchInterval: 60000,
  });

  // Per-endpoint (Apify actor) breakdown
  const { data: endpointUsage } = useQuery({
    queryKey: ["apify-endpoint-usage", days],
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
      const { data, error } = await (supabase
        .from("api_usage_log" as any)
        .select("endpoint, credits_used")
        .eq("service_name", "apify")
        .gte("timestamp", since) as any);
      if (error) throw error;

      const byEndpoint: Record<string, { calls: number; credits: number }> = {};
      for (const row of (data || [])) {
        const ep = row.endpoint || "unknown";
        if (!byEndpoint[ep]) byEndpoint[ep] = { calls: 0, credits: 0 };
        byEndpoint[ep].calls++;
        byEndpoint[ep].credits += row.credits_used || 0;
      }

      return Object.entries(byEndpoint).map(([endpoint, stats]): EndpointUsage => ({
        endpoint: endpoint.split("~").pop() || endpoint,
        calls: stats.calls,
        credits: stats.credits,
      })).sort((a, b) => b.calls - a.calls);
    },
    refetchInterval: 60000,
  });

  const totalCalls = functionUsage?.reduce((s, f) => s + f.total_calls, 0) || 0;
  const totalCredits = functionUsage?.reduce((s, f) => s + f.total_credits, 0) || 0;
  const totalErrors = functionUsage?.reduce((s, f) => s + f.failed_calls, 0) || 0;
  const avgTime = functionUsage && functionUsage.length > 0
    ? Math.round(functionUsage.reduce((s, f) => s + f.avg_response_time * f.total_calls, 0) / Math.max(totalCalls, 1))
    : 0;

  // Estimated cost ($0.25-$1 per Apify actor run, using $0.50 avg)
  const estimatedCost = (totalCalls * 0.50).toFixed(2);
  const dailyAvg = parseInt(days) > 0 ? (totalCalls / parseInt(days)).toFixed(1) : "0";

  if (loadingFunctions) return <div className="text-sm text-muted-foreground">Loading Apify usage...</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Apify Usage Breakdown
        </h3>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Calls</div>
            <div className="text-2xl font-bold">{totalCalls.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">~{dailyAvg}/day avg</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Est. Cost</div>
            <div className="text-2xl font-bold text-destructive">${estimatedCost}</div>
            <div className="text-xs text-muted-foreground">@$0.50/run avg</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Credits Used</div>
            <div className="text-2xl font-bold">{totalCredits.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Errors</div>
            <div className="text-2xl font-bold text-destructive">{totalErrors}</div>
            <div className="text-xs text-muted-foreground">{totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(1) : 0}% rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Avg Time</div>
            <div className="text-2xl font-bold">{(avgTime / 1000).toFixed(1)}s</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-function table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Per-Function Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4">Function</th>
                  <th className="py-2 pr-4 text-right">Calls</th>
                  <th className="py-2 pr-4 text-right">✅ OK</th>
                  <th className="py-2 pr-4 text-right">❌ Fail</th>
                  <th className="py-2 pr-4 text-right">Credits</th>
                  <th className="py-2 pr-4 text-right">Avg Time</th>
                  <th className="py-2 text-right">Error %</th>
                </tr>
              </thead>
              <tbody>
                {functionUsage?.map((fn) => (
                  <tr key={fn.function_name} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-mono text-xs">{fn.function_name}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fn.total_calls}</td>
                    <td className="py-2 pr-4 text-right text-green-500">{fn.successful_calls}</td>
                    <td className="py-2 pr-4 text-right text-destructive">{fn.failed_calls}</td>
                    <td className="py-2 pr-4 text-right">{fn.total_credits}</td>
                    <td className="py-2 pr-4 text-right">{(fn.avg_response_time / 1000).toFixed(1)}s</td>
                    <td className="py-2 text-right">
                      <Badge variant={fn.error_rate > 20 ? "destructive" : fn.error_rate > 5 ? "secondary" : "outline"} className="text-xs">
                        {fn.error_rate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
                {(!functionUsage || functionUsage.length === 0) && (
                  <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No Apify usage in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily trend chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Daily Call Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyUsage && dailyUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyUsage}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" name="Calls" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="errors" fill="hsl(var(--destructive))" name="Errors" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        {/* Endpoint pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Calls by Apify Actor</CardTitle>
          </CardHeader>
          <CardContent>
            {endpointUsage && endpointUsage.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={endpointUsage} dataKey="calls" nameKey="endpoint" cx="50%" cy="50%" outerRadius={70} label={({ endpoint, percent }) => `${endpoint.slice(0, 20)} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                    {endpointUsage.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Cost estimates are approximate ($0.25–$1.00 per Apify actor run depending on actor type and compute time). 
        Callers: social-mesh-linker (cron), FlipIt dashboard, MeshSpider, X Community Manager, oracle-master-spider, flipit-backfill.
      </p>
    </div>
  );
}

export default ApifyUsageBreakdown;
