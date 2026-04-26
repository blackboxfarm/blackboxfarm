UPDATE public.x_communities
SET scrape_status = NULL,
    last_scraped_at = NULL,
    failed_scrape_count = 0
WHERE community_id = '2034659284873781552';