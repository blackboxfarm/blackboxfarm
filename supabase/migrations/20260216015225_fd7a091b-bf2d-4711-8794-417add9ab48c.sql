UPDATE pumpfun_watchlist 
SET status = 'buy_now', 
    qualified_at = now(), 
    promoted_to_buy_now_at = now()
WHERE token_mint = '3VY6BrAwuoT5cNYRKXMFZrcaUCxhYW7X4rwF93Jipump' 
AND status = 'watching';