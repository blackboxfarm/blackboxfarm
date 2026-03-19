-- Refresh the materialized view to pick up all new tokens
REFRESH MATERIALIZED VIEW CONCURRENTLY master_token_directory;

-- Schedule automatic refresh every 2 hours so it stays current
SELECT cron.schedule(
  'refresh-master-token-directory',
  '30 */2 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY master_token_directory;'
);