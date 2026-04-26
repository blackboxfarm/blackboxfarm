UPDATE public.x_communities
SET last_scraped_at = NULL,
    scrape_status = 'pending',
    failed_scrape_count = 0
WHERE community_id = '2034659284873781552';