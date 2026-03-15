-- Reset failed communities so the cron job retries them now that Apify budget is increased
UPDATE x_communities 
SET failed_scrape_count = 0, 
    scrape_status = 'pending_retry',
    last_scraped_at = NULL
WHERE failed_scrape_count > 0 
  AND is_deleted = false
  AND scrape_status IN ('error_403', 'error_400');