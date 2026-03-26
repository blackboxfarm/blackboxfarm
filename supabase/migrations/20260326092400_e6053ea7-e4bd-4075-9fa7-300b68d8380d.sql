UPDATE x_communities 
SET scrape_status = 'pending_retry',
    failed_scrape_count = 0,
    updated_at = now()
WHERE scrape_status IN ('no_admin_on_about_page', 'error_429')
  AND is_deleted = false;

UPDATE x_communities
SET scrape_status = 'pending_retry',
    updated_at = now()
WHERE scrape_status = 'pending'
  AND is_deleted = false
  AND last_scraped_at < now() - interval '1 hour';