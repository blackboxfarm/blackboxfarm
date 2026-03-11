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
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for optional overrides
    let body: { dryRun?: boolean; retentionOverrides?: Record<string, number>; action?: string } = {};
    try {
      body = await req.json();
    } catch { /* empty body is fine for cron */ }

    const dryRun = body.dryRun ?? false;
    const action = body.action ?? 'prune'; // 'prune' | 'stats' | 'prune_notifications'

    // ── Action: Stats only ──
    if (action === 'stats') {
      const stats = await getTableStats(supabase);
      return new Response(
        JSON.stringify({ stats, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: Bulk dismiss old read notifications ──
    if (action === 'prune_notifications') {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      
      // Count before
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

      // Also mark all unread notifications older than 30 days as read
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
          action: 'prune_notifications',
          dryRun,
          readNotificationsDeleted: before || 0,
          cutoffDate: cutoff,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: Prune tables ──
    const retention = { ...DEFAULT_RETENTION, ...(body.retentionOverrides || {}) };
    const results: PruneResult[] = [];

    // Timestamp column mapping
    const timestampCol: Record<string, string> = {
      'api_usage_log': 'timestamp',
      'activity_logs': 'timestamp',
      'arb_opportunities': 'detected_at',
      'arb_price_snapshots': 'timestamp',
      'admin_notifications': 'created_at',
      'banner_impressions': 'created_at',
      'banner_clicks': 'created_at',
    };

    for (const [table, days] of Object.entries(retention)) {
      const col = timestampCol[table];
      if (!col) continue;

      const cutoff = new Date(Date.now() - days * 24 * 3600_000).toISOString();

      // Count total rows
      const { count: totalRows } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      // Count rows to delete
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

    // Log the housekeeping run
    await supabase.from('activity_logs').insert({
      message: `[housekeeping] ${dryRun ? 'DRY RUN' : 'PRUNED'}: ${totalDeleted} rows deleted across ${results.length} tables (${elapsed}ms)`,
      log_level: 'info',
      metadata: { dryRun, results, elapsed },
    });

    // Write alert if significant cleanup happened
    if (totalDeleted > 1000 && !dryRun) {
      await supabase.from('admin_notifications').insert({
        title: '🧹 Database Housekeeping Complete',
        message: `Pruned ${totalDeleted.toLocaleString()} old rows across ${results.length} tables.`,
        notification_type: 'housekeeping',
        metadata: { totalDeleted, results },
      });
    }

    console.log(`[housekeeping] ${dryRun ? 'DRY RUN' : 'DONE'}: ${totalDeleted} rows, ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        action: 'prune',
        dryRun,
        totalDeleted,
        executionMs: elapsed,
        timestamp: new Date().toISOString(),
        results,
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
