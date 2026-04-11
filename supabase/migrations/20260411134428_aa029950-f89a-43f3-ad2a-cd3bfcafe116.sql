
-- Add priority_tier column to edge_function_registry
ALTER TABLE public.edge_function_registry 
ADD COLUMN priority_tier text NOT NULL DEFAULT 'legacy';

-- Set PRIMARY functions: everything that feeds HoldersIntel pipeline
UPDATE public.edge_function_registry SET priority_tier = 'primary' WHERE function_name IN (
  -- Intel core
  'holders-intel-dex-scanner', 'holders-intel-poster', 'holders-intel-scheduler', 
  'holdersintel-bot-webhook', 'holdersintel-orchestrator', 'intel-xbot-kill', 'intel-xbot-start',
  'search-surge-scanner',
  -- Oracle / reputation
  'oracle-unified-lookup', 'oracle-auto-classifier', 'oracle-historical-backfill', 
  'oracle-master-spider', 'oracle-x-reverse-lookup',
  -- Developer reputation
  'developer-discovery-job', 'developer-enrichment', 'developer-reputation', 
  'developer-reputation-calculator', 'developer-token-scanner', 'developer-wallet-rescan', 
  'developer-wallet-tracer', 'calculate-developer-integrity', 'audit-creator-integrity',
  -- Wallet tracing / mesh
  'family-discovery-engine', 'family-graph-api', 'family-mint-monitor',
  'mesh-kyc-deep-search', 'mesh-spider-processor', 'mesh-wallet-token-discovery',
  'wallet-genealogy-scanner', 'wallet-investigator', 'wallet-behavior-analysis',
  'wallet-bundle-analyzer', 'wallet-monitor', 'wallet-sns-lookup',
  -- Holder analysis
  'bagless-holders-report', 'bagless-investigation', 'capture-holder-snapshot',
  'holder-retention-analysis', 'track-holder-movements',
  -- Token analysis
  'token-vigil', 'token-metadata', 'token-metadata-batch', 'token-creator-linker',
  'token-flow-tracer', 'token-ai-interpreter', 'token-momentum-analyzer',
  'token-performance-analyzer', 'token-mint-watchdog-monitor', 'token-account-cleaner',
  -- Social discovery
  'social-link-mint-checker', 'social-mesh-linker', 'social-larp-detector', 'social-predictor-ai',
  'twitter-token-mention-scanner', 'twitter-profile-enricher',
  'x-community-enricher', 'x-community-follow', 'x-community-health-check',
  'harvest-token-socials', 'enrich-token-communities', 'dailies-backfill-socials',
  -- Data ingestion feeding HI
  'dex-top-200', 'dexscreener-top-200-scraper', 'dex-paid-checker', 'dexscreener-trending-banners',
  'helius-fast-price', 'helius-rpc-proxy', 'helius-webhook-manager', 'helius-whale-webhook',
  'sol-price', 'solscan-creator-lookup', 'coin-scanner', 'enrich-scraped-tokens',
  'build-token-composite', 'ath-24h-backfill',
  -- Allstar system
  'allstar-mint-auditor', 'allstar-promotion-engine',
  -- Risk/rug detection
  'alert-high-risk-token', 'rug-event-processor', 'rug-investigator', 'rugcheck-backfill',
  'blacklist-enricher', 'breadcrumbs-scanner', 'whale-frenzy-detector', 'whale-transaction-dump',
  -- Backfill (HI-related)
  'backfill-developer-profiles', 'backfill-genealogy', 'backfill-rejection-mesh',
  'backfill-token-timestamps', 'backfill-wallet-transactions',
  -- Telegram bot (HI delivery)
  'telegram-bot-webhook', 'telegram-bot-health', 'telegram-channel-monitor',
  'telegram-mtproto-auth', 'telegram-session-generator',
  -- Social posting (HI delivery)
  'post-share-card-twitter', 'promo-poster', 'phanes-x-query', 'twitter-scanner-control',
  -- HI admin/infra
  'admin-add-seen-token', 'admin-notify', 'add-monitored-wallet',
  'database-cleanup', 'database-housekeeping', 'morning-report',
  'system-health-audit', 'service-status', 'reconcile-cron-jobs', 'retry-dead-letters',
  -- Auth (shared but essential)
  'check-2fa-requirement', 'check-subscription', 'enable-2fa', 'security-logger',
  'session-manager', 'setup-totp', 'signup-notify', 'verify-2fa-login', 'verify-phone', 'verify-x-code',
  -- Billing (shared but essential)
  'create-checkout', 'customer-portal', 'stripe-webhook', 'check-banner-payment',
  -- Notifications (shared but essential)
  'send-auth-email', 'send-email-notification', 'send-notification', 'send-verification',
  'subscriber-welcome', 'send-contact-email', 'send-ai-analysis-email',
  'send-campaign-notification', 'send-ticket-reply',
  -- Ads (HI revenue)
  'banner-fund-sweep', 'banner-order-processor', 'banner-refund',
  'generate-paid-composite', 'paid-og', 'manage-banner-ad', 'get-banner-for-position', 'backfill-banner-urls',
  -- OG images
  'holders-og', 'holders-og-image',
  -- HI misc
  'liquidity-lock-checker', 'funnel-feed-scanner', 'kol-registry-sync',
  'mint-monitor-scanner', 'offspring-mint-scanner', 'scan-offspring-wallets',
  'trigger-watchdog-discovery', 'import-whale-csv', 'claim-preview-data',
  'resolve-token-addresses', 'get-all-users', 'get-advertiser-users',
  'ai-pattern-extractor', 'ai-token-pattern-matcher', 'agentic-browser',
  'bulk-community-enricher'
);
