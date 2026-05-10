import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * RECONCILE CRON JOBS
 * 
 * Canonical list of all required cron jobs. Compares against cron.job table
 * and re-creates any that are missing. Safe to call repeatedly (idempotent).
 * 
 * Called by system-health-audit hourly, or manually from admin panel.
 */

const PROJECT_URL = 'https://apxauapuusmgwbbzjgfl.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';

interface CronDef {
  jobname: string;
  schedule: string;
  /** SQL command body — use __URL__ and __ANON__ as placeholders */
  command: string;
}

// Helper to build a standard net.http_post command
function httpPost(functionName: string, body: string, useServiceRole = false): string {
  const authHeader = useServiceRole
    ? `'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)`
    : `'Bearer ${ANON_KEY}'`;

  if (useServiceRole) {
    return `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/${functionName}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', ${authHeader}
    ),
    body := '${body}'::jsonb
  ) AS request_id;`;
  }

  return `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/${functionName}',
    headers := '{\\\"Content-Type\\\": \\\"application/json\\\", \\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body := '${body}'::jsonb
  ) AS request_id;`;
}

// ═══════════════════════════════════════════════
// CANONICAL CRON REGISTRY — single source of truth
// ═══════════════════════════════════════════════
const REQUIRED_CRONS: CronDef[] = [
  // ── HoldersIntel pipeline ──
  {
    jobname: 'holdersintel-poster-3min',
    schedule: '*/3 * * * *',
    command: httpPost('holders-intel-poster', '{}'),
  },
  {
    jobname: 'holdersintel-dex-scanner-5min',
    schedule: '*/5 * * * *',
    command: httpPost('holders-intel-dex-scanner', '{}'),
  },
  {
    jobname: 'holdersintel-scheduler-hourly',
    schedule: '15 * * * *',
    command: `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/holders-intel-scheduler',
    headers := '{\\\"Content-Type\\\": \\\"application/json\\\", \\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body := concat('{\\\"time\\\": \\\"', now(), '\\\"}')::jsonb
  ) AS request_id;`,
  },

  // ── System health & housekeeping ──
  {
    jobname: 'system-health-audit-hourly',
    schedule: '0 * * * *',
    command: httpPost('system-health-audit', '{}'),
  },
  {
    jobname: 'morning-report-daily',
    schedule: '0 13 * * *',
    command: httpPost('morning-report', '{\\\"scheduled\\\": true}'),
  },
  {
    jobname: 'database-housekeeping-daily',
    schedule: '0 3 * * *',
    command: httpPost('database-housekeeping', '{\\\"action\\\": \\\"prune\\\", \\\"dryRun\\\": false}'),
  },
  {
    jobname: 'sol-renewal-reminder-daily',
    schedule: '0 14 * * *',
    command: httpPost('sol-renewal-reminder', '{\\\"scheduled\\\": true}'),
  },
  {
    jobname: 'reset-monthly-quotas',
    schedule: '5 0 1 * *',
    command: httpPost('reset-monthly-quotas', '{\\\"source\\\": \\\"cron\\\"}'),
  },

  // ── Oracle / Intelligence ──
  {
    jobname: 'oracle-hourly-scan',
    schedule: '0 * * * *',
    command: httpPost('dexscreener-top-200-scraper', '{}'),
  },
  {
    jobname: 'enrich-scraped-tokens-2m',
    schedule: '*/2 * * * *',
    command: httpPost('enrich-scraped-tokens', '{\"batchSize\": 25}'),
  },
  {
    jobname: 'oracle-historical-backfill',
    schedule: '*/30 * * * *',
    command: `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/oracle-historical-backfill',
    headers := '{\\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body := '{\\\"maxDaysPerRun\\\": 1}'::jsonb
  );`,
  },
  {
    jobname: 'developer-integrity-hourly',
    schedule: '0 * * * *',
    command: httpPost('calculate-developer-integrity', '{\\\"recalculateAll\\\": true}', true),
  },

  // ── Pump.fun pipeline ──
  {
    jobname: 'pumpfun-orchestrator-5min',
    schedule: '*/5 * * * *',
    command: `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/pumpfun-orchestrator',
    headers := '{\\\"Content-Type\\\": \\\"application/json\\\", \\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body := concat('{\\\"time\\\": \\\"', now(), '\\\"}')::jsonb
  ) AS request_id;`,
  },
  {
    jobname: 'audit-creator-integrity-5min',
    schedule: '*/5 * * * *',
    command: `
  SELECT net.http_post(
    url:='${PROJECT_URL}/functions/v1/audit-creator-integrity',
    headers:='{\\\"Content-Type\\\": \\\"application/json\\\", \\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body:=concat('{\\\"table\\\": \\\"pumpfun_watchlist\\\", \\\"batchSize\\\": 100, \\\"offset\\\": ', COALESCE((SELECT MAX(batch_offset) + 100 FROM creator_audit_results WHERE table_name = 'pumpfun_watchlist' AND matches > 0), 0), '}')::jsonb
  ) as request_id;`,
  },

  // ── Trading / FlipIt ──
  {
    jobname: 'trading-orchestrator-5min',
    schedule: '*/5 * * * *',
    command: `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/trading-orchestrator',
    headers := '{\\\"Content-Type\\\": \\\"application/json\\\", \\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body := concat('{\\\"time\\\": \\\"', now(), '\\\"}')::jsonb
  ) AS request_id;`,
  },
  // flipit-price-monitor removed from cron — activated on-demand via FlipIt dashboard only

  // ── Enrichment & backfill ──
  {
    jobname: 'funnel-feed-scanner-5min',
    schedule: '*/5 * * * *',
    command: httpPost('funnel-feed-scanner', '{\\\"action\\\": \\\"scan\\\"}'),
  },
  {
    jobname: 'harvest-token-socials-backfill',
    schedule: '*/5 * * * *',
    command: httpPost('harvest-token-socials', '{\\\"mode\\\": \\\"both\\\", \\\"batchSize\\\": 500}'),
  },
  {
    jobname: 'backfill-genealogy-drip',
    schedule: '*/10 * * * *',
    command: `
  SELECT net.http_post(
    url := '${PROJECT_URL}/functions/v1/backfill-genealogy',
    headers := '{\\\"Content-Type\\\": \\\"application/json\\\", \\\"Authorization\\\": \\\"Bearer ${ANON_KEY}\\\"}'::jsonb,
    body := '{\\\"batchSize\\\": 5}'::jsonb
  );`,
  },
  // PAUSED: Firecrawl credit conservation — resume April 24th 2026
  // Was: */5 * * * * — 288 Firecrawl calls/day, biggest credit burner
  // {
  //   jobname: 'bulk-community-enricher-drip',
  //   schedule: '*/5 * * * *',
  //   command: `
  // SELECT net.http_post(
  //   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/bulk-community-enricher',
  //   headers := jsonb_build_object(
  //     'Content-Type', 'application/json',
  //     'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
  //   ),
  //   body := '{\\\"batchSize\\\": 1}'::jsonb
  // );`,
  // },
  {
    jobname: 'backcheck-rejected-6h',
    schedule: '0 */6 * * *',
    command: httpPost('backcheck-rejected-tokens', '{\\\"batch_size\\\": 25, \\\"max_batches\\\": 20}'),
  },
  {
    jobname: 'backcheck-stop-loss-4h',
    schedule: '0 */4 * * *',
    command: httpPost('backcheck-stop-loss-exits', '{\\\"batch_size\\\": 25, \\\"max_batches\\\": 20}', true),
  },
  {
    jobname: 'mesh-backfill-6h',
    schedule: '0 */6 * * *',
    command: httpPost('backfill-rejection-mesh', '{\\\"batch_size\\\": 25, \\\"offset\\\": 0}', true),
  },

  // ── Social / KOL ──
  {
    jobname: 'phanes-x-backfill',
    schedule: '* * * * *',
    command: httpPost('phanes-x-query', '{\\\"action\\\": \\\"backfill\\\"}'),
  },
  {
    jobname: 'promo-poster-check',
    schedule: '*/30 * * * *',
    command: httpPost('promo-poster', '{}'),
  },
  {
    jobname: 'daily-kol-leaderboard-refresh',
    schedule: '0 6 * * *',
    command: `
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/pumpfun-kol-registry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := '{\\\"action\\\": \\\"refresh-kolscan\\\", \\\"timeframe\\\": \\\"1\\\"}'::jsonb
  );`,
  },
  {
    jobname: 'kol-registry-sync-daily',
    schedule: '0 6 * * *',
    command: httpPost('kol-registry-sync', '{\\\"time\\\": \\\"now\\\"}'),
  },

  // ── Materialized views ──
  {
    jobname: 'refresh_master_token_directory',
    schedule: '*/30 * * * *',
    command: 'SELECT refresh_master_token_directory();',
  },
  {
    jobname: 'refresh-master-token-directory',
    schedule: '30 */2 * * *',
    command: 'REFRESH MATERIALIZED VIEW CONCURRENTLY master_token_directory;',
  },
  {
    jobname: 'refresh-mesh-summary-hourly',
    schedule: '0 * * * *',
    command: 'SELECT refresh_mesh_summary()',
  },
  {
    jobname: 'archive-morning-reports-monthly',
    schedule: '0 0 1 * *',
    command: 'SELECT public.archive_old_morning_reports();',
  },

  // ── Family Surveillance Engine ──
  {
    jobname: 'family-discovery-engine-10min',
    schedule: '*/10 * * * *',
    command: httpPost('family-discovery-engine', '{\\\"maxSeeds\\\": 3, \\\"maxTxPerWallet\\\": 30}'),
  },
  {
    jobname: 'family-mint-monitor-p1-5min',
    schedule: '*/5 * * * *',
    command: httpPost('family-mint-monitor', '{\\\"priority\\\": \\\"P1\\\", \\\"batchSize\\\": 10}'),
  },
  {
    jobname: 'family-mint-monitor-all-15min',
    schedule: '*/15 * * * *',
    command: httpPost('family-mint-monitor', '{\\\"priority\\\": \\\"all\\\", \\\"batchSize\\\": 20}'),
  },
  // ── Allstar Promotion Engine ──
  {
    jobname: 'allstar-promotion-engine-30min',
    schedule: '*/30 * * * *',
    command: httpPost('allstar-promotion-engine', '{\\\"min_ath_usd\\\": 100000, \\\"max_promotions\\\": 15}'),
  },

  // ── X Community Backfill (self-terminating when complete) ──
  {
    jobname: 'backfill-x-communities-5min',
    schedule: '*/5 * * * *',
    command: httpPost('backfill-x-communities', '{\\\"batchSize\\\": 300}'),
  },

  // ── Intelligence Tier 1: Behavioral Scoring ──
  {
    jobname: 'dev-behavior-scorer-30min',
    schedule: '*/30 * * * *',
    command: httpPost('dev-behavior-scorer', '{\\\"batchSize\\\": 50}'),
  },
  // ── Intelligence Tier 1: Token Fingerprinting ──
  {
    jobname: 'token-fingerprint-scanner-30min',
    schedule: '*/30 * * * *',
    command: httpPost('token-fingerprint-scanner', '{\\\"batchSize\\\": 100}'),
  },
  // ── Intelligence Tier 1: Co-Mint Cluster Detection ──
  {
    jobname: 'co-mint-cluster-detector-15min',
    schedule: '*/15 * * * *',
    command: httpPost('co-mint-cluster-detector', '{\\\"windowMinutes\\\": 5, \\\"lookbackHours\\\": 24}'),
  },

  // ── Oracle Auto-Classifier (activates scoring + blacklist/whitelist) ──
  {
    jobname: 'oracle-auto-classifier-15min',
    schedule: '*/15 * * * *',
    command: httpPost('oracle-auto-classifier', '{\\\"processNewTokens\\\": true}'),
  },

  // ── Token Autopsy (post-mortem cause of death analysis) ──
  {
    jobname: 'token-autopsy-30min',
    schedule: '*/30 * * * *',
    command: httpPost('token-autopsy', '{\\\"batchSize\\\": 20}'),
  },
];

