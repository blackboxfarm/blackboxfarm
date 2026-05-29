import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from "../_shared/run-logger.ts";
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheck {
  check: string;
  status: 'ok' | 'warning' | 'critical';
  details: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(withRunLog('system-health-audit', async (req) => {
  if (!await isFunctionEnabled('system-health-audit')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const checks: HealthCheck[] = [];
    const alerts: { title: string; message: string; type: string; metadata: Record<string, unknown> }[] = [];

    // ── Check 1: API failure rates (last 1 hour) ──
    const { data: apiFailures } = await supabase.rpc('get_service_usage_today', { p_service_name: '' }).maybeSingle();
    
    // Direct query for per-service failure rates in last hour
    const { data: serviceStats } = await supabase
      .from('api_usage_log')
      .select('service_name, success')
      .gte('timestamp', new Date(Date.now() - 3600_000).toISOString());

    if (serviceStats && serviceStats.length > 0) {
      const byService: Record<string, { total: number; failures: number }> = {};
      for (const row of serviceStats) {
        if (!byService[row.service_name]) byService[row.service_name] = { total: 0, failures: 0 };
        byService[row.service_name].total++;
        if (!row.success) byService[row.service_name].failures++;
      }

      for (const [svc, stats] of Object.entries(byService)) {
        const failRate = stats.total > 0 ? (stats.failures / stats.total) * 100 : 0;
        
        if (failRate >= 90 && stats.total >= 5) {
          checks.push({ check: `api_${svc}`, status: 'critical', details: `${svc}: ${stats.failures}/${stats.total} failed (${failRate.toFixed(0)}%)` });
          alerts.push({
            title: `🔴 ${svc} API Critical Failure`,
            message: `${svc} has a ${failRate.toFixed(0)}% failure rate in the last hour (${stats.failures}/${stats.total} calls failed).`,
            type: 'api_failure_critical',
            metadata: { service: svc, fail_rate: failRate, failures: stats.failures, total: stats.total }
          });
        } else if (failRate >= 50 && stats.total >= 5) {
          checks.push({ check: `api_${svc}`, status: 'warning', details: `${svc}: ${stats.failures}/${stats.total} failed (${failRate.toFixed(0)}%)` });
          alerts.push({
            title: `🟡 ${svc} API Degraded`,
            message: `${svc} has a ${failRate.toFixed(0)}% failure rate in the last hour.`,
            type: 'api_failure_warning',
            metadata: { service: svc, fail_rate: failRate, failures: stats.failures, total: stats.total }
          });
        } else {
          checks.push({ check: `api_${svc}`, status: 'ok', details: `${svc}: ${stats.total} calls, ${failRate.toFixed(0)}% failure` });
        }
      }
    } else {
      checks.push({ check: 'api_usage', status: 'ok', details: 'No API calls in last hour' });
    }

    // ── Check 2: Quota usage approaching limits ──
    const { data: quotaServices } = await supabase
      .from('api_service_config')
      .select('service_name, display_name, monthly_quota, monthly_quota_used')
      .eq('is_enabled', true)
      .not('monthly_quota', 'is', null);

    if (quotaServices) {
      for (const svc of quotaServices) {
        if (!svc.monthly_quota || svc.monthly_quota === 0) continue;
        const pct = ((svc.monthly_quota_used || 0) / svc.monthly_quota) * 100;
        
        if (pct >= 90) {
          checks.push({ check: `quota_${svc.service_name}`, status: 'critical', details: `${svc.display_name}: ${pct.toFixed(1)}% of monthly quota used` });
          alerts.push({
            title: `🔴 ${svc.display_name} Quota Critical`,
            message: `${svc.display_name} has used ${pct.toFixed(1)}% of its monthly quota (${svc.monthly_quota_used}/${svc.monthly_quota}).`,
            type: 'quota_critical',
            metadata: { service: svc.service_name, usage_pct: pct, used: svc.monthly_quota_used, limit: svc.monthly_quota }
          });
        } else if (pct >= 75) {
          checks.push({ check: `quota_${svc.service_name}`, status: 'warning', details: `${svc.display_name}: ${pct.toFixed(1)}% quota used` });
          alerts.push({
            title: `🟡 ${svc.display_name} Quota Warning`,
            message: `${svc.display_name} has used ${pct.toFixed(1)}% of its monthly quota.`,
            type: 'quota_warning',
            metadata: { service: svc.service_name, usage_pct: pct }
          });
        } else {
          checks.push({ check: `quota_${svc.service_name}`, status: 'ok', details: `${svc.display_name}: ${pct.toFixed(1)}% used` });
        }
      }
    }

    // ── Check 3: Repeated error patterns (same endpoint failing 10+ times in 6h) ──
    const { data: errorPatterns } = await supabase
      .from('api_usage_log')
      .select('endpoint, error_message, service_name')
      .eq('success', false)
      .gte('timestamp', new Date(Date.now() - 6 * 3600_000).toISOString());

    if (errorPatterns && errorPatterns.length > 0) {
      const grouped: Record<string, { count: number; service: string; error: string | null }> = {};
      for (const row of errorPatterns) {
        const key = `${row.service_name}:${row.endpoint}`;
        if (!grouped[key]) grouped[key] = { count: 0, service: row.service_name, error: row.error_message };
        grouped[key].count++;
      }

      for (const [key, info] of Object.entries(grouped)) {
        if (info.count >= 20) {
          checks.push({ check: `repeat_error_${key}`, status: 'critical', details: `${key}: ${info.count} failures in 6h` });
          alerts.push({
            title: `🔴 Repeated Failures: ${info.service}`,
            message: `Endpoint ${key.split(':')[1]} has failed ${info.count} times in the last 6 hours. Error: ${info.error || 'unknown'}`,
            type: 'repeated_failure',
            metadata: { endpoint: key, count: info.count, error: info.error }
          });
        } else if (info.count >= 10) {
          checks.push({ check: `repeat_error_${key}`, status: 'warning', details: `${key}: ${info.count} failures in 6h` });
        }
      }
    }

    // ── Check 4: Critical function heartbeat (poster, dex-scanner, scheduler) ──
    const heartbeatFunctions = [
      { name: 'holders-intel-poster', maxStaleMins: 15, label: 'HoldersIntel Poster' },
      { name: 'holders-intel-dex-scanner', maxStaleMins: 15, label: 'HoldersIntel Dex Scanner' },
      { name: 'holders-intel-scheduler', maxStaleMins: 90, label: 'HoldersIntel Scheduler' },
    ];

    for (const fn of heartbeatFunctions) {
      const { data: lastRun } = await supabase
        .from('edge_function_runs')
        .select('started_at, status, duration_ms, error_message')
        .eq('function_name', fn.name)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastRun) {
        checks.push({ check: `heartbeat_${fn.name}`, status: 'critical', details: `${fn.label}: No runs found at all!` });
        alerts.push({
          title: `🔴 ${fn.label} — Never Ran`,
          message: `${fn.label} has no recorded runs in edge_function_runs. Cron job may be missing.`,
          type: `heartbeat_missing_${fn.name}`,
          metadata: { function_name: fn.name },
        });
      } else {
        const ageMins = (Date.now() - new Date(lastRun.started_at).getTime()) / 60_000;
        const ageStr = ageMins < 60 ? `${Math.round(ageMins)}m ago` : `${(ageMins / 60).toFixed(1)}h ago`;

        if (ageMins > fn.maxStaleMins * 4) {
          // Over 4x the expected interval = critical
          checks.push({ check: `heartbeat_${fn.name}`, status: 'critical', details: `${fn.label}: Last run ${ageStr} (expected every ${fn.maxStaleMins}m)` });
          alerts.push({
            title: `🔴 ${fn.label} — DEAD (${ageStr})`,
            message: `${fn.label} hasn't run in ${ageStr}. Expected every ${fn.maxStaleMins} min. Last status: ${lastRun.status}. Cron job likely missing or function is crashing.${lastRun.error_message ? ` Error: ${lastRun.error_message}` : ''}`,
            type: `heartbeat_dead_${fn.name}`,
            metadata: { function_name: fn.name, last_run: lastRun.started_at, age_mins: Math.round(ageMins), last_status: lastRun.status },
          });
        } else if (ageMins > fn.maxStaleMins * 2) {
          // Over 2x = warning
          checks.push({ check: `heartbeat_${fn.name}`, status: 'warning', details: `${fn.label}: Last run ${ageStr} (stale)` });
          alerts.push({
            title: `🟡 ${fn.label} — Stale (${ageStr})`,
            message: `${fn.label} last ran ${ageStr}. Expected every ${fn.maxStaleMins} min. May be failing silently.`,
            type: `heartbeat_stale_${fn.name}`,
            metadata: { function_name: fn.name, last_run: lastRun.started_at, age_mins: Math.round(ageMins) },
          });
        } else if (lastRun.status === 'error') {
          checks.push({ check: `heartbeat_${fn.name}`, status: 'warning', details: `${fn.label}: Last run errored ${ageStr}` });
          alerts.push({
            title: `🟡 ${fn.label} — Last Run Failed`,
            message: `${fn.label} ran ${ageStr} but ended in error: ${lastRun.error_message || 'unknown'}`,
            type: `heartbeat_error_${fn.name}`,
            metadata: { function_name: fn.name, last_run: lastRun.started_at, error: lastRun.error_message },
          });
        } else {
          checks.push({ check: `heartbeat_${fn.name}`, status: 'ok', details: `${fn.label}: healthy (${ageStr}, ${lastRun.status})` });
        }
      }
    }

    // ── Check 5: Auto-prune log tables (no nag alerts) ──
    // Per-table retention enforced by public.prune_log_tables() RPC + nightly cron.
    // If the audit catches bloat between cron runs we prune on the spot and emit
    // an informational notification instead of a warning.
    const logTables = ['api_usage_log', 'activity_logs', 'arb_opportunities', 'arb_price_snapshots', 'helius_api_usage'];
    let triggeredEarlyPrune = false;
    const preCounts: Record<string, number> = {};
    for (const table of logTables) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      preCounts[table] = count || 0;
      if ((count || 0) > 500_000) triggeredEarlyPrune = true;
      checks.push({ check: `table_size_${table}`, status: 'ok', details: `${table}: ${(count || 0).toLocaleString()} rows` });
    }

    if (triggeredEarlyPrune) {
      const { data: pruneResult, error: pruneErr } = await supabase.rpc('prune_log_tables');
      if (pruneErr) {
        alerts.push({
          title: `🔴 Auto-Prune Failed`,
          message: `prune_log_tables() RPC error: ${pruneErr.message}`,
          type: 'auto_prune_failed',
          metadata: { error: pruneErr.message, pre_counts: preCounts },
        });
      } else {
        const pruned = pruneResult as Record<string, number> | null;
        const summary = pruned
          ? Object.entries(pruned)
              .filter(([k, v]) => k !== 'pruned_at' && typeof v === 'number' && v > 0)
              .map(([k, v]) => `${k}: ${(v as number).toLocaleString()}`)
              .join(', ')
          : 'no rows pruned';
        alerts.push({
          title: `🧹 Auto-Pruned Log Tables`,
          message: `Bloat detected → ran prune_log_tables() automatically. Pruned ${summary || 'nothing (all within retention)'}.`,
          type: 'auto_prune_ran',
          metadata: { pre_counts: preCounts, pruned: pruned },
        });
      }
    }

    // ── Check 6: Unread admin notifications piling up ──
    const { count: unreadCount } = await supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    if (unreadCount && unreadCount > 50) {
      checks.push({ check: 'unread_notifications', status: 'warning', details: `${unreadCount} unread admin notifications` });
    } else {
      checks.push({ check: 'unread_notifications', status: 'ok', details: `${unreadCount || 0} unread` });
    }

    // ── Write alerts to admin_notifications (deduplicated by type in last 2h) ──
    let alertsWritten = 0;
    for (const alert of alerts) {
      // Check if we already sent this type of alert recently
      const { data: recent } = await supabase
        .from('admin_notifications')
        .select('id')
        .eq('notification_type', alert.type)
        .gte('created_at', new Date(Date.now() - 2 * 3600_000).toISOString())
        .limit(1);

      if (!recent || recent.length === 0) {
        await supabase.from('admin_notifications').insert({
          title: alert.title,
          message: alert.message,
          notification_type: alert.type,
          metadata: alert.metadata,
        });
        alertsWritten++;
      }
    }

    const elapsed = Date.now() - startTime;
    const criticalCount = checks.filter(c => c.status === 'critical').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

    // ── Write to service_status table for each tracked service ──
    const trackedServices = ['helius', 'solscan', 'dexscreener', 'rugcheck', 'pumpfun', 'jupiter', 'coingecko', 'apify', 'bonkfun', 'bagsfm'];
    for (const svc of trackedServices) {
      const check = checks.find(c => c.check === `api_${svc}`);
      const svcStatus = check ? check.status : 'ok';
      const statusLabel = svcStatus === 'critical' ? 'down' : svcStatus === 'warning' ? 'degraded' : 'operational';
      try {
        await supabase.from('service_status').upsert({
          service_name: svc,
          status: statusLabel,
          last_checked_at: new Date().toISOString(),
          message: check?.details || 'No recent activity',
          metadata: check?.metadata || {},
        }, { onConflict: 'service_name' });
      } catch (e) {
        console.warn(`[health-audit] Failed to update service_status for ${svc}:`, e);
      }
    }

    // ── Auto-reconcile cron jobs ──
    try {
      const reconcileRes = await fetch(`${supabaseUrl}/functions/v1/reconcile-cron-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      });
      const reconcileData = await reconcileRes.json();
      if (reconcileData.missing?.length > 0) {
        checks.push({
          check: 'cron_reconciliation',
          status: reconcileData.restored?.length > 0 ? 'warning' : 'critical',
          details: `${reconcileData.missing.length} cron jobs were missing, ${reconcileData.restored?.length || 0} restored`,
          metadata: reconcileData,
        });
      } else {
        checks.push({ check: 'cron_reconciliation', status: 'ok', details: `All ${reconcileData.total_required} cron jobs present` });
      }
    } catch (e) {
      console.warn('[health-audit] Cron reconciliation call failed:', e);
      checks.push({ check: 'cron_reconciliation', status: 'warning', details: `Reconciliation call failed: ${e.message}` });
    }

    console.log(`[health-audit] ${overallStatus.toUpperCase()}: ${checks.length} checks, ${criticalCount} critical, ${warningCount} warnings, ${alertsWritten} new alerts (${elapsed}ms)`);

    return new Response(
      JSON.stringify({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        executionMs: elapsed,
        summary: { total: checks.length, critical: criticalCount, warnings: warningCount, ok: checks.length - criticalCount - warningCount },
        alertsWritten,
        checks,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[health-audit] Fatal:', (error as Error).message);
    return new Response(
      JSON.stringify({ status: 'error', error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
