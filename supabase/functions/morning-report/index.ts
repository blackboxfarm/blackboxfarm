import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from "../_shared/run-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceStats {
  total_calls: number;
  successful: number;
  failed: number;
  fail_rate_pct: number;
  avg_response_ms: number;
  credits_used: number;
  top_errors: { error: string; count: number }[];
}

Deno.serve(withRunLog('morning-report', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Toronto 9am = report covers 6pm previous day to 9am today (15 hours overnight)
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - 15 * 3600_000); // 15 hours back (6pm → 9am)
    const reportDate = now.toISOString().split('T')[0];

    const alerts: { level: string; category: string; title: string; detail: string }[] = [];

    // ═══════════════════════════════════════════════════════════════
    // 1. API USAGE BREAKDOWN (per-service, overnight period)
    // ═══════════════════════════════════════════════════════════════
    const { data: apiLogs } = await supabase
      .from('api_usage_log')
      .select('service_name, endpoint, success, response_status, response_time_ms, credits_used, error_message')
      .gte('timestamp', periodStart.toISOString())
      .lte('timestamp', periodEnd.toISOString())
      .limit(10000);

    const apiUsageSummary: Record<string, ServiceStats> = {};
    
    if (apiLogs && apiLogs.length > 0) {
      const byService: Record<string, typeof apiLogs> = {};
      for (const log of apiLogs) {
        if (!byService[log.service_name]) byService[log.service_name] = [];
        byService[log.service_name].push(log);
      }

      for (const [svc, logs] of Object.entries(byService)) {
        const total = logs.length;
        const successful = logs.filter(l => l.success).length;
        const failed = total - successful;
        const failRate = total > 0 ? (failed / total) * 100 : 0;
        const avgResponse = logs.reduce((s, l) => s + (l.response_time_ms || 0), 0) / (total || 1);
        const creditsUsed = logs.reduce((s, l) => s + (l.credits_used || 0), 0);

        // Top errors
        const errorCounts: Record<string, number> = {};
        for (const l of logs) {
          if (!l.success && l.error_message) {
            const key = l.error_message.slice(0, 100);
            errorCounts[key] = (errorCounts[key] || 0) + 1;
          }
        }
        const topErrors = Object.entries(errorCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([error, count]) => ({ error, count }));

        apiUsageSummary[svc] = {
          total_calls: total,
          successful,
          failed,
          fail_rate_pct: Math.round(failRate * 10) / 10,
          avg_response_ms: Math.round(avgResponse),
          credits_used: creditsUsed,
          top_errors: topErrors,
        };

        // Generate alerts for high failure rates
        if (failRate >= 50 && total >= 5) {
          alerts.push({
            level: failRate >= 90 ? 'critical' : 'warning',
            category: 'api_failure',
            title: `${svc} API: ${failRate.toFixed(0)}% failure rate`,
            detail: `${failed}/${total} calls failed overnight. Top error: ${topErrors[0]?.error || 'unknown'}`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. RATE LIMIT & AUTH FAILURE EVENTS (401, 403, 429)
    // ═══════════════════════════════════════════════════════════════
    const rateLimitEvents: { service: string; endpoint: string; status: number; count: number }[] = [];
    const authFailureEvents: { service: string; endpoint: string; status: number; count: number }[] = [];

    if (apiLogs) {
      const rlGrouped: Record<string, { service: string; endpoint: string; status: number; count: number }> = {};
      const authGrouped: Record<string, { service: string; endpoint: string; status: number; count: number }> = {};

      for (const log of apiLogs) {
        if (log.response_status === 429) {
          const key = `${log.service_name}:${log.endpoint}:429`;
          if (!rlGrouped[key]) rlGrouped[key] = { service: log.service_name, endpoint: log.endpoint, status: 429, count: 0 };
          rlGrouped[key].count++;
        }
        if (log.response_status === 401 || log.response_status === 403) {
          const key = `${log.service_name}:${log.endpoint}:${log.response_status}`;
          if (!authGrouped[key]) authGrouped[key] = { service: log.service_name, endpoint: log.endpoint, status: log.response_status, count: 0 };
          authGrouped[key].count++;
        }
      }

      rateLimitEvents.push(...Object.values(rlGrouped));
      authFailureEvents.push(...Object.values(authGrouped));

      if (rateLimitEvents.length > 0) {
        const totalRL = rateLimitEvents.reduce((s, e) => s + e.count, 0);
        alerts.push({
          level: totalRL > 20 ? 'critical' : 'warning',
          category: 'rate_limit',
          title: `${totalRL} rate limit hits (429) overnight`,
          detail: rateLimitEvents.map(e => `${e.service}/${e.endpoint}: ${e.count}x`).join(', '),
        });
      }

      if (authFailureEvents.length > 0) {
        const totalAuth = authFailureEvents.reduce((s, e) => s + e.count, 0);
        alerts.push({
          level: 'critical',
          category: 'auth_failure',
          title: `${totalAuth} API auth failures (401/403) overnight`,
          detail: authFailureEvents.map(e => `${e.service} ${e.status}: ${e.count}x`).join(', '),
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. QUOTA STATUS (current snapshot)
    // ═══════════════════════════════════════════════════════════════
    const { data: quotaServices } = await supabase
      .from('api_service_config')
      .select('service_name, display_name, monthly_quota, monthly_quota_used, is_paid_service, tier')
      .eq('is_enabled', true);

    const quotaStatus: Record<string, { display_name: string; used: number; limit: number | null; pct: number; status: string; tier: string | null; is_paid: boolean }> = {};
    
    if (quotaServices) {
      for (const svc of quotaServices) {
        const used = svc.monthly_quota_used || 0;
        const limit = svc.monthly_quota;
        const pct = limit && limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;
        let status = 'ok';
        if (limit && pct >= 90) status = 'critical';
        else if (limit && pct >= 75) status = 'warning';

        quotaStatus[svc.service_name] = {
          display_name: svc.display_name,
          used,
          limit,
          pct,
          status,
          tier: svc.tier,
          is_paid: svc.is_paid_service || false,
        };

        if (status !== 'ok') {
          alerts.push({
            level: status,
            category: 'quota',
            title: `${svc.display_name} quota at ${pct}%`,
            detail: `${used}/${limit} used this month (${svc.tier || 'unknown'} tier)`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. ERROR PATTERNS (repeated endpoint failures)
    // ═══════════════════════════════════════════════════════════════
    const errorPatterns: { endpoint: string; service: string; count: number; error: string | null }[] = [];
    
    if (apiLogs) {
      const grouped: Record<string, { count: number; service: string; error: string | null }> = {};
      for (const log of apiLogs) {
        if (!log.success) {
          const key = `${log.service_name}:${log.endpoint}`;
          if (!grouped[key]) grouped[key] = { count: 0, service: log.service_name, error: log.error_message };
          grouped[key].count++;
        }
      }

      for (const [endpoint, info] of Object.entries(grouped)) {
        if (info.count >= 5) {
          errorPatterns.push({ endpoint, service: info.service, count: info.count, error: info.error?.slice(0, 200) || null });
        }
      }
      errorPatterns.sort((a, b) => b.count - a.count);
    }

    // ═══════════════════════════════════════════════════════════════
    // 5. NEW SIGNUPS (overnight 6pm → 9am)
    // ═══════════════════════════════════════════════════════════════
    const { data: signupNotifs } = await supabase
      .from('admin_notifications')
      .select('title, message, metadata, created_at')
      .eq('notification_type', 'new_signup')
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString())
      .order('created_at', { ascending: false });

    const newSignups = signupNotifs?.length || 0;
    const newSignupsDetails = (signupNotifs || []).map(n => ({
      email: (n.metadata as any)?.email || 'unknown',
      provider: (n.metadata as any)?.provider || 'email',
      display_name: (n.metadata as any)?.display_name || null,
      created_at: n.created_at,
    }));

    if (newSignups > 0) {
      alerts.push({
        level: 'info',
        category: 'signups',
        title: `${newSignups} new signup${newSignups > 1 ? 's' : ''} overnight`,
        detail: newSignupsDetails.map(s => `${s.email} (${s.provider})`).join(', '),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. NEW SUBSCRIBERS (Stripe - check subscription events)
    // ═══════════════════════════════════════════════════════════════
    const { data: subNotifs } = await supabase
      .from('admin_notifications')
      .select('title, message, metadata, created_at')
      .in('notification_type', ['payment_confirmed', 'subscription_created', 'banner_purchase'])
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    const newSubscribers = subNotifs?.length || 0;
    const newSubscribersDetails = (subNotifs || []).map(n => ({
      type: n.notification_type || 'unknown',
      title: n.title,
      created_at: n.created_at,
      metadata: n.metadata,
    }));

    // ═══════════════════════════════════════════════════════════════
    // 7. TABLE HEALTH (row counts for key tables)
    // ═══════════════════════════════════════════════════════════════
    const monitoredTables = [
      'api_usage_log', 'activity_logs', 'arb_opportunities', 'arb_price_snapshots',
      'admin_notifications', 'blackbox_transactions', 'pumpfun_watchlist',
      'morning_reports', 'banner_impressions', 'banner_clicks',
    ];
    
    const tableHealth: Record<string, { row_count: number; status: string }> = {};
    for (const table of monitoredTables) {
      try {
        const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        const rowCount = count || 0;
        let status = 'ok';
        if (rowCount > 500_000) status = 'critical';
        else if (rowCount > 100_000) status = 'warning';
        
        tableHealth[table] = { row_count: rowCount, status };
        
        if (status !== 'ok') {
          alerts.push({
            level: status === 'critical' ? 'warning' : 'info',
            category: 'table_bloat',
            title: `${table}: ${rowCount.toLocaleString()} rows`,
            detail: status === 'critical' ? 'Consider pruning old data' : 'Approaching large size',
          });
        }
      } catch {
        tableHealth[table] = { row_count: -1, status: 'error' };
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 7.5. HOLDERSINTEL TWITTER ACCOUNT METRICS
    // ═══════════════════════════════════════════════════════════════
    let holdersIntelMetrics: Record<string, any> | null = null;

    try {
      const { data: hiAccount } = await supabase
        .from('twitter_accounts')
        .select('follower_count, following_count, tweet_count, likes_count, listed_count, media_count, is_verified, fast_followers_count, professional_type, professional_category, bio, display_name, username, profile_image_url, last_enriched_at, join_date')
        .ilike('username', 'holdersintel')
        .maybeSingle();

      if (hiAccount) {
        // Calculate follower quality heuristics
        const followerCount = hiAccount.follower_count || 0;
        const fastFollowers = hiAccount.fast_followers_count || 0; // "fast followers" = blue-check / premium subscribers
        const normalFollowers = followerCount - fastFollowers;
        const blueCheckPct = followerCount > 0 ? Math.round((fastFollowers / followerCount) * 1000) / 10 : 0;
        const followRatio = hiAccount.following_count && hiAccount.following_count > 0
          ? Math.round((followerCount / hiAccount.following_count) * 100) / 100
          : followerCount;
        const engagementProxy = followerCount > 0
          ? Math.round(((hiAccount.likes_count || 0) / (hiAccount.tweet_count || 1)) * 100) / 100
          : 0;

        holdersIntelMetrics = {
          display_name: hiAccount.display_name,
          username: hiAccount.username,
          is_verified: hiAccount.is_verified,
          professional_type: hiAccount.professional_type,
          followers: {
            total: followerCount,
            blue_check_premium: fastFollowers,
            normal: normalFollowers,
            blue_check_pct: blueCheckPct,
          },
          following: hiAccount.following_count || 0,
          follow_ratio: followRatio,
          tweets: hiAccount.tweet_count || 0,
          likes: hiAccount.likes_count || 0,
          avg_likes_per_tweet: engagementProxy,
          listed_count: hiAccount.listed_count || 0,
          media_count: hiAccount.media_count || 0,
          join_date: hiAccount.join_date,
          last_enriched_at: hiAccount.last_enriched_at,
        };
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch HoldersIntel metrics:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 8. EXTERNAL SERVICES STATUS (Solscan, Cloudflare, etc.)
    // ═══════════════════════════════════════════════════════════════
    const externalServicesStatus: Record<string, { status: string; calls_overnight: number; failures: number; notes: string }> = {};
    
    // Track all known services including Solscan
    const allServices = ['dexscreener', 'helius', 'rugcheck', 'pumpfun', 'jupiter', 'coingecko', 'solscan', 'apify', 'bonkfun', 'bagsfm'];
    for (const svc of allServices) {
      const stats = apiUsageSummary[svc];
      if (stats) {
        let status = 'active';
        let notes = `${stats.total_calls} calls, ${stats.fail_rate_pct}% fail rate`;
        if (stats.fail_rate_pct >= 50) status = 'degraded';
        if (stats.fail_rate_pct >= 90) status = 'down';
        if (stats.total_calls === 0) { status = 'idle'; notes = 'No calls overnight'; }
        
        externalServicesStatus[svc] = {
          status,
          calls_overnight: stats.total_calls,
          failures: stats.failed,
          notes,
        };
      } else {
        externalServicesStatus[svc] = {
          status: 'idle',
          calls_overnight: 0,
          failures: 0,
          notes: 'No API calls recorded overnight',
        };
      }
    }

    // Cloudflare Workers - check via Holders Intel scheduler activity
    const { data: cfLogs } = await supabase
      .from('api_usage_log')
      .select('endpoint, success, error_message')
      .eq('service_name', 'dexscreener')
      .ilike('endpoint', '%cloudflare%')
      .gte('timestamp', periodStart.toISOString())
      .limit(100);

    // Also check holders-intel-scheduler which uses Cloudflare worker
    const { data: schedulerLogs } = await supabase
      .from('activity_logs')
      .select('message, metadata, timestamp')
      .ilike('message', '%holders%intel%')
      .gte('timestamp', periodStart.toISOString())
      .order('timestamp', { ascending: false })
      .limit(20);

    externalServicesStatus['cloudflare_workers'] = {
      status: schedulerLogs && schedulerLogs.length > 0 ? 'active' : 'idle',
      calls_overnight: schedulerLogs?.length || 0,
      failures: 0,
      notes: schedulerLogs && schedulerLogs.length > 0 
        ? `${schedulerLogs.length} scheduler runs detected`
        : 'No Cloudflare worker activity detected',
    };

    // ═══════════════════════════════════════════════════════════════
    // 9. TOKEN VIGIL — Post-Mortem & Death Detection Stats
    // ═══════════════════════════════════════════════════════════════
    let vigilStats: any = {};
    try {
      // Deaths detected overnight
      const { data: recentDeaths } = await supabase
        .from('token_vigil')
        .select('symbol, name, peak_mcap_usd, current_mcap_usd, death_detected_at')
        .eq('status', 'dead')
        .gte('death_detected_at', periodStart.toISOString())
        .order('death_detected_at', { ascending: false });

      // Post-mortems captured overnight
      const { data: recentPostMortems } = await supabase
        .from('token_assessments')
        .select('symbol, outcome, cause_of_death, assessment_type, created_at')
        .eq('assessment_type', 'post_mortem')
        .gte('created_at', periodStart.toISOString());

      // Mid-growth assessments overnight
      const { data: recentMidGrowth } = await supabase
        .from('token_assessments')
        .select('symbol, outcome, mcap_usd, assessment_type, created_at')
        .eq('assessment_type', 'mid_growth')
        .gte('created_at', periodStart.toISOString());

      // Totals
      const { count: totalVigilWatching } = await supabase
        .from('token_vigil')
        .select('*', { count: 'exact', head: true })
        .in('status', ['watching', 'declining']);

      const { count: totalDead } = await supabase
        .from('token_vigil')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'dead');

      const { count: totalAssessments } = await supabase
        .from('token_assessments')
        .select('*', { count: 'exact', head: true });

      // Cause of death breakdown (all time)
      const { data: codBreakdown } = await supabase
        .from('token_assessments')
        .select('cause_of_death')
        .eq('assessment_type', 'post_mortem')
        .not('cause_of_death', 'is', null);

      const codCounts: Record<string, number> = {};
      for (const row of codBreakdown || []) {
        codCounts[row.cause_of_death] = (codCounts[row.cause_of_death] || 0) + 1;
      }

      vigilStats = {
        overnight_deaths: recentDeaths?.length || 0,
        overnight_deaths_list: (recentDeaths || []).map(d => ({
          symbol: d.symbol,
          peak_mcap: d.peak_mcap_usd,
        })),
        overnight_post_mortems: recentPostMortems?.length || 0,
        overnight_post_mortem_causes: (recentPostMortems || []).reduce((acc: Record<string, number>, pm) => {
          acc[pm.cause_of_death || 'unknown'] = (acc[pm.cause_of_death || 'unknown'] || 0) + 1;
          return acc;
        }, {}),
        overnight_mid_growth: recentMidGrowth?.length || 0,
        overnight_mid_growth_list: (recentMidGrowth || []).map(m => ({
          symbol: m.symbol,
          mcap: m.mcap_usd,
        })),
        total_watching: totalVigilWatching || 0,
        total_dead: totalDead || 0,
        total_assessments: totalAssessments || 0,
        cause_of_death_all_time: codCounts,
      };
    } catch (e) {
      console.warn('[morning-report] Failed to fetch vigil stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 10. ALLSTAR DEV REGISTRY — Monitoring & Alerts
    // ═══════════════════════════════════════════════════════════════
    let allstarStats: any = {};
    try {
      const { count: totalAllstars } = await supabase
        .from('allstar_dev_registry')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { data: allstarsByTier } = await supabase
        .from('allstar_dev_registry')
        .select('best_tier')
        .eq('status', 'active');

      const tierCounts: Record<string, number> = {};
      for (const a of allstarsByTier || []) {
        tierCounts[`T${a.best_tier}`] = (tierCounts[`T${a.best_tier}`] || 0) + 1;
      }

      // Total family wallets being monitored
      const { data: familySizes } = await supabase
        .from('allstar_dev_registry')
        .select('total_wallet_family_size')
        .eq('status', 'active');
      const totalFamilyWallets = (familySizes || []).reduce((s, a) => s + (a.total_wallet_family_size || 0), 0);

      // Overnight mint alerts
      const { data: overnightAlerts } = await supabase
        .from('allstar_mint_alerts')
        .select('token_symbol, allstar_tier, alert_level, creator_wallet, created_at')
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: false });

      // Total audits run overnight
      const { data: auditedOvernight } = await supabase
        .from('allstar_dev_registry')
        .select('master_wallet, best_tier, best_token_symbol')
        .gte('last_audit_at', periodStart.toISOString());

      allstarStats = {
        total_allstars: totalAllstars || 0,
        tier_breakdown: tierCounts,
        total_family_wallets_monitored: totalFamilyWallets,
        overnight_audits: auditedOvernight?.length || 0,
        overnight_mint_alerts: overnightAlerts?.length || 0,
        overnight_alerts_list: (overnightAlerts || []).map(a => ({
          symbol: a.token_symbol,
          tier: a.allstar_tier,
          level: a.alert_level,
        })),
      };
    } catch (e) {
      console.warn('[morning-report] Failed to fetch allstar stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 11. UNREAD NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════
    const { count: unreadCount } = await supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    // ═══════════════════════════════════════════════════════════════
    // DETERMINE OVERALL STATUS
    // ═══════════════════════════════════════════════════════════════
    const criticalAlerts = alerts.filter(a => a.level === 'critical').length;
    const warningAlerts = alerts.filter(a => a.level === 'warning').length;
    const overallStatus = criticalAlerts > 0 ? 'critical' : warningAlerts > 0 ? 'warning' : 'healthy';

    const executionTimeMs = Date.now() - startTime;

    // ═══════════════════════════════════════════════════════════════
    // SAVE REPORT TO DATABASE
    // ═══════════════════════════════════════════════════════════════
    const { data: report, error: insertError } = await supabase
      .from('morning_reports')
      .upsert({
        report_date: reportDate,
        report_period_start: periodStart.toISOString(),
        report_period_end: periodEnd.toISOString(),
        overall_status: overallStatus,
        api_usage_summary: apiUsageSummary,
        rate_limit_events: rateLimitEvents,
        auth_failure_events: authFailureEvents,
        quota_status: quotaStatus,
        error_patterns: errorPatterns,
        new_signups: newSignups,
        new_signups_details: newSignupsDetails,
        new_subscribers: newSubscribers,
        new_subscribers_details: newSubscribersDetails,
        table_health: tableHealth,
        external_services_status: externalServicesStatus,
        holders_intel_metrics: holdersIntelMetrics,
        vigil_stats: vigilStats,
        allstar_stats: allstarStats,
        unread_notifications: unreadCount || 0,
        alerts,
        execution_time_ms: executionTimeMs,
      }, { onConflict: 'report_date' })
      .select()
      .single();

    if (insertError) {
      console.error('[morning-report] Failed to save report:', insertError);
    }

    // ═══════════════════════════════════════════════════════════════
    // SEND TELEGRAM SUMMARY
    // ═══════════════════════════════════════════════════════════════
    const totalApiCalls = Object.values(apiUsageSummary).reduce((s, v) => s + v.total_calls, 0);
    const totalFailures = Object.values(apiUsageSummary).reduce((s, v) => s + v.failed, 0);
    const totalCredits = Object.values(apiUsageSummary).reduce((s, v) => s + v.credits_used, 0);

    const statusEmoji = overallStatus === 'healthy' ? '🟢' : overallStatus === 'warning' ? '🟡' : '🔴';
    
    let tgMessage = `${statusEmoji} **MORNING REPORT — ${reportDate}**\n`;
    tgMessage += `Period: 6:00 PM → 9:00 AM ET\n\n`;

    // Signups section
    tgMessage += `👥 **Overnight Activity**\n`;
    tgMessage += `• New Signups: ${newSignups}\n`;
    if (newSignupsDetails.length > 0) {
      for (const s of newSignupsDetails.slice(0, 5)) {
        tgMessage += `  → ${s.email} (${s.provider})\n`;
      }
    }
    tgMessage += `• New Subscribers/Payments: ${newSubscribers}\n\n`;

    // API Overview
    tgMessage += `📊 **API Overview** (${totalApiCalls} total calls)\n`;
    const sortedServices = Object.entries(apiUsageSummary).sort((a, b) => b[1].total_calls - a[1].total_calls);
    for (const [svc, stats] of sortedServices) {
      const svcEmoji = stats.fail_rate_pct >= 50 ? '🔴' : stats.fail_rate_pct >= 10 ? '🟡' : '✅';
      tgMessage += `${svcEmoji} ${svc}: ${stats.total_calls} calls`;
      if (stats.failed > 0) tgMessage += ` (${stats.failed} failed, ${stats.fail_rate_pct}%)`;
      if (stats.credits_used > 0) tgMessage += ` [${stats.credits_used} credits]`;
      tgMessage += `\n`;
    }
    tgMessage += `\n`;

    // Rate limits & Auth
    if (rateLimitEvents.length > 0 || authFailureEvents.length > 0) {
      tgMessage += `⚠️ **Rate Limit / Auth Issues**\n`;
      for (const rl of rateLimitEvents) {
        tgMessage += `• 429 ${rl.service}/${rl.endpoint}: ${rl.count}x\n`;
      }
      for (const af of authFailureEvents) {
        tgMessage += `• ${af.status} ${af.service}/${af.endpoint}: ${af.count}x\n`;
      }
      tgMessage += `\n`;
    }

    // Quotas
    const quotaWarnings = Object.entries(quotaStatus).filter(([, v]) => v.status !== 'ok');
    if (quotaWarnings.length > 0) {
      tgMessage += `📈 **Quota Warnings**\n`;
      for (const [svc, q] of quotaWarnings) {
        tgMessage += `• ${q.display_name}: ${q.pct}% (${q.used}/${q.limit})\n`;
      }
      tgMessage += `\n`;
    }

    // Error patterns
    if (errorPatterns.length > 0) {
      tgMessage += `🔁 **Repeated Errors**\n`;
      for (const ep of errorPatterns.slice(0, 5)) {
        tgMessage += `• ${ep.endpoint}: ${ep.count}x — ${ep.error?.slice(0, 80) || 'unknown'}\n`;
      }
      tgMessage += `\n`;
    }

    // External services
    const degradedSvcs = Object.entries(externalServicesStatus).filter(([, v]) => v.status === 'degraded' || v.status === 'down');
    if (degradedSvcs.length > 0) {
      tgMessage += `🌐 **Degraded Services**\n`;
      for (const [svc, info] of degradedSvcs) {
        tgMessage += `• ${svc}: ${info.status} — ${info.notes}\n`;
      }
      tgMessage += `\n`;
    }

    // Table health warnings
    const bloatedTables = Object.entries(tableHealth).filter(([, v]) => v.status !== 'ok');
    if (bloatedTables.length > 0) {
      tgMessage += `🗄️ **Table Health**\n`;
      for (const [table, info] of bloatedTables) {
        tgMessage += `• ${table}: ${info.row_count.toLocaleString()} rows\n`;
      }
      tgMessage += `\n`;
    }

    // HoldersIntel account metrics
    if (holdersIntelMetrics) {
      const hi = holdersIntelMetrics;
      tgMessage += `\n🐦 **@HoldersIntel Account**\n`;
      tgMessage += `• Followers: ${hi.followers.total.toLocaleString()} (🔵 ${hi.followers.blue_check_premium.toLocaleString()} premium / 👤 ${hi.followers.normal.toLocaleString()} normal — ${hi.followers.blue_check_pct}% blue)\n`;
      tgMessage += `• Following: ${hi.following} | Ratio: ${hi.follow_ratio}:1\n`;
      tgMessage += `• Tweets: ${hi.tweets.toLocaleString()} | Likes: ${hi.likes.toLocaleString()}\n`;
      tgMessage += `• Avg Likes/Tweet: ${hi.avg_likes_per_tweet} | Listed: ${hi.listed_count}\n`;
      tgMessage += `• Media: ${hi.media_count} | Verified: ${hi.is_verified ? '✅' : '❌'} | Type: ${hi.professional_type || 'N/A'}\n`;
      tgMessage += `• Last enriched: ${hi.last_enriched_at ? new Date(hi.last_enriched_at).toLocaleString() : 'never'}\n`;
    }
    tgMessage += `\n`;

    // Token Vigil section
    if (vigilStats.overnight_deaths > 0 || vigilStats.overnight_post_mortems > 0 || vigilStats.overnight_mid_growth > 0 || vigilStats.total_watching > 0) {
      tgMessage += `\n💀 **Token Vigil**\n`;
      tgMessage += `• Watching: ${vigilStats.total_watching || 0} | Dead: ${vigilStats.total_dead || 0} | Total Assessments: ${vigilStats.total_assessments || 0}\n`;
      
      if (vigilStats.overnight_deaths > 0) {
        tgMessage += `• ☠️ Deaths overnight: ${vigilStats.overnight_deaths}\n`;
        for (const d of (vigilStats.overnight_deaths_list || []).slice(0, 5)) {
          tgMessage += `  → $${d.symbol} (peak $${d.peak_mcap >= 1000000 ? (d.peak_mcap/1000000).toFixed(1)+'M' : (d.peak_mcap/1000).toFixed(0)+'K'})\n`;
        }
      }
      if (vigilStats.overnight_post_mortems > 0) {
        tgMessage += `• 🔬 Post-mortems: ${vigilStats.overnight_post_mortems}`;
        const causes = vigilStats.overnight_post_mortem_causes || {};
        const causeStr = Object.entries(causes).map(([k, v]) => `${k}:${v}`).join(', ');
        if (causeStr) tgMessage += ` (${causeStr})`;
        tgMessage += `\n`;
      }
      if (vigilStats.overnight_mid_growth > 0) {
        tgMessage += `• 📈 Mid-growth snapshots: ${vigilStats.overnight_mid_growth}\n`;
        for (const m of (vigilStats.overnight_mid_growth_list || []).slice(0, 5)) {
          tgMessage += `  → $${m.symbol} ($${m.mcap >= 1000000 ? (m.mcap/1000000).toFixed(1)+'M' : (m.mcap/1000).toFixed(0)+'K'})\n`;
        }
      }
      if (Object.keys(vigilStats.cause_of_death_all_time || {}).length > 0) {
        tgMessage += `• COD all-time: ${Object.entries(vigilStats.cause_of_death_all_time).map(([k, v]) => `${k}:${v}`).join(', ')}\n`;
      }
    }

    // Allstar section
    if ((allstarStats.total_allstars || 0) > 0) {
      tgMessage += `\n⭐ **Allstar Dev Registry**\n`;
      tgMessage += `• Active Allstars: ${allstarStats.total_allstars} | Family Wallets: ${allstarStats.total_family_wallets_monitored}\n`;
      if (Object.keys(allstarStats.tier_breakdown || {}).length > 0) {
        tgMessage += `• Tiers: ${Object.entries(allstarStats.tier_breakdown).sort().map(([k, v]) => `${k}:${v}`).join(', ')}\n`;
      }
      tgMessage += `• Overnight audits: ${allstarStats.overnight_audits || 0}\n`;
      if (allstarStats.overnight_mint_alerts > 0) {
        tgMessage += `• 🚨 NEW MINT ALERTS: ${allstarStats.overnight_mint_alerts}\n`;
        for (const a of (allstarStats.overnight_alerts_list || []).slice(0, 5)) {
          tgMessage += `  → $${a.symbol || 'UNKNOWN'} (T${a.tier}, ${a.level})\n`;
        }
      }
    }

    tgMessage += `\n📬 Unread Notifications: ${unreadCount || 0}\n`;
    tgMessage += `⏱️ Report generated in ${executionTimeMs}ms`;

    // Send via admin-notify
    let telegramSent = false;
    try {
      const { error: notifyError } = await supabase.functions.invoke('admin-notify', {
        body: {
          type: 'new_signup', // reuse existing type
          title: `Morning Report — ${reportDate}`,
          message: tgMessage,
          channels: ['telegram'],
        },
      });
      telegramSent = !notifyError;
      if (notifyError) console.error('[morning-report] Telegram send error:', notifyError);
    } catch (e) {
      console.error('[morning-report] Failed to send Telegram:', e);
    }

    // Update telegram sent status
    if (telegramSent && report) {
      await supabase
        .from('morning_reports')
        .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
        .eq('report_date', reportDate);
    }

    console.log(`[morning-report] ${overallStatus.toUpperCase()}: ${totalApiCalls} API calls, ${totalFailures} failures, ${newSignups} signups, ${executionTimeMs}ms`);

    return new Response(
      JSON.stringify({
        status: overallStatus,
        report_date: reportDate,
        period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
        summary: {
          total_api_calls: totalApiCalls,
          total_failures: totalFailures,
          total_credits: totalCredits,
          new_signups: newSignups,
          new_subscribers: newSubscribers,
          alerts_count: alerts.length,
          critical_alerts: criticalAlerts,
          warning_alerts: warningAlerts,
        },
        api_usage_summary: apiUsageSummary,
        quota_status: quotaStatus,
        rate_limit_events: rateLimitEvents,
        auth_failure_events: authFailureEvents,
        error_patterns: errorPatterns,
        external_services_status: externalServicesStatus,
        holders_intel_metrics: holdersIntelMetrics,
        table_health: tableHealth,
        new_signups_details: newSignupsDetails,
        alerts,
        telegram_sent: telegramSent,
        execution_ms: executionTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[morning-report] Fatal:', error.message);
    return new Response(
      JSON.stringify({ status: 'error', error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
