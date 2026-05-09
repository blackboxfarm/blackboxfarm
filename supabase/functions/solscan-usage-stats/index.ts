/**
 * solscan-usage-stats
 * Aggregates rows from public.solscan_api_calls for the master Solscan dashboard.
 * Billing cycle: starts on the 8th of each month (Pro plan billing date).
 */
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cycleStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 8, 0, 0, 0));
  if (now.getUTCDate() < 8) d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}
function cycleEnd(start: Date): Date {
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const cycStart = cycleStart(now);
    const cycEnd = cycleEnd(cycStart);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Pull all rows in current cycle (capped at 50k for safety)
    const { data: cycleRows, error } = await supa
      .from("solscan_api_calls")
      .select("ts,endpoint_path,function_name,http_status,duration_ms,from_cache,error_message,response_bytes")
      .gte("ts", cycStart.toISOString())
      .order("ts", { ascending: false })
      .limit(50000);

    if (error) throw error;
    const rows = cycleRows ?? [];

    // Endpoint breakdown
    const byEndpoint = new Map<string, { calls: number; success: number; errors: number; cached: number; totalMs: number; lastError?: string }>();
    const byFunction = new Map<string, { calls: number; success: number; errors: number; totalMs: number }>();
    const byDay = new Map<string, number>();
    const byStatus = new Map<number, number>();
    let cacheHits = 0;
    let net = 0;
    let last24hCalls = 0;
    const recentErrors: any[] = [];

    for (const r of rows) {
      const ok = r.http_status >= 200 && r.http_status < 300;
      const day = (r.ts as string).slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      byStatus.set(r.http_status, (byStatus.get(r.http_status) ?? 0) + 1);
      if (r.from_cache) cacheHits++; else net++;
      if (new Date(r.ts as string) >= dayAgo) last24hCalls++;

      const e = byEndpoint.get(r.endpoint_path) ?? { calls: 0, success: 0, errors: 0, cached: 0, totalMs: 0 };
      e.calls++;
      if (ok) e.success++; else { e.errors++; if (r.error_message && !e.lastError) e.lastError = r.error_message.slice(0, 200); }
      if (r.from_cache) e.cached++;
      e.totalMs += r.duration_ms || 0;
      byEndpoint.set(r.endpoint_path, e);

      const fn = r.function_name || "(unknown)";
      const f = byFunction.get(fn) ?? { calls: 0, success: 0, errors: 0, totalMs: 0 };
      f.calls++;
      if (ok) f.success++; else f.errors++;
      f.totalMs += r.duration_ms || 0;
      byFunction.set(fn, f);

      if (!ok && recentErrors.length < 50) {
        recentErrors.push({
          ts: r.ts,
          endpoint_path: r.endpoint_path,
          function_name: r.function_name,
          http_status: r.http_status,
          error_message: r.error_message?.slice(0, 300),
        });
      }
    }

    const endpoints = Array.from(byEndpoint.entries())
      .map(([endpoint, v]) => ({
        endpoint,
        calls: v.calls,
        success_pct: v.calls ? Math.round((v.success / v.calls) * 1000) / 10 : 0,
        cache_hit_pct: v.calls ? Math.round((v.cached / v.calls) * 1000) / 10 : 0,
        avg_ms: v.calls ? Math.round(v.totalMs / v.calls) : 0,
        last_error: v.lastError ?? null,
      }))
      .sort((a, b) => b.calls - a.calls);

    const functions = Array.from(byFunction.entries())
      .map(([function_name, v]) => ({
        function_name,
        calls: v.calls,
        success_pct: v.calls ? Math.round((v.success / v.calls) * 1000) / 10 : 0,
        avg_ms: v.calls ? Math.round(v.totalMs / v.calls) : 0,
      }))
      .sort((a, b) => b.calls - a.calls);

    // Daily sparkline for the cycle window (fill missing days with 0)
    const sparkline: { day: string; calls: number }[] = [];
    for (let d = new Date(cycStart); d < now; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      sparkline.push({ day: key, calls: byDay.get(key) ?? 0 });
    }

    const daysIntoCycle = Math.max(
      1,
      Math.floor((now.getTime() - cycStart.getTime()) / 86_400_000) + 1,
    );
    const totalCycleDays = Math.round((cycEnd.getTime() - cycStart.getTime()) / 86_400_000);
    const projectedCycleTotal = Math.round((rows.length / daysIntoCycle) * totalCycleDays);

    return new Response(
      JSON.stringify({
        cycle: {
          start: cycStart.toISOString(),
          end: cycEnd.toISOString(),
          days_into_cycle: daysIntoCycle,
          total_cycle_days: totalCycleDays,
          days_remaining: Math.max(0, totalCycleDays - daysIntoCycle),
        },
        totals: {
          calls_cycle: rows.length,
          calls_24h: last24hCalls,
          cache_hits: cacheHits,
          network_calls: net,
          cache_hit_pct: rows.length ? Math.round((cacheHits / rows.length) * 1000) / 10 : 0,
          projected_cycle_total: projectedCycleTotal,
        },
        status_codes: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
        endpoints,
        functions,
        sparkline,
        recent_errors: recentErrors,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});