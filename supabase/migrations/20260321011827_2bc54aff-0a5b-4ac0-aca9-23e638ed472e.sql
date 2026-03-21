UPDATE flip_positions 
SET status = 'sold', 
    error_message = 'Tokens no longer in wallet (0 on-chain balance confirmed via Helius RPC). Marked as sold.', 
    sell_executed_at = NOW() 
WHERE id = 'a4d64b91-1cdf-46aa-b1fa-833ddff94558' 
  AND status = 'holding';