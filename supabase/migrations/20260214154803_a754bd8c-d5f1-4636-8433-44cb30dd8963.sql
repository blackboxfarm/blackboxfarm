-- Recalculate all CLOSED positions as if 100% was sold at the main sell price (no moonbag)
-- The "correct" P&L = (main_sold_price_usd / entry_price_usd - 1) * entry_amount_sol
-- i.e. total_realized_pnl_sol = (main_sold_price / entry_price - 1) * entry_amount_sol

UPDATE pumpfun_fantasy_positions
SET 
  -- Recalculate as if we sold 100% at the main_sold_price_usd
  total_realized_pnl_sol = CASE 
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL 
    THEN ((main_sold_price_usd / entry_price_usd) - 1) * entry_amount_sol
    ELSE total_realized_pnl_sol
  END,
  total_pnl_percent = CASE
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL
    THEN ((main_sold_price_usd / entry_price_usd) - 1) * 100
    ELSE total_pnl_percent
  END,
  -- Update main_sold_amount to reflect full sell
  main_sold_amount_sol = CASE
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL
    THEN (main_sold_price_usd / entry_price_usd) * entry_amount_sol
    ELSE main_sold_amount_sol
  END,
  main_realized_pnl_sol = CASE
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL
    THEN ((main_sold_price_usd / entry_price_usd) - 1) * entry_amount_sol
    ELSE main_realized_pnl_sol
  END,
  -- Clear moonbag fields
  moonbag_active = false,
  moonbag_token_amount = 0,
  moonbag_entry_value_sol = 0,
  moonbag_current_value_sol = 0,
  moonbag_drawdown_pct = 0,
  sell_percentage = 100,
  moonbag_percentage = 0,
  updated_at = now()
WHERE status = 'closed';

-- Also close any current moonbag positions as full sells at their main_sold_price
UPDATE pumpfun_fantasy_positions
SET 
  status = 'closed',
  total_realized_pnl_sol = CASE 
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL 
    THEN ((main_sold_price_usd / entry_price_usd) - 1) * entry_amount_sol
    ELSE total_realized_pnl_sol
  END,
  total_pnl_percent = CASE
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL
    THEN ((main_sold_price_usd / entry_price_usd) - 1) * 100
    ELSE total_pnl_percent
  END,
  main_sold_amount_sol = CASE
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL
    THEN (main_sold_price_usd / entry_price_usd) * entry_amount_sol
    ELSE main_sold_amount_sol
  END,
  main_realized_pnl_sol = CASE
    WHEN entry_price_usd > 0 AND main_sold_price_usd IS NOT NULL
    THEN ((main_sold_price_usd / entry_price_usd) - 1) * entry_amount_sol
    ELSE main_realized_pnl_sol
  END,
  exit_at = now(),
  exit_reason = 'moonbag_disabled',
  moonbag_active = false,
  moonbag_token_amount = 0,
  moonbag_entry_value_sol = 0,
  moonbag_current_value_sol = 0,
  moonbag_drawdown_pct = 0,
  sell_percentage = 100,
  moonbag_percentage = 0,
  updated_at = now()
WHERE status = 'moonbag';
