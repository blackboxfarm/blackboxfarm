import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from "../_shared/run-logger.ts";
import { assertUpsert } from "../_shared/db-assert.ts";
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

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

const EDGE_FUNCTION_CONTEXT: Record<string, { purpose: string; ignoreRunningNoise?: boolean }> = {
  'holdersintel-bot-webhook': {
    purpose: 'Powers the HoldersIntel Telegram bot by receiving Telegram webhook updates and generating bot replies/alerts in DMs and group chats.',
    ignoreRunningNoise: true,
  },
  'holders-intel-poster': {
    purpose: 'Publishes automated HoldersIntel posts so fresh token intelligence reaches X on schedule.',
  },
  'holders-intel-dex-scanner': {
    purpose: 'Scans Dex and launch activity to discover tokens and feed the HoldersIntel pipeline.',
  },
  'holders-intel-scheduler': {
    purpose: 'Schedules the HoldersIntel automation jobs that keep scans and posting running.',
  },
};

function getEdgeFunctionPurpose(functionName: string): string {
  return EDGE_FUNCTION_CONTEXT[functionName]?.purpose || 'Supports internal automation or monitoring workflows.';
}

Deno.serve(withRunLog('morning-report', async (req) => {
  if (!await isFunctionEnabled('morning-report')) {
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

    // Toronto 9am = report covers 6pm previous day to 9am today (15 hours overnight)
    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - 15 * 3600_000); // 15 hours back (6pm → 9am)
    const reportDate = now.toISOString().split('T')[0];
    const cutoffISO = periodStart.toISOString();

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
        // Skip Solscan: 429/401/403 here are quota-exhaustion, not an incident
        // (visible on the provider dashboard; suppressed in rate-limit block below too).
        if (svc === 'solscan') continue;
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
          // Skip Solscan 429s — Pro monthly Compute Units are exhausted; quota-exhausted is
          // not an incident worth alerting on (visible on the provider dashboard instead).
          if (log.service_name === 'solscan') continue;
          const key = `${log.service_name}:${log.endpoint}:429`;
          if (!rlGrouped[key]) rlGrouped[key] = { service: log.service_name, endpoint: log.endpoint, status: 429, count: 0 };
          rlGrouped[key].count++;
        }
        if (log.response_status === 401 || log.response_status === 403) {
          // Solscan 401/403 are also quota-exhaustion symptoms — suppress.
          if (log.service_name === 'solscan') continue;
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
    // 6. NEW SUBSCRIBERS (Stripe - from stripe_customers + web_user_subscriptions)
    // ═══════════════════════════════════════════════════════════════
    // Primary source: stripe_customers table (tracks all payers)
    const { data: overnightStripeCustomers } = await supabase
      .from('stripe_customers')
      .select('email, name, tier_key, amount_cents, currency, interval, is_active, stripe_subscription_id, matched_user_id, created_at')
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString())
      .order('created_at', { ascending: false });

    // Also check admin_notifications for payment events (fallback / banner purchases)
    const { data: subNotifs } = await supabase
      .from('admin_notifications')
      .select('notification_type, title, message, metadata, created_at')
      .in('notification_type', ['payment_confirmed', 'subscription_created', 'banner_purchase'])
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    // Aggregate totals from stripe_customers
    const stripeSubCount = overnightStripeCustomers?.length || 0;
    const bannerPurchaseCount = (subNotifs || []).filter(n => n.notification_type === 'banner_purchase').length;
    const newSubscribers = stripeSubCount + bannerPurchaseCount;

    // Compute revenue summary
    const totalRevenueCents = (overnightStripeCustomers || []).reduce((sum, c) => sum + (c.amount_cents || 0), 0);
    const tierBreakdown: Record<string, number> = {};
    for (const c of overnightStripeCustomers || []) {
      const tier = c.tier_key || 'unknown';
      tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
    }

    // Active subscriber totals (all time)
    const { count: totalActiveSubscribers } = await supabase
      .from('stripe_customers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: totalLinkedAccounts } = await supabase
      .from('stripe_customers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('matched_user_id', 'is', null);

    const newSubscribersDetails = (overnightStripeCustomers || []).map(c => ({
      email: c.email,
      name: c.name,
      tier_key: c.tier_key || 'unknown',
      amount: c.amount_cents ? `$${(c.amount_cents / 100).toFixed(2)}` : 'N/A',
      interval: c.interval || 'one-time',
      is_active: c.is_active,
      linked: !!c.matched_user_id,
      created_at: c.created_at,
    }));

    // Add banner purchases as separate entries
    for (const n of (subNotifs || []).filter(n => n.notification_type === 'banner_purchase')) {
      newSubscribersDetails.push({
        email: (n.metadata as any)?.email || 'N/A',
        name: n.title,
        tier_key: 'banner',
        amount: (n.metadata as any)?.amount || 'N/A',
        interval: 'one-time',
        is_active: true,
        linked: false,
        created_at: n.created_at,
      });
    }

    const subscriptionSummary = {
      overnight_new: stripeSubCount,
      overnight_revenue_usd: totalRevenueCents / 100,
      tier_breakdown: tierBreakdown,
      total_active_subscribers: totalActiveSubscribers || 0,
      total_linked_accounts: totalLinkedAccounts || 0,
      banner_purchases: bannerPurchaseCount,
    };

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
    // 7.1. DATABASE SIZE & DISK USAGE WATCHDOG
    // ═══════════════════════════════════════════════════════════════
    let dbSizeInfo: Record<string, any> | null = null;
    try {
      // Total database size
      const { data: dbSizeData } = await supabase.rpc('get_db_size_stats');
      
      if (!dbSizeData) {
        // Fallback: estimate from table counts
        const bigTables: { name: string; rows: number; est_size_mb: number }[] = [];
        for (const [table, info] of Object.entries(tableHealth)) {
          if (info.row_count > 0) {
            // Rough estimate: ~0.5KB per row average
            const estMb = Math.round((info.row_count * 0.5) / 1024 * 10) / 10;
            bigTables.push({ name: table, rows: info.row_count, est_size_mb: estMb });
          }
        }
        
        // Also check biggest tables not in the monitored list
        const heavyTables = [
          'reputation_mesh', 'token_lifecycle', 'x_communities', 'developer_wallets',
          'allstar_dev_registry', 'holders_intel_post_queue', 'holders_intel_seen_tokens',
          'twitter_accounts', 'wallet_families', 'wallet_family_members',
        ];
        for (const table of heavyTables) {
          if (!tableHealth[table]) {
            try {
              const { count } = await supabase.from(table as any).select('*', { count: 'exact', head: true });
              if (count && count > 0) {
                const estMb = Math.round((count * 0.5) / 1024 * 10) / 10;
                bigTables.push({ name: table, rows: count, est_size_mb: estMb });
              }
            } catch { /* skip */ }
          }
        }

        bigTables.sort((a, b) => b.rows - a.rows);
        const totalEstMb = bigTables.reduce((s, t) => s + t.est_size_mb, 0);
        const totalRows = bigTables.reduce((s, t) => s + t.rows, 0);

        // Plan limit is configurable via env. Default = current provisioned disk (12 GB).
        // Bump DB_PLAN_LIMIT_MB whenever you resize the Supabase disk
        // (e.g. 8192 for Pro default, 12288 for 12 GB, 16384 for 16 GB).
        const planLimitMb = Number(Deno.env.get('DB_PLAN_LIMIT_MB') ?? '12288');
        const warnPctRaw = Number(Deno.env.get('DB_WARN_PCT') ?? '50');
        const critPctRaw = Number(Deno.env.get('DB_CRIT_PCT') ?? '80');
        const warnPct = isFinite(warnPctRaw) ? warnPctRaw : 50;
        const critPct = isFinite(critPctRaw) ? critPctRaw : 80;
        const usagePct = planLimitMb > 0 ? Math.round((totalEstMb / planLimitMb) * 100) : 0;

        dbSizeInfo = {
          total_size_mb: Math.round(totalEstMb),
          total_rows: totalRows,
          top_tables: bigTables.slice(0, 15),
          is_estimate: true,
          plan_limit_mb: planLimitMb,
          usage_pct: usagePct,
          warn_pct: warnPct,
          crit_pct: critPct,
        };

        if (usagePct >= critPct) {
          alerts.push({
            level: 'critical',
            category: 'database_size',
            title: `Database ~${Math.round(totalEstMb)}MB estimated (${usagePct}% of ${planLimitMb}MB limit)`,
            detail: `Top table: ${bigTables[0]?.name} (${bigTables[0]?.rows.toLocaleString()} rows). Consider pruning old api_usage_log, activity_logs, or arb_ tables.`,
          });
        } else if (usagePct >= warnPct) {
          alerts.push({
            level: 'warning',
            category: 'database_size',
            title: `Database ~${Math.round(totalEstMb)}MB estimated (${usagePct}% of ${planLimitMb}MB limit)`,
            detail: `Top table: ${bigTables[0]?.name} (${bigTables[0]?.rows.toLocaleString()} rows)`,
          });
        }
      }
    } catch (e) {
      console.warn('[morning-report] Failed to estimate DB size:', e);
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
        
        // fast_followers_count from Apify is unreliable (always 0 — it's a Twitter internal metric).
        // Instead, count verified accounts we've indexed that follow HoldersIntel from community_follow_targets
        let blueCheckEstimate = hiAccount.fast_followers_count || 0;
        
        // If fast_followers_count is 0, estimate from our indexed verified accounts
        if (blueCheckEstimate === 0) {
          const { count: verifiedFollowerCount } = await supabase
            .from('twitter_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('is_verified', true);
          blueCheckEstimate = verifiedFollowerCount || 0;
        }
        
        const normalFollowers = Math.max(0, followerCount - blueCheckEstimate);
        const blueCheckPct = followerCount > 0 ? Math.round((blueCheckEstimate / followerCount) * 1000) / 10 : 0;
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
            blue_check_premium: blueCheckEstimate,
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

    // Cloudflare Workers - check via edge_function_runs for scheduler + dex-scraper
    const { data: cfSchedulerRuns } = await supabase
      .from('edge_function_runs')
      .select('function_name, status, started_at, duration_ms')
      .in('function_name', ['holders-intel-scheduler', 'dexscreener-top-200-scraper'])
      .gte('started_at', periodStart.toISOString())
      .order('started_at', { ascending: false })
      .limit(50);

    const cfSuccessRuns = (cfSchedulerRuns || []).filter((r: any) => r.status === 'success');
    const cfFailRuns = (cfSchedulerRuns || []).filter((r: any) => r.status === 'error');

    externalServicesStatus['cloudflare_workers'] = {
      status: cfSchedulerRuns && cfSchedulerRuns.length > 0 
        ? (cfFailRuns.length > cfSuccessRuns.length ? 'degraded' : 'active') 
        : 'idle',
      calls_overnight: cfSchedulerRuns?.length || 0,
      failures: cfFailRuns.length,
      notes: cfSchedulerRuns && cfSchedulerRuns.length > 0 
        ? `${cfSuccessRuns.length} successful / ${cfFailRuns.length} failed scheduler+dex runs`
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
    // 11. EDGE FUNCTION HEALTH (from edge_function_runs)
    // ═══════════════════════════════════════════════════════════════
    let functionHealth: any = {};
    try {
      const { data: funcRuns } = await supabase
        .from('edge_function_runs')
        .select('function_name, status, duration_ms, error_message, started_at')
        .gte('started_at', periodStart.toISOString())
        .lte('started_at', periodEnd.toISOString())
        .limit(5000);

      if (funcRuns && funcRuns.length > 0) {
        const byFunc: Record<string, { total: number; terminal: number; ok: number; error: number; running: number; staleRunning: number; totalMs: number; errors: string[] }> = {};
        for (const run of funcRuns) {
          if (!byFunc[run.function_name]) byFunc[run.function_name] = { total: 0, terminal: 0, ok: 0, error: 0, running: 0, staleRunning: 0, totalMs: 0, errors: [] };
          const f = byFunc[run.function_name];
          f.total++;

          if (run.status === 'success') {
            f.ok++;
            f.terminal++;
            f.totalMs += run.duration_ms || 0;
            continue;
          }

          if (run.status === 'error') {
            f.error++;
            f.terminal++;
            if (run.error_message && f.errors.length < 3) f.errors.push(run.error_message.slice(0, 100));
            f.totalMs += run.duration_ms || 0;
            continue;
          }

          if (run.status === 'running') {
            f.running++;
            const startedAt = run.started_at ? new Date(run.started_at).getTime() : 0;
            const ageMs = startedAt ? Date.now() - startedAt : 0;
            if (ageMs > 10 * 60 * 1000) {
              f.staleRunning++;
            }
          }
        }

        functionHealth = {
          total_runs: funcRuns.length,
          total_errors: funcRuns.filter(r => r.status === 'error').length,
          by_function: Object.fromEntries(
            Object.entries(byFunc)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([name, stats]) => [name, {
                runs: stats.total,
                terminal_runs: stats.terminal,
                errors: stats.error,
                running: stats.running,
                stale_running: stats.staleRunning,
                fail_pct: stats.terminal > 0 ? Math.round((stats.error / stats.terminal) * 1000) / 10 : 0,
                avg_ms: stats.terminal > 0 ? Math.round(stats.totalMs / stats.terminal) : 0,
                top_errors: stats.errors,
              }])
          ),
        };

        // Alert on functions with >50% terminal failure rate
        for (const [fname, stats] of Object.entries(byFunc)) {
          const failRate = stats.terminal > 0 ? (stats.error / stats.terminal) : 0;
          const context = EDGE_FUNCTION_CONTEXT[fname];

          if (stats.error > 0 && stats.terminal >= 3 && failRate >= 0.5) {
            alerts.push({
              level: failRate >= 0.9 ? 'critical' : 'warning',
              category: 'function_health',
              title: `${fname}: ${Math.round(failRate * 100)}% failure rate`,
              detail: `${stats.error}/${stats.terminal} completed runs failed. Error: ${stats.errors[0] || 'unknown'}. Purpose: ${getEdgeFunctionPurpose(fname)}`,
            });
            continue;
          }

          if (context?.ignoreRunningNoise && stats.terminal >= 3 && stats.error === 0 && stats.staleRunning > 0) {
            console.log(`[morning-report] Ignoring stale running noise for ${fname}: ${stats.staleRunning} stale running rows, ${stats.terminal} completed runs, 0 terminal errors`);
          }
        }
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch function health:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 12. DEAD LETTER QUEUE STATUS
    // ═══════════════════════════════════════════════════════════════
    let dlqStats: any = {};
    try {
      const { count: pendingDlq } = await supabase.from('dead_letter_queue')
        .select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: exhaustedDlq } = await supabase.from('dead_letter_queue')
        .select('*', { count: 'exact', head: true }).eq('status', 'exhausted');
      const { data: recentDlq } = await supabase.from('dead_letter_queue')
        .select('source_function, operation, error_message, created_at')
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      dlqStats = {
        pending: pendingDlq || 0,
        exhausted: exhaustedDlq || 0,
        new_overnight: recentDlq?.length || 0,
        recent_items: (recentDlq || []).map(d => ({
          source: d.source_function,
          op: d.operation,
          error: d.error_message?.slice(0, 80),
        })),
      };

      if ((exhaustedDlq || 0) > 0) {
        alerts.push({
          level: 'warning',
          category: 'dlq',
          title: `${exhaustedDlq} exhausted items in dead letter queue`,
          detail: 'Items that failed all retries — manual intervention needed',
        });
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch DLQ stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 13. SPIDER & MESH METRICS
    // ═══════════════════════════════════════════════════════════════
    let spiderMetrics: any = {};
    let meshGrowth: any = {};
    let funnelMetrics: any = {};
    try {
      // Spider run metrics from overnight
      const { data: spiderRuns } = await supabase.from('spider_run_metrics')
        .select('*')
        .gte('run_date', periodStart.toISOString().split('T')[0])
        .order('run_date', { ascending: false })
        .limit(5);

      if (spiderRuns && spiderRuns.length > 0) {
        const latest = spiderRuns[0];
        spiderMetrics = {
          latest_run_date: latest.run_date,
          tokens_spidered: latest.tokens_spidered,
          wallets_discovered: latest.wallets_discovered,
          mesh_links_added: latest.mesh_links_added,
          avg_run_time_ms: latest.avg_run_time_ms,
          runs_count: spiderRuns.length,
        };
      }

      // Mesh growth (today vs yesterday)
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400_000).toISOString().split('T')[0];
      const { data: meshToday } = await supabase.from('mesh_growth_daily')
        .select('*').eq('snapshot_date', today).maybeSingle();
      const { data: meshYesterday } = await supabase.from('mesh_growth_daily')
        .select('*').eq('snapshot_date', yesterday).maybeSingle();

      if (meshToday) {
        meshGrowth = {
          total_developers: meshToday.total_developers,
          total_wallets: meshToday.total_wallets,
          total_social_links: meshToday.total_social_links,
          total_tokens: meshToday.total_tokens,
          new_wallets_today: meshToday.new_wallets_today,
          new_social_links_today: meshToday.new_social_links_today,
          delta_developers: meshYesterday ? meshToday.total_developers - meshYesterday.total_developers : null,
          delta_wallets: meshYesterday ? meshToday.total_wallets - meshYesterday.total_wallets : null,
        };
      }

      // Token funnel (today)
      const { data: funnelToday } = await supabase.from('token_funnel_daily')
        .select('stage, count').eq('funnel_date', today);
      if (funnelToday && funnelToday.length > 0) {
        funnelMetrics = Object.fromEntries(funnelToday.map(f => [f.stage, f.count]));
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch spider/mesh metrics:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 14. FUNNEL FEED THROUGHPUT (per-source token ingestion overnight)
    // ═══════════════════════════════════════════════════════════════
    let funnelFeedThroughput: any = {};
    try {
      // All tokens that entered the post queue overnight, grouped by trigger_source
      const { data: queueEntries } = await supabase
        .from('holders_intel_post_queue')
        .select('token_mint, symbol, trigger_source, status, scheduled_at')
        .gte('scheduled_at', periodStart.toISOString())
        .lte('scheduled_at', periodEnd.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(500);

      if (queueEntries && queueEntries.length > 0) {
        // Categorize by funnel source
        const sourceMap: Record<string, { count: number; posted: number; pending: number; failed: number; tokens: { symbol: string | null; mint: string }[] }> = {};

        const categorize = (src: string | null): string => {
          if (!src) return 'unknown';
          const s = src.toLowerCase();
          if (s.includes('telegram') || s.includes('mtproto') || s.includes('tg_')) return 'telegram';
          if (s.includes('dex') || s.includes('cloudflare') || s.includes('trending')) return 'dex_cloudflare';
          if (s.includes('holders') || s.includes('/holders')) return 'holders_input';
          if (s.includes('bubble') || s.includes('bubblemap')) return 'bubbles';
          if (s.includes('bot') || s.includes('dm') || s.includes('subscriber')) return 'bot_dm';
          if (s.includes('allstar') || s.includes('mint_alert')) return 'allstar_alert';
          return src;
        };

        for (const entry of queueEntries) {
          const cat = categorize(entry.trigger_source);
          if (!sourceMap[cat]) sourceMap[cat] = { count: 0, posted: 0, pending: 0, failed: 0, tokens: [] };
          const bucket = sourceMap[cat];
          bucket.count++;
          if (entry.status === 'posted') bucket.posted++;
          else if (entry.status === 'pending') bucket.pending++;
          else if (entry.status === 'failed' || entry.status === 'skipped') bucket.failed++;
          if (bucket.tokens.length < 10) {
            bucket.tokens.push({ symbol: entry.symbol, mint: entry.token_mint });
          }
        }

        funnelFeedThroughput = {
          total_overnight: queueEntries.length,
          by_source: sourceMap,
        };
      }

      // Also pull funnel_feed_discoveries if that table exists
      const { data: ffdEntries } = await supabase
        .from('funnel_feed_discoveries')
        .select('token_symbol, token_mint, mesh_status, watchlist_status, xpost_status, source_id, discovered_at, funnel_feed_sources!inner(source_name)')
        .gte('discovered_at', periodStart.toISOString())
        .lte('discovered_at', periodEnd.toISOString())
        .order('discovered_at', { ascending: false })
        .limit(200);

      if (ffdEntries && ffdEntries.length > 0) {
        const ffdBySource: Record<string, { count: number; watchlisted: number; posted: number; tokens: { symbol: string | null; mint: string }[] }> = {};
        for (const d of ffdEntries) {
          const srcName = (d as any).funnel_feed_sources?.source_name || 'unknown';
          if (!ffdBySource[srcName]) ffdBySource[srcName] = { count: 0, watchlisted: 0, posted: 0, tokens: [] };
          const b = ffdBySource[srcName];
          b.count++;
          if (d.watchlist_status === 'inserted') b.watchlisted++;
          if (d.xpost_status === 'posted') b.posted++;
          if (b.tokens.length < 5) b.tokens.push({ symbol: d.token_symbol, mint: d.token_mint });
        }
        funnelFeedThroughput.discovery_sources = ffdBySource;
        funnelFeedThroughput.total_discoveries_overnight = ffdEntries.length;
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch funnel feed throughput:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // 15. UNREAD NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════
    const { count: unreadCount } = await supabase
      .from('admin_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    // ═══════════════════════════════════════════════════════════════
    // 16. INTELLIGENCE ENGINE STATS (Tier 1/2 features)
    // ═══════════════════════════════════════════════════════════════
    let intelligenceStats: Record<string, any> = {};
    try {
      // Feature flags status
      const { data: flags } = await supabase.from('intelligence_feature_flags').select('*');
      const enabledFlags = (flags || []).filter((f: any) => f.enabled).map((f: any) => f.feature_name);
      const disabledFlags = (flags || []).filter((f: any) => !f.enabled).map((f: any) => f.feature_name);

      // Dev behavior scores
      const { count: totalScored } = await supabase.from('dev_behavior_scores').select('*', { count: 'exact', head: true });
      const { count: badActors } = await supabase.from('dev_behavior_scores').select('*', { count: 'exact', head: true }).eq('risk_tier', 'bad_actor');
      const { count: suspicious } = await supabase.from('dev_behavior_scores').select('*', { count: 'exact', head: true }).eq('risk_tier', 'suspicious');
      const { count: newScoresOvernight } = await supabase.from('dev_behavior_scores').select('*', { count: 'exact', head: true })
        .gte('scored_at', periodStart.toISOString()).lte('scored_at', periodEnd.toISOString());

      // Token fingerprints
      const { count: totalFingerprints } = await supabase.from('token_fingerprints').select('*', { count: 'exact', head: true });
      const { count: clusteredFingerprints } = await supabase.from('token_fingerprints').select('*', { count: 'exact', head: true }).not('cluster_id', 'is', null);

      // Co-mint clusters
      const { count: totalClusters } = await supabase.from('co_mint_clusters').select('*', { count: 'exact', head: true });
      const { count: newClustersOvernight } = await supabase.from('co_mint_clusters').select('*', { count: 'exact', head: true })
        .gte('created_at', periodStart.toISOString()).lte('created_at', periodEnd.toISOString());

      intelligenceStats = {
        feature_flags: { enabled: enabledFlags, disabled: disabledFlags },
        behavior_scores: { total: totalScored || 0, bad_actors: badActors || 0, suspicious: suspicious || 0, new_overnight: newScoresOvernight || 0 },
        fingerprints: { total: totalFingerprints || 0, clustered: clusteredFingerprints || 0 },
        co_mint_clusters: { total: totalClusters || 0, new_overnight: newClustersOvernight || 0 },
      };

      if ((badActors || 0) > 0 || (newClustersOvernight || 0) > 0) {
        alerts.push({
          level: 'info',
          category: 'intelligence',
          title: `Intelligence: ${badActors || 0} bad actors, ${newClustersOvernight || 0} new clusters overnight`,
          detail: `${totalScored || 0} devs scored, ${totalFingerprints || 0} fingerprints, ${totalClusters || 0} clusters total`,
        });
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch intelligence stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // EMAIL VERIFICATION & TRACKING STATS
    // ═══════════════════════════════════════════════════════════════
    let emailVerificationStats: any = {};
    try {
      // Verification stats
      const { count: totalVerifications } = await supabase
        .from('email_verifications')
        .select('*', { count: 'exact', head: true });

      const { count: verifiedCount } = await supabase
        .from('email_verifications')
        .select('*', { count: 'exact', head: true })
        .not('verified_at', 'is', null);

      const { count: pendingCount } = await supabase
        .from('email_verifications')
        .select('*', { count: 'exact', head: true })
        .is('verified_at', null)
        .eq('verification_type', 'signup');

      // Overnight verifications
      const { count: overnightVerified } = await supabase
        .from('email_verifications')
        .select('*', { count: 'exact', head: true })
        .not('verified_at', 'is', null)
        .gte('verified_at', periodStart.toISOString())
        .lte('verified_at', periodEnd.toISOString());

      // Overnight sent
      const { count: overnightSent } = await supabase
        .from('email_verifications')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', periodStart.toISOString())
        .lte('sent_at', periodEnd.toISOString());

      // Auto-suspended (reactivation tokens created = users who got suspended)
      const { count: autoSuspended } = await supabase
        .from('email_verifications')
        .select('*', { count: 'exact', head: true })
        .eq('verification_type', 'reactivation');

      // Email tracking stats (opens/clicks)
      const { data: trackingStats } = await supabase
        .from('email_tracking_events')
        .select('email_type, opened_at, clicked_at, open_count, click_count')
        .gte('sent_at', periodStart.toISOString())
        .lte('sent_at', periodEnd.toISOString());

      const totalEmailsSent = trackingStats?.length || 0;
      const totalOpened = trackingStats?.filter(e => e.opened_at)?.length || 0;
      const totalClicked = trackingStats?.filter(e => e.clicked_at)?.length || 0;
      const openRate = totalEmailsSent > 0 ? Math.round((totalOpened / totalEmailsSent) * 1000) / 10 : 0;
      const clickRate = totalEmailsSent > 0 ? Math.round((totalClicked / totalEmailsSent) * 1000) / 10 : 0;

      // By email type
      const byType: Record<string, { sent: number; opened: number; clicked: number }> = {};
      for (const e of trackingStats || []) {
        const t = e.email_type || 'unknown';
        if (!byType[t]) byType[t] = { sent: 0, opened: 0, clicked: 0 };
        byType[t].sent++;
        if (e.opened_at) byType[t].opened++;
        if (e.clicked_at) byType[t].clicked++;
      }

      emailVerificationStats = {
        total_verifications: totalVerifications || 0,
        verified: verifiedCount || 0,
        pending: pendingCount || 0,
        auto_suspended: autoSuspended || 0,
        overnight_verified: overnightVerified || 0,
        overnight_sent: overnightSent || 0,
        tracking: {
          overnight_emails_sent: totalEmailsSent,
          opened: totalOpened,
          clicked: totalClicked,
          open_rate_pct: openRate,
          click_rate_pct: clickRate,
          by_type: byType,
        },
      };

      // Alert if verification rate is low
      if ((totalVerifications || 0) > 10 && (verifiedCount || 0) / (totalVerifications || 1) < 0.3) {
        alerts.push({
          level: 'warning',
          category: 'email_verification',
          title: `Low email verification rate: ${Math.round(((verifiedCount || 0) / (totalVerifications || 1)) * 100)}%`,
          detail: `${verifiedCount}/${totalVerifications} verified. ${pendingCount} pending, ${autoSuspended} auto-suspended.`,
        });
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch email verification stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // TELEGRAM BOT ACTIVITY STATS
    // ═══════════════════════════════════════════════════════════════
    let telegramBotStats: any = {};
    try {
      // Overnight interactions
      const { data: overnightInteractions } = await supabase
        .from('telegram_bot_interactions')
        .select('telegram_user_id, telegram_username, command, is_new_user, chat_type, response_status, created_at')
        .gte('created_at', periodStart.toISOString())
        .lte('created_at', periodEnd.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);

      const interactions = overnightInteractions || [];
      const totalInteractions = interactions.length;

      // New bot users (is_new_user = true or /start commands)
      const newBotUsers = interactions.filter(i => i.is_new_user || i.command === '/start');
      const uniqueNewUsers = [...new Set(newBotUsers.map(i => i.telegram_user_id))];

      // Unique active users overnight
      const uniqueActiveUsers = [...new Set(interactions.map(i => i.telegram_user_id))];

      // Command breakdown
      const commandCounts: Record<string, number> = {};
      for (const i of interactions) {
        const cmd = i.command || 'unknown';
        commandCounts[cmd] = (commandCounts[cmd] || 0) + 1;
      }
      const topCommands = Object.entries(commandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cmd, count]) => ({ command: cmd, count }));

      // Chat type breakdown (private vs group)
      const chatTypeCounts: Record<string, number> = {};
      for (const i of interactions) {
        const ct = i.chat_type || 'unknown';
        chatTypeCounts[ct] = (chatTypeCounts[ct] || 0) + 1;
      }

      // Error rate
      const errorInteractions = interactions.filter(i => i.response_status === 'error');

      // Total all-time bot users
      const { count: totalBotUsers } = await supabase
        .from('telegram_bot_interactions')
        .select('telegram_user_id', { count: 'exact', head: true });

      // Distinct all-time users (approximate)
      let distinctUserCount = 0;
      try {
        const { data: distinctUsers } = await supabase
          .rpc('count_distinct_telegram_users' as any)
          .single();
        distinctUserCount = (distinctUsers as any)?.count || 0;
      } catch (_) {
        // RPC may not exist, use total as fallback
        distinctUserCount = totalBotUsers || 0;
      }

      // AI DM Chat stats
      let aiChatStats: any = {};
      try {
        const { data: aiDMs } = await supabase
          .from('telegram_group_messages')
          .select('telegram_user_id, username, is_bot_reply, message_text, created_at')
          .eq('chat_type', 'private')
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString())
          .order('created_at', { ascending: false })
          .limit(2000);

        const dms = aiDMs || [];
        const userMessages = dms.filter(d => !d.is_bot_reply);
        const botReplies = dms.filter(d => d.is_bot_reply);
        const uniqueDMUsers = [...new Set(userMessages.map(d => d.telegram_user_id))];

        // Extract common topics/keywords from user messages
        const topicCounts: Record<string, number> = {};
        for (const msg of userMessages) {
          const text = (msg.message_text || '').toLowerCase();
          const topicKeywords = ['holders', 'scan', 'price', 'buy', 'sell', 'alert', 'register', 'email', 'verify', 'help', 'subscribe', 'payment', 'feature', 'bubblemaps', 'oracle', 'intel', 'advertise'];
          for (const kw of topicKeywords) {
            if (text.includes(kw)) topicCounts[kw] = (topicCounts[kw] || 0) + 1;
          }
        }
        const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

        aiChatStats = {
          total_dm_messages: dms.length,
          user_messages: userMessages.length,
          bot_replies: botReplies.length,
          unique_dm_users: uniqueDMUsers.length,
          top_topics: topTopics.map(([topic, count]) => ({ topic, count })),
          sample_questions: userMessages.slice(0, 5).map(m => ({
            user: m.username || m.telegram_user_id,
            text: (m.message_text || '').slice(0, 100),
          })),
        };
      } catch (aiErr) {
        console.warn('[morning-report] Failed to fetch AI chat stats:', aiErr);
      }

      telegramBotStats = {
        overnight_interactions: totalInteractions,
        overnight_new_users: uniqueNewUsers.length,
        overnight_new_user_details: uniqueNewUsers.slice(0, 10).map(uid => {
          const u = newBotUsers.find(i => i.telegram_user_id === uid);
          return { telegram_user_id: uid, username: u?.telegram_username || null };
        }),
        overnight_active_users: uniqueActiveUsers.length,
        top_commands: topCommands,
        chat_type_breakdown: chatTypeCounts,
        error_count: errorInteractions.length,
        total_bot_interactions_alltime: totalBotUsers || 0,
        ai_chat_stats: aiChatStats,
      };

      if (uniqueNewUsers.length > 0) {
        alerts.push({
          level: 'info',
          category: 'telegram_bot',
          title: `${uniqueNewUsers.length} new TG bot user${uniqueNewUsers.length > 1 ? 's' : ''} overnight`,
          detail: uniqueNewUsers.slice(0, 5).map(uid => {
            const u = newBotUsers.find(i => i.telegram_user_id === uid);
            return u?.telegram_username ? `@${u.telegram_username}` : uid;
          }).join(', '),
        });
      }

      if (errorInteractions.length > 5) {
        alerts.push({
          level: 'warning',
          category: 'telegram_bot',
          title: `${errorInteractions.length} TG bot errors overnight`,
          detail: `${errorInteractions.length}/${totalInteractions} interactions failed`,
        });
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch telegram bot stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // WEB CHAT SESSIONS
    // ═══════════════════════════════════════════════════════════════
    let webChatStats: any = {};
    try {
      const { data: newSessions } = await supabase
        .from('web_chat_sessions')
        .select('id, visitor_fingerprint, user_id, tier, message_count, page_path, device_type, created_at, updated_at')
        .gte('created_at', cutoffISO)
        .order('created_at', { ascending: false })
        .limit(500);

      const { data: updatedSessions } = await supabase
        .from('web_chat_sessions')
        .select('id, visitor_fingerprint, user_id, tier, message_count, page_path, device_type, created_at, updated_at')
        .gte('updated_at', cutoffISO)
        .lt('created_at', cutoffISO)
        .order('updated_at', { ascending: false })
        .limit(500);

      const created = newSessions || [];
      const updated = updatedSessions || [];
      const allSessions = [...created, ...updated];

      const tierBreakdown: Record<string, number> = {};
      const deviceBreakdown: Record<string, number> = {};
      const pageBreakdown: Record<string, number> = {};
      let totalMessages = 0;

      for (const s of allSessions) {
        tierBreakdown[s.tier || 'unknown'] = (tierBreakdown[s.tier || 'unknown'] || 0) + 1;
        deviceBreakdown[s.device_type || 'unknown'] = (deviceBreakdown[s.device_type || 'unknown'] || 0) + 1;
        pageBreakdown[s.page_path || '/'] = (pageBreakdown[s.page_path || '/'] || 0) + 1;
        totalMessages += s.message_count || 0;
      }

      const topPages = Object.entries(pageBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 5);

      webChatStats = {
        new_sessions: created.length,
        updated_sessions: updated.length,
        total_messages: totalMessages,
        tier_breakdown: tierBreakdown,
        device_breakdown: deviceBreakdown,
        top_pages: topPages.map(([page, count]) => ({ page, count })),
        sample_new: created.slice(0, 5).map(s => ({
          id: s.id,
          tier: s.tier,
          messages: s.message_count,
          page: s.page_path,
          device: s.device_type,
        })),
      };
    } catch (e) {
      console.warn('[morning-report] Failed to fetch web chat stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // SOL SUBSCRIPTION STATS
    // ═══════════════════════════════════════════════════════════════
    let solSubscriptionStats: any = {};
    try {
      // Overnight SOL payments
      const { data: overnightSolPayments } = await supabase
        .from('tg_sol_subscriptions')
        .select('id, telegram_user_id, user_id, amount_sol, payment_wallet_pubkey, paid_at, expires_at, status')
        .eq('status', 'paid')
        .gte('paid_at', cutoffISO)
        .order('paid_at', { ascending: false });

      // Total active SOL subs
      const { count: activeSolSubs } = await supabase
        .from('tg_sol_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid')
        .gte('expires_at', new Date().toISOString());

      // Expiring in 14 days
      const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: expiringSoon } = await supabase
        .from('tg_sol_subscriptions')
        .select('id, telegram_user_id, user_id, expires_at')
        .eq('status', 'paid')
        .lte('expires_at', twoWeeksOut)
        .gte('expires_at', new Date().toISOString());

      const overnight = overnightSolPayments || [];
      const totalSolRevenue = overnight.reduce((s, p) => s + (p.amount_sol || 0), 0);

      solSubscriptionStats = {
        overnight_payments: overnight.length,
        overnight_revenue_sol: totalSolRevenue,
        active_sol_subs: activeSolSubs || 0,
        expiring_soon_14d: (expiringSoon || []).length,
        overnight_details: overnight.slice(0, 10).map(p => ({
          tg_user: p.telegram_user_id,
          amount: p.amount_sol,
          wallet: p.payment_wallet_pubkey?.slice(0, 8) + '...',
          expires: p.expires_at,
        })),
        expiring_details: (expiringSoon || []).slice(0, 10).map(e => ({
          tg_user: e.telegram_user_id,
          user_id: e.user_id,
          expires: e.expires_at,
        })),
      };

      if (overnight.length > 0) {
        alerts.push({
          level: 'info',
          category: 'sol_subscriptions',
          title: `${overnight.length} SOL subscription${overnight.length > 1 ? 's' : ''} overnight (${totalSolRevenue} SOL)`,
          detail: overnight.map(p => `${p.telegram_user_id}: ${p.amount_sol} SOL`).join(', '),
        });
      }
      if ((expiringSoon || []).length > 0) {
        alerts.push({
          level: 'warning',
          category: 'sol_subscriptions',
          title: `${(expiringSoon || []).length} SOL sub${(expiringSoon || []).length > 1 ? 's' : ''} expiring within 14 days`,
          detail: (expiringSoon || []).map(e => `${e.telegram_user_id} → ${new Date(e.expires_at!).toLocaleDateString()}`).join(', '),
        });
      }
    } catch (e) {
      console.warn('[morning-report] Failed to fetch SOL subscription stats:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // DETERMINE OVERALL STATUS
    // ═══════════════════════════════════════════════════════════════
    const criticalAlerts = alerts.filter(a => a.level === 'critical').length;
    const warningAlerts = alerts.filter(a => a.level === 'warning').length;
    const overallStatus = criticalAlerts > 0 ? 'critical' : warningAlerts > 0 ? 'warning' : 'healthy';

    const executionTimeMs = Date.now() - startTime;

    // ═══════════════════════════════════════════════════════════════
    // CREATOR FUSION STATS (last 24h)
    // ═══════════════════════════════════════════════════════════════
    let fusionStats: any = null;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ count: total }, { count: success24 }, { count: failures24 }, { data: newRows }, { data: mergeRows }, { data: profileTotal }, { data: aliasTotal }] = await Promise.all([
        supabase.from('creator_fusion_audit').select('*', { count: 'exact', head: true }),
        supabase.from('creator_fusion_audit').select('*', { count: 'exact', head: true }).eq('status', 'success').gte('ts', since),
        supabase.from('creator_fusion_audit').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('ts', since),
        supabase.from('creator_fusion_audit').select('creator_id').eq('is_new', true).gte('ts', since),
        supabase.from('creator_merge_log').select('id, surviving_id, absorbed_id, trigger_kind, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(20),
        supabase.from('developer_profiles').select('id', { count: 'exact', head: true }).is('merged_into', null),
        supabase.from('creator_identity_aliases').select('creator_id', { count: 'exact', head: true }),
      ]);
      fusionStats = {
        audit_rows_total: total || 0,
        success_24h: success24 || 0,
        failures_24h: failures24 || 0,
        new_creators_24h: (newRows || []).length,
        merges_24h: (mergeRows || []).length,
        recent_merges: (mergeRows || []).slice(0, 10),
        active_creator_profiles: profileTotal as any || 0,
        alias_count: aliasTotal as any || 0,
      };
      if ((failures24 || 0) > 0) {
        alerts.push({
          severity: (failures24 || 0) > 5 ? 'critical' : 'warning',
          category: 'creator-fusion',
          message: `${failures24} Creator Fusion failures in last 24h — check creator_fusion_audit table`,
        });
      }
    } catch (e) {
      console.error('[morning-report] fusion stats failed:', e);
    }

    // ═══════════════════════════════════════════════════════════════
    // SAVE REPORT TO DATABASE
    // ═══════════════════════════════════════════════════════════════
    const report = await assertUpsert(supabase
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
        new_subscribers_details: { entries: newSubscribersDetails, summary: subscriptionSummary },
        table_health: tableHealth,
        external_services_status: externalServicesStatus,
        holders_intel_metrics: holdersIntelMetrics,
        vigil_stats: vigilStats,
        allstar_stats: allstarStats,
        function_health: functionHealth,
        dlq_stats: dlqStats,
        spider_metrics: spiderMetrics,
        mesh_growth: meshGrowth,
        funnel_metrics: funnelMetrics,
        funnel_feed_throughput: funnelFeedThroughput,
        db_size_info: dbSizeInfo,
        intelligence_stats: intelligenceStats,
        email_verification_stats: emailVerificationStats,
        telegram_bot_stats: telegramBotStats,
        web_chat_stats: webChatStats,
        sol_subscription_stats: solSubscriptionStats,
        fusion_stats: fusionStats,
        unread_notifications: unreadCount || 0,
        alerts,
        execution_time_ms: executionTimeMs,
      }, { onConflict: 'report_date' })
      .select()
      .single(), 'morning_reports');

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
    tgMessage += `• New Subscribers: ${stripeSubCount}`;
    if (stripeSubCount > 0) {
      tgMessage += ` ($${(totalRevenueCents / 100).toFixed(2)} revenue)\n`;
      for (const s of newSubscribersDetails.slice(0, 5)) {
        tgMessage += `  → ${s.email} — ${s.tier_key} ${s.amount}/${s.interval}${s.linked ? ' ✅ linked' : ' ⏳ unlinked'}\n`;
      }
    } else {
      tgMessage += `\n`;
    }
    if (bannerPurchaseCount > 0) {
      tgMessage += `• Banner Purchases: ${bannerPurchaseCount}\n`;
    }
    // SOL subscription overnight
    if (solSubscriptionStats.overnight_payments > 0) {
      tgMessage += `• 💰 SOL Payments: ${solSubscriptionStats.overnight_payments} (${solSubscriptionStats.overnight_revenue_sol} SOL)\n`;
      for (const p of (solSubscriptionStats.overnight_details || []).slice(0, 5)) {
        tgMessage += `  → TG:${p.tg_user} — ${p.amount} SOL\n`;
      }
    }
    if (solSubscriptionStats.expiring_soon_14d > 0) {
      tgMessage += `• ⏰ SOL subs expiring <14d: ${solSubscriptionStats.expiring_soon_14d}\n`;
    }
    tgMessage += `• Active SOL Subs: ${solSubscriptionStats.active_sol_subs || 0}\n`;
    tgMessage += `• Total Active Subs: ${totalActiveSubscribers || 0} (${totalLinkedAccounts || 0} linked)\n\n`;

    // Email Verification section
    if (emailVerificationStats.total_verifications > 0 || emailVerificationStats.overnight_sent > 0) {
      tgMessage += `📧 **Email Verification**\n`;
      tgMessage += `• Total: ${emailVerificationStats.total_verifications} sent | ${emailVerificationStats.verified} verified | ${emailVerificationStats.pending} pending\n`;
      if (emailVerificationStats.auto_suspended > 0) {
        tgMessage += `• ⚠️ Auto-suspended (48h): ${emailVerificationStats.auto_suspended}\n`;
      }
      if (emailVerificationStats.overnight_sent > 0 || emailVerificationStats.overnight_verified > 0) {
        tgMessage += `• Overnight: ${emailVerificationStats.overnight_sent} sent, ${emailVerificationStats.overnight_verified} verified\n`;
      }
      const tr = emailVerificationStats.tracking;
      if (tr && tr.overnight_emails_sent > 0) {
        tgMessage += `• Tracking: ${tr.overnight_emails_sent} emails → ${tr.open_rate_pct}% opened, ${tr.click_rate_pct}% clicked\n`;
      }
      tgMessage += `\n`;
    }

    // Telegram Bot section
    if (telegramBotStats.overnight_interactions > 0 || telegramBotStats.overnight_new_users > 0) {
      tgMessage += `🤖 **Telegram Bot**\n`;
      tgMessage += `• Overnight: ${telegramBotStats.overnight_interactions} interactions | ${telegramBotStats.overnight_active_users} active users\n`;
      if (telegramBotStats.overnight_new_users > 0) {
        tgMessage += `• 🆕 New bot users: ${telegramBotStats.overnight_new_users}\n`;
        for (const u of (telegramBotStats.overnight_new_user_details || []).slice(0, 5)) {
          tgMessage += `  → ${u.username ? '@' + u.username : u.telegram_user_id}\n`;
        }
      }
      if (telegramBotStats.top_commands?.length > 0) {
        const topCmds = telegramBotStats.top_commands.slice(0, 5).map((c: any) => `${c.command}:${c.count}`).join(', ');
        tgMessage += `• Top commands: ${topCmds}\n`;
      }
      if (telegramBotStats.error_count > 0) {
        tgMessage += `• ⚠️ Errors: ${telegramBotStats.error_count}\n`;
      }
      tgMessage += `\n`;
    }

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
      tgMessage += `• Followers: ${hi.followers.total.toLocaleString()} (🔵 ~${hi.followers.blue_check_premium.toLocaleString()} verified indexed / 👤 ${hi.followers.normal.toLocaleString()} normal — ~${hi.followers.blue_check_pct}% blue est.)\n`;
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

    // Function Health section
    if (functionHealth.total_runs > 0) {
      tgMessage += `\n⚙️ **Function Health** (${functionHealth.total_runs} runs, ${functionHealth.total_errors} errors)\n`;
      const failedFuncs = Object.entries(functionHealth.by_function || {})
        .filter(([, s]: [string, any]) => s.errors > 0)
        .sort((a: any, b: any) => b[1].errors - a[1].errors)
        .slice(0, 5);
      for (const [fname, stats] of failedFuncs as [string, any][]) {
        tgMessage += `• 🔴 ${fname}: ${stats.errors}/${stats.runs} failed (${stats.fail_pct}%) avg ${stats.avg_ms}ms\n`;
      }
    }

    // DLQ section
    if (dlqStats.pending > 0 || dlqStats.exhausted > 0) {
      tgMessage += `\n📥 **Dead Letter Queue**\n`;
      tgMessage += `• Pending: ${dlqStats.pending} | Exhausted: ${dlqStats.exhausted} | New overnight: ${dlqStats.new_overnight}\n`;
    }

    // Mesh/Spider section
    if (meshGrowth.total_developers) {
      tgMessage += `\n🕸️ **Mesh Growth**\n`;
      tgMessage += `• Devs: ${meshGrowth.total_developers} | Wallets: ${meshGrowth.total_wallets} | Socials: ${meshGrowth.total_social_links}\n`;
      if (meshGrowth.new_wallets_today > 0 || meshGrowth.new_social_links_today > 0) {
        tgMessage += `• New today: +${meshGrowth.new_wallets_today} wallets, +${meshGrowth.new_social_links_today} social links\n`;
      }
    }

    // Intelligence Engine section
    if (intelligenceStats.behavior_scores) {
      const bs = intelligenceStats.behavior_scores;
      const fp = intelligenceStats.fingerprints;
      const cm = intelligenceStats.co_mint_clusters;
      const flags = intelligenceStats.feature_flags;
      tgMessage += `\n🧠 **Intelligence Engine**\n`;
      tgMessage += `• Features: ${flags?.enabled?.length || 0} active, ${flags?.disabled?.length || 0} disabled\n`;
      tgMessage += `• Dev Scores: ${bs.total} total (🔴 ${bs.bad_actors} bad actors, 🟡 ${bs.suspicious} suspicious)\n`;
      if (bs.new_overnight > 0) tgMessage += `• New scores overnight: +${bs.new_overnight}\n`;
      tgMessage += `• Fingerprints: ${fp?.total || 0} (${fp?.clustered || 0} clustered)\n`;
      tgMessage += `• Co-Mint Clusters: ${cm?.total || 0}`;
      if ((cm?.new_overnight || 0) > 0) tgMessage += ` (+${cm.new_overnight} overnight)`;
      tgMessage += `\n`;
    }

    if (Object.keys(funnelMetrics).length > 0) {
      tgMessage += `\n🔬 **Token Funnel** (today)\n`;
      for (const [stage, count] of Object.entries(funnelMetrics)) {
        tgMessage += `• ${stage}: ${count}\n`;
      }
    }

    // Funnel Feed Throughput
    if (funnelFeedThroughput.total_overnight > 0 || funnelFeedThroughput.total_discoveries_overnight > 0) {
      tgMessage += `\n📡 **Funnel Feed Throughput** (overnight)\n`;
      if (funnelFeedThroughput.total_overnight > 0) {
        tgMessage += `• Post Queue: ${funnelFeedThroughput.total_overnight} tokens ingested\n`;
        const bySource = funnelFeedThroughput.by_source || {};
        for (const [src, info] of Object.entries(bySource) as [string, any][]) {
          const srcLabel = src === 'dex_cloudflare' ? '☁️ Dex/CF' 
            : src === 'telegram' ? '📡 Telegram'
            : src === 'holders_input' ? '🔎 /holders'
            : src === 'bot_dm' ? '🤖 Bot DM'
            : src === 'bubbles' ? '🫧 Bubbles'
            : src === 'allstar_alert' ? '⭐ Allstar'
            : src;
          tgMessage += `  ${srcLabel}: ${info.count} (✅${info.posted} posted, ⏳${info.pending} pending)\n`;
          // Show top tokens per source
          const topTokens = (info.tokens || []).slice(0, 3).map((t: any) => t.symbol ? `$${t.symbol}` : t.mint.slice(0, 8)).join(', ');
          if (topTokens) tgMessage += `    → ${topTokens}\n`;
        }
      }
      if (funnelFeedThroughput.total_discoveries_overnight > 0) {
        tgMessage += `• Discovery Pipeline: ${funnelFeedThroughput.total_discoveries_overnight} tokens\n`;
        const dSources = funnelFeedThroughput.discovery_sources || {};
        for (const [src, info] of Object.entries(dSources) as [string, any][]) {
          tgMessage += `  ${src}: ${info.count} discovered (${info.watchlisted} watchlisted, ${info.posted} posted)\n`;
        }
      }
    }

    // AI Chat DM stats
    const acs = telegramBotStats.ai_chat_stats;
    if (acs && (acs.total_dm_messages > 0 || acs.unique_dm_users > 0)) {
      tgMessage += `\n💬 **AI Chat (TG DMs)**\n`;
      tgMessage += `• ${acs.user_messages} user msgs → ${acs.bot_replies} bot replies (${acs.unique_dm_users} unique users)\n`;
      if (acs.top_topics?.length > 0) {
        tgMessage += `• Hot topics: ${acs.top_topics.slice(0, 5).map((t: any) => `${t.topic}(${t.count})`).join(', ')}\n`;
      }
      if (acs.sample_questions?.length > 0) {
        tgMessage += `• Sample Qs:\n`;
        for (const q of acs.sample_questions.slice(0, 3)) {
          tgMessage += `  → @${q.user}: "${q.text}"\n`;
        }
      }
    }

    // Web Chat Sessions
    if (webChatStats.new_sessions > 0 || webChatStats.updated_sessions > 0) {
      tgMessage += `\n🌐 **Web Chat Sessions**\n`;
      tgMessage += `• ${webChatStats.new_sessions} new sessions, ${webChatStats.updated_sessions} updated\n`;
      tgMessage += `• ${webChatStats.total_messages} total messages\n`;
      if (webChatStats.tier_breakdown) {
        const tiers = Object.entries(webChatStats.tier_breakdown).map(([t, c]) => `${t}:${c}`).join(', ');
        tgMessage += `• Tiers: ${tiers}\n`;
      }
      if (webChatStats.device_breakdown) {
        const devices = Object.entries(webChatStats.device_breakdown).map(([d, c]) => `${d}:${c}`).join(', ');
        tgMessage += `• Devices: ${devices}\n`;
      }
      if (webChatStats.top_pages?.length > 0) {
        tgMessage += `• Top pages: ${webChatStats.top_pages.slice(0, 3).map((p: any) => `${p.page}(${p.count})`).join(', ')}\n`;
      }
    }

    // AI Compute Stats
    try {
      const { data: computeRows } = await supabase
        .from('ai_compute_log')
        .select('platform, prompt_tokens, completion_tokens, total_tokens, response_time_ms, cost_estimate_usd')
        .gte('created_at', cutoffISO);

      if (computeRows && computeRows.length > 0) {
        const webRows = computeRows.filter(r => r.platform === 'web');
        const tgRows = computeRows.filter(r => r.platform === 'telegram');
        const totalTokens = computeRows.reduce((s, r) => s + (r.total_tokens || 0), 0);
        const totalCost = computeRows.reduce((s, r) => s + Number(r.cost_estimate_usd || 0), 0);
        const avgResponseMs = Math.round(computeRows.reduce((s, r) => s + (r.response_time_ms || 0), 0) / computeRows.length);

        tgMessage += `\n🧠 **AI Compute**\n`;
        tgMessage += `• ${computeRows.length} total calls (Web: ${webRows.length}, TG: ${tgRows.length})\n`;
        tgMessage += `• ${totalTokens.toLocaleString()} tokens used\n`;
        tgMessage += `• Est. cost: $${totalCost.toFixed(4)}\n`;
        tgMessage += `• Avg response: ${avgResponseMs}ms\n`;
      }
    } catch (computeErr) {
      console.warn('[morning-report] AI compute stats error:', computeErr);
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
        function_health: functionHealth,
        dlq_stats: dlqStats,
        spider_metrics: spiderMetrics,
        mesh_growth: meshGrowth,
        funnel_metrics: funnelMetrics,
        funnel_feed_throughput: funnelFeedThroughput,
        new_signups_details: newSignupsDetails,
        alerts,
        telegram_sent: telegramSent,
        execution_ms: executionTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[morning-report] Fatal:', (error as Error).message);
    return new Response(
      JSON.stringify({ status: 'error', error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
