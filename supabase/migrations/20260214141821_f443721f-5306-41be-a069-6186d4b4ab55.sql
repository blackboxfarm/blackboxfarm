-- Delete ALL mayhem tokens and everything older than 5 minutes
DELETE FROM pumpfun_watchlist 
WHERE rejection_reason = 'mayhem_mode' 
   OR 'mayhem_mode' = ANY(rejection_reasons::text[])
   OR created_at < now() - interval '5 minutes';