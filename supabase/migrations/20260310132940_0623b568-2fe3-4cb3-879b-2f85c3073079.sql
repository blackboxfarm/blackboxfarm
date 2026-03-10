UPDATE flip_positions 
SET status = 'sold', 
    error_message = 'Auto-corrected: tokens no longer on-chain (other 3 positions exactly match on-chain balance)',
    sell_executed_at = NOW()
WHERE id = '6b8096d5-f2a8-4b0c-b315-f8e32dc28608' AND status = 'holding'