-- Function toggle system: runtime kill switch for cron-driven edge functions
CREATE TABLE public.function_toggles (
  function_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  disabled_reason text,
  disabled_at timestamptz,
  disabled_by uuid,
  last_skipped_at timestamptz,
  skip_count_24h integer NOT NULL DEFAULT 0,
  skip_count_reset_at timestamptz NOT NULL DEFAULT now(),
  category text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.function_toggles ENABLE ROW LEVEL SECURITY;

-- Public read of just the on/off state — needed so guards work without auth overhead
-- (the guard runs inside the edge function with service role anyway, but this keeps it simple)
CREATE POLICY "Anyone can read function toggle status"
  ON public.function_toggles FOR SELECT
  USING (true);

-- Only super admins can change toggle state
CREATE POLICY "Super admins can insert toggles"
  ON public.function_toggles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update toggles"
  ON public.function_toggles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete toggles"
  ON public.function_toggles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- updated_at trigger
CREATE TRIGGER set_function_toggles_updated_at
  BEFORE UPDATE ON public.function_toggles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RPC the guard calls to record a skip without needing UPDATE perms via anon
CREATE OR REPLACE FUNCTION public.record_function_skip(p_function_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.function_toggles
  SET
    last_skipped_at = now(),
    skip_count_24h = CASE
      WHEN skip_count_reset_at < now() - interval '24 hours' THEN 1
      ELSE skip_count_24h + 1
    END,
    skip_count_reset_at = CASE
      WHEN skip_count_reset_at < now() - interval '24 hours' THEN now()
      ELSE skip_count_reset_at
    END
  WHERE function_name = p_function_name;
END;
$$;

-- Seed all cron-driven function names (enabled by default)
INSERT INTO public.function_toggles (function_name, enabled, category, description) VALUES
  -- HoldersIntel core
  ('holdersintel-orchestrator', true, 'holdersintel', 'Master orchestrator for HoldersIntel + social scanning'),
  ('holders-intel-poster', true, 'holdersintel', 'Posts intel cards to Telegram'),
  ('holders-intel-dex-scanner', true, 'holdersintel', 'DexScreener scanner for HoldersIntel pipeline'),
  ('dex-top-200', true, 'holdersintel', 'Scrapes DexScreener top 200 (Firecrawl)'),
  ('funnel-feed-scanner', true, 'holdersintel', 'Live feed funnel scanner'),
  ('feed-health-scanner', true, 'holdersintel', 'Hourly Litmus Strip health snapshots for feed tokens'),
  ('harvest-token-socials-backfill', true, 'holdersintel', 'Backfills missing token social links'),
  ('ath-24h-backfill', true, 'holdersintel', '24h ATH backfill via GeckoTerminal'),
  ('morning-report', true, 'holdersintel', 'Daily morning report generator'),
  ('phanes-x-backfill', true, 'holdersintel', 'X/Twitter profile backfill'),
  ('hunter-tweet-scrape', true, 'holdersintel', 'Hunter tweet scraper'),
  ('daily-twitter-profile-refresh', true, 'holdersintel', 'Daily refresh of tracked Twitter profiles'),
  -- Oracle / forensics
  ('oracle-hourly-scan', true, 'oracle', 'Oracle hourly scan'),
  ('oracle-auto-classifier', true, 'oracle', 'Auto-classifier for Oracle entities'),
  ('oracle-historical-backfill', true, 'oracle', 'Historical backfill for Oracle'),
  ('family-discovery-engine', true, 'oracle', 'Discovers wallet families'),
  ('family-mint-monitor-p1', true, 'oracle', 'Priority 1 family mint monitor'),
  ('family-mint-monitor-all', true, 'oracle', 'Full family mint monitor'),
  ('dev-behavior-scorer', true, 'oracle', 'Scores developer behavior patterns'),
  ('developer-integrity', true, 'oracle', 'Developer integrity audits'),
  ('developer-wallet-rescan', true, 'oracle', 'Rescans developer wallet families'),
  ('audit-creator-integrity', true, 'oracle', 'Audits creator integrity'),
  ('allstar-promotion-engine', true, 'oracle', 'Promotes high-performing devs to allstars'),
  ('co-mint-cluster-detector', true, 'oracle', 'Detects co-minting wallet clusters'),
  ('token-fingerprint-scanner', true, 'oracle', 'Token metadata fingerprint scanner'),
  ('token-autopsy', true, 'oracle', 'Post-mortem analysis of failed tokens'),
  ('backfill-genealogy-drip', true, 'oracle', 'Drip backfill of dev genealogy'),
  ('backfill-x-communities', true, 'oracle', 'Backfills X community memberships'),
  ('mesh-backfill', true, 'oracle', 'Reputation mesh backfill'),
  ('refresh-mesh-summary', true, 'oracle', 'Refreshes mesh summary materialized view'),
  -- Telegram
  ('telegram-channel-monitor', true, 'telegram', 'Monitors Telegram channels for CAs'),
  -- Trading
  ('trading-orchestrator', true, 'trading', 'Master orchestrator for trading + monitoring'),
  ('pumpfun-orchestrator', true, 'trading', 'Pump.fun orchestrator'),
  ('backcheck-stop-loss', true, 'trading', 'Stop-loss backchecker'),
  ('backcheck-rejected', true, 'trading', 'Rejected trade backchecker'),
  -- Email / lifecycle
  ('process-reactivation-emails', true, 'lifecycle', 'Sends reactivation emails'),
  ('prune-pending-reactivation-emails', true, 'lifecycle', 'Prunes stale reactivation queue'),
  ('prune-email-tracking-events', true, 'lifecycle', 'Prunes old email tracking events'),
  ('auto-suspend-unverified-7d', true, 'lifecycle', 'Auto-suspends unverified accounts after 7 days'),
  ('sol-renewal-reminder', true, 'lifecycle', 'SOL subscription renewal reminders'),
  -- Maintenance
  ('database-housekeeping', true, 'maintenance', 'General DB housekeeping'),
  ('prune-dex-scrape-log', true, 'maintenance', 'Prunes old DexScreener scrape logs'),
  ('system-health-audit', true, 'maintenance', 'System-wide health audit'),
  ('kol-registry-sync', true, 'maintenance', 'KOL registry sync'),
  ('daily-kol-leaderboard-refresh', true, 'maintenance', 'Daily KOL leaderboard refresh'),
  ('channel-pair-analyzer', true, 'maintenance', 'Telegram channel pair correlation analyzer')
ON CONFLICT (function_name) DO NOTHING;