Deno.serve(withRunLog('reconcile-cron-jobs', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const forceJobs = new Set<string>(Array.isArray(body?.forceJobs) ? body.forceJobs : []);

    // Get current cron jobs
    const { data: currentJobs, error: fetchErr } = await supabase
      .rpc('get_cron_job_names') // We'll create this function
      .then(() => { throw new Error('use raw'); })
      .catch(async () => {
        // Direct query via postgres function
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_cron_job_names`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          },
        });
        if (!res.ok) throw new Error(`RPC failed: ${res.status}`);
        return { data: await res.json(), error: null };
      });

    const existingNames = new Set((currentJobs || []).map((r: any) => r.jobname));

    const missing: string[] = [];
    const forced: string[] = [];
    const restored: string[] = [];

    for (const cron of REQUIRED_CRONS) {
      if (forceJobs.has(cron.jobname) && existingNames.has(cron.jobname)) {
        forced.push(cron.jobname);
        const unscheduleSQL = `SELECT cron.unschedule('${cron.jobname}');`;
        const unscheduleRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          },
          body: JSON.stringify({ query: unscheduleSQL }),
        });
        if (!unscheduleRes.ok) {
          console.error(`Failed to force-unschedule ${cron.jobname}:`, await unscheduleRes.text());
          continue;
        }
        existingNames.delete(cron.jobname);
      }

      if (!existingNames.has(cron.jobname)) {
        missing.push(cron.jobname);

        // Re-create via cron.schedule
        const scheduleSQL = `SELECT cron.schedule('${cron.jobname}', '${cron.schedule}', $cronbody$${cron.command}$cronbody$);`;

        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
          },
          body: JSON.stringify({ query: scheduleSQL }),
        });

        if (res.ok) {
          restored.push(cron.jobname);
        } else {
          console.error(`Failed to restore ${cron.jobname}:`, await res.text());
        }
      }
    }

    // If any were restored, create admin alert
    if (restored.length > 0) {
      await assertInsert(
        supabase.from('admin_notifications').insert({
          title: `🔧 Cron Reconciler: Restored ${restored.length} jobs`,
          message: `Missing/forced cron jobs restored: ${restored.join(', ')}`,
          notification_type: 'cron_reconcile',
          metadata: { missing, forced, restored, total_required: REQUIRED_CRONS.length },
        }),
        'admin_notifications',
      );
    }

    return new Response(
      JSON.stringify({
        total_required: REQUIRED_CRONS.length,
        existing: existingNames.size,
        missing,
        forced,
        restored,
        status: missing.length === 0 ? 'all_present' : `restored_${restored.length}_of_${missing.length}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cron reconciliation error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));

