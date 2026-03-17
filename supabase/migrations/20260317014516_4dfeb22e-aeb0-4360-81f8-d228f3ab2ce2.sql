-- Re-map all allstar_dev_registry tiers based on actual best_mcap_achieved values
-- Tier scale: T8 = Legend ($100M+), T7 = Elite ($10M+), T6 = Proven ($1M+), 
-- T5 = Rising ($500K+), T4 = Emerging ($300K+), T3 = Spotted ($100K+), 
-- T2 = Fresh ($50K+), T1 = Watch (<$50K or unknown)

UPDATE public.allstar_dev_registry
SET best_tier = CASE
  WHEN best_mcap_achieved >= 100000000 THEN 8  -- $100M+ = Legend
  WHEN best_mcap_achieved >= 10000000  THEN 7  -- $10M+  = Elite
  WHEN best_mcap_achieved >= 1000000   THEN 6  -- $1M+   = Proven
  WHEN best_mcap_achieved >= 500000    THEN 5  -- $500K+ = Rising
  WHEN best_mcap_achieved >= 300000    THEN 4  -- $300K+ = Emerging
  WHEN best_mcap_achieved >= 100000    THEN 3  -- $100K+ = Spotted
  WHEN best_mcap_achieved >= 50000     THEN 2  -- $50K+  = Fresh
  ELSE 1                                        -- <$50K  = Watch
END,
updated_at = now()
WHERE best_mcap_achieved IS NOT NULL;