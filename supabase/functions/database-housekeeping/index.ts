import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PruneResult {
  table: string;
  rowsBefore: number;
  rowsDeleted: number;
  rowsAfter: number;
  retentionDays: number;
}

// Default retention policies (in days)
const DEFAULT_RETENTION: Record<string, number> = {
  'api_usage_log': 30,
  'activity_logs': 30,
  'arb_opportunities': 14,
  'arb_price_snapshots': 14,
  'admin_notifications': 60,
  'banner_impressions': 90,
  'banner_clicks': 90,
  'helius_api_usage': 30,
};

// Snapshot helius usage data before pruning (aggregated by day + function)
async function snapshotHeliusUsage(supabase: any, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600_000).toISOString();
  
  // Get aggregated data for rows that will be pruned
  const { data, error } = await supabase.rpc('get_helius_usage_for_snapshot', {
    p_cutoff: cutoff,
  });

  // Fallback: if RPC doesn't exist, query directly
  if (error) {
    console.log('[housekeeping] RPC not found, using direct query for snapshot');
    const { data: rawData } = await supabase
      .from('helius_api_usage')
      .select('function_name, credits_used, success, response_time_ms, timestamp')
      .lt('timestamp', cutoff)
      .limit(10000);

    if (!rawData || rawData.length === 0) return 0;

    // Aggregate manually
    const byDayFn: Record<string, {
      calls: number; credits: number; success: number; failed: number; totalTime: number;
    }> = {};

    for (const row of rawData) {
      const day = row.timestamp?.substring(0, 10);
      const key = `${day}|${row.function_name}`;
      if (!byDayFn[key]) byDayFn[key] = { calls: 0, credits: 0, success: 0, failed: 0, totalTime: 0 };
      byDayFn[key].calls++;
      byDayFn[key].credits += row.credits_used || 0;
      if (row.success) byDayFn[key].success++; else byDayFn[key].failed++;
      byDayFn[key].totalTime += row.response_time_ms || 0;
    }

    const snapshots = Object.entries(byDayFn).map(([key, v]) => {
      const [date, fn] = key.split('|');
      return {
        snapshot_date: date,
        function_name: fn,
        total_calls: v.calls,
        total_credits: v.credits,
        successful_calls: v.success,
        failed_calls: v.failed,
        avg_response_time_ms: v.calls > 0 ? Math.round(v.totalTime / v.calls) : 0,
      };
    });

    if (snapshots.length > 0) {
      await supabase.from('helius_usage_snapshots').upsert(snapshots, {
        onConflict: 'snapshot_date,function_name',
      });
    }

    return snapshots.length;
  }

  // If RPC worked, insert results
  if (data && data.length > 0) {
    await supabase.from('helius_usage_snapshots').upsert(data, {
      onConflict: 'snapshot_date,function_name',
    });
  }

  return data?.length || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: { dryRun?: boolean; retentionOverrides?: Record<string, number>; action?: string } = {};
    try {
      body = await req.json();
    } catch { /* empty body is fine for cron */ }

    const dryRun = body.dryRun ?? false;
    const action = body.action ?? 'prune';

    // ── Action: Stats only ──
    if (action === 'stats') {
      const stats = await getTableStats(supabase);
      return new Response(
        JSON.stringify({ stats, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: Snapshot helius usage (can be called manually) ──
    if (action === 'snapshot_helius') {
      const snapshotCount = await snapshotHeliusUsage(supabase, 0); // snapshot all data
      return new Response(
        JSON.stringify({ action: 'snapshot_helius', snapshotsCreated: snapshotCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: Bulk dismiss old read notifications ──
    if (action === 'prune_notifications') {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      
      const { count: before } = await supabase
        .from('admin_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', true)
        .lt('created_at', cutoff);

      if (!dryRun && before && before > 0) {
        await supabase
          .from('admin_notifications')
          .delete()
          .eq('is_read', true)
          .lt('created_at', cutoff);
      }

      const oldCutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      if (!dryRun) {
        await supabase
          .from('admin_notifications')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('is_read', false)
          .lt('created_at', oldCutoff);
      }

      return new Response(
        JSON.stringify({ 
          action: 'prune_notifications', dryRun,
          readNotificationsDeleted: before || 0, cutoffDate: cutoff,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: Prune tables ──
    const retention = { ...DEFAULT_RETENTION, ...(body.retentionOverrides || {}) };
    const results: PruneResult[] = [];

    // ** Auto-snapshot helius usage BEFORE pruning **
    let heliusSnapshotCount = 0;
    if (!dryRun && retention['helius_api_usage']) {
      try {
        heliusSnapshotCount = await snapshotHeliusUsage(supabase, retention['helius_api_usage']);
        console.log(`[housekeeping] Snapshotted ${heliusSnapshotCount} helius usage aggregates before pruning`);
      } catch (e: any) {
        console.error('[housekeeping] Helius snapshot failed:', e.message);
      }
    }

    const timestampCol: Record<string, string> = {
      'api_usage_log': 'timestamp',
      'activity_logs': 'timestamp',
      'arb_opportunities': 'detected_at',
      'arb_price_snapshots': 'timestamp',
      'admin_notifications': 'created_at',
      'banner_impressions': 'created_at',
      'banner_clicks': 'created_at',
      'helius_api_usage': 'timestamp',
    };

    for (const [table, days] of Object.entries(retention)) {
      const col = timestampCol[table];
      if (!col) continue;

      const cutoff = new Date(Date.now() - days * 24 * 3600_000).toISOString();

      const { count: totalRows } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      const { count: oldRows } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .lt(col, cutoff);

      const rowsToDelete = oldRows || 0;

      if (!dryRun && rowsToDelete > 0) {
        await supabase
          .from(table)
          .delete()
          .lt(col, cutoff);
      }

      results.push({
        table,
        rowsBefore: totalRows || 0,
        rowsDeleted: dryRun ? 0 : rowsToDelete,
        rowsAfter: (totalRows || 0) - (dryRun ? 0 : rowsToDelete),
        retentionDays: days,
      });
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.rowsDeleted, 0);
    const elapsed = Date.now() - startTime;

    await supabase.from('activity_logs').insert({
      message: `[housekeeping] ${dryRun ? 'DRY RUN' : 'PRUNED'}: ${totalDeleted} rows deleted across ${results.length} tables (${elapsed}ms)`,
      log_level: 'info',
      metadata: { dryRun, results, elapsed, heliusSnapshotCount },
    });

    if (totalDeleted > 1000 && !dryRun) {
      await supabase.from('admin_notifications').insert({
        title: '🧹 Database Housekeeping Complete',
        message: `Pruned ${totalDeleted.toLocaleString()} old rows across ${results.length} tables. ${heliusSnapshotCount} Helius usage snapshots preserved.`,
        notification_type: 'housekeeping',
        metadata: { totalDeleted, results, heliusSnapshotCount },
      });
    }

    console.log(`[housekeeping] ${dryRun ? 'DRY RUN' : 'DONE'}: ${totalDeleted} rows, ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        action: 'prune', dryRun, totalDeleted, heliusSnapshotCount,
        executionMs: elapsed, timestamp: new Date().toISOString(), results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[housekeeping] Fatal:', error.message);
    return new Response(
      JSON.stringify({ status: 'error', error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getTableStats(supabase: any) {
  const tables = [
    'api_usage_log', 'activity_logs', 'arb_opportunities', 'arb_price_snapshots',
    'admin_notifications', 'banner_impressions', 'banner_clicks',
    'blackbox_transactions', 'helius_api_usage',
  ];

  const stats = [];
  for (const table of tables) {
    try {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      stats.push({ table, rowCount: count || 0, retentionDays: DEFAULT_RETENTION[table] || null });
    } catch {
      stats.push({ table, rowCount: -1, error: 'could not query' });
    }
  }
  return stats;
}