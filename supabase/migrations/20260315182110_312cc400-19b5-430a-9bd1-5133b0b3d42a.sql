-- Auto-refresh master_token_directory every 30 minutes
SELECT cron.schedule(
  'refresh_master_token_directory',
  '*/30 * * * *',
  'SELECT refresh_master_token_directory();'
);