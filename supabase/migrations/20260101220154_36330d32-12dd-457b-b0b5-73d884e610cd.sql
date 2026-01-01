-- Mark the incorrectly added old token as dead
UPDATE pumpfun_watchlist 
SET status = 'dead', 
    removal_reason = 'Token too old - 6+ months, should not have been added',
    removed_at = NOW()
WHERE token_mint = 'FhNReAp2WrW5ty94jpX6xP95vMEo4Dp8Q98LTNohrno4';