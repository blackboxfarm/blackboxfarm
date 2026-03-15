UPDATE x_communities 
SET last_scraped_at = NULL, scrape_status = 'pending_rescrape'
WHERE last_scraped_at > '2026-03-15 00:00:00' 
AND (admin_usernames IS NULL OR array_length(admin_usernames, 1) IS NULL OR array_length(admin_usernames, 1) = 0)
AND scrape_status = 'complete';