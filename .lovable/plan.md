## Stop the Solscan 429 alert spam + add traceable alert IDs

### Step 1 — Add function-level trace IDs to alerts
Edit `supabase/functions/_shared/api-failure-alerts.ts` and `_shared/api-logger.ts`:
- Accept a `functionName` parameter (required).
- Prefix every TG/email/SMS alert message with `[fn=<functionName>][svc=<service>][ep=<endpoint>][code=<status>]`.
- Write the same tag into `admin_notifications.metadata.trace_id`.

### Step 2 — Redeploy all 29 functions that import the alert stack
One `supabase--deploy_edge_functions` call with:
```
autopsy-community-sweep, backfill-banner-urls, backfill-x-communities,
breadcrumbs-scanner, dex-paid-checker, dex-top-200, flipit-backfill-tracking,
flipit-execute, follower-audit, helius-rpc-proxy, scalp-mode-validator,
insiders-row-ingest, mesh-kyc-deep-search, token-metadata, twitter-tg-hunter,
x-pinned-community-finder, probe-burns, probe-buybacks, verify-solscan-pro,
oracle-unified-lookup, twitter-profile-enricher, social-larp-detector,
no-lube-compose, pumpfun-kol-twitter-scanner, scrape-twitter-posts,
scrape-installer-x-profiles, lifecycle-scorecard-builder,
liquidity-lock-checker, solscan-rate-limiter
```
This replaces every stale deployed bundle with the kill-switched + traceable version.

### Step 3 — Purge stale notification rows
Migration: `DELETE FROM admin_notifications WHERE notification_type='api_auth_failure' AND metadata->>'service'='solscan';` so Morning Report has nothing old to re-aggregate.

### Step 4 — Harden Morning Report
Edit `supabase/functions/morning-report/index.ts`:
- Skip `service='solscan'` 429s (quota-exhausted, not an incident).
- Skip `api_auth_failure` rows in the historical aggregation (already kill-switched at source).

### Step 5 — Verify
- Wait 60s, query `admin_notifications` for any new `api_auth_failure` rows post-deploy → expect 0.
- Watch BlackBox TG 10 min. Any stray alert now carries `[fn=...]` so we can pinpoint the missed function immediately.

### Technical notes
- No schema changes beyond the one-time DELETE.
- No frontend changes.
- `trace_id` becomes the permanent backtrace handle for all future alerts.
