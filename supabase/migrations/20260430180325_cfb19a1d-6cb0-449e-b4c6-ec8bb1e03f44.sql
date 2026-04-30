UPDATE public.autopsy_candidates
SET status = 'pending', status_reason = NULL
WHERE source_feed = 'live_death_watch' AND status = 'failed';