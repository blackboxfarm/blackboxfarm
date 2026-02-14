
-- Reset tokens rejected ONLY for rugcheck_score or ticker_too_long back to 'watching'
UPDATE pumpfun_watchlist 
SET status = 'watching',
    rejection_reason = NULL,
    rejection_reasons = NULL,
    rejection_type = NULL,
    removed_at = NULL
WHERE status = 'rejected' 
AND (
  (rejection_reason LIKE 'rugcheck_score:%' AND rejection_reason NOT LIKE '%,%')
  OR rejection_reason = 'rugcheck_buy_gate:low_score'
  OR (rejection_reason LIKE 'ticker_too_long:%' AND rejection_reason NOT LIKE '%,%')
);

-- For mixed-reason rejects that include rugcheck_score, strip that reason text
-- and keep the remaining valid rejection reasons
UPDATE pumpfun_watchlist 
SET rejection_reason = trim(both ', ' from regexp_replace(rejection_reason, 'rugcheck_score:[^,]+,?\s*', '', 'g'))
WHERE status = 'rejected' 
AND rejection_reason LIKE '%rugcheck_score:%'
AND rejection_reason LIKE '%,%';
