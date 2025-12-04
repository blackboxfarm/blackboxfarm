-- Create atomic increment function for offspring count
CREATE OR REPLACE FUNCTION public.increment_offspring_count(whale_id uuid, amount int DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE mega_whales 
  SET total_offspring_wallets = COALESCE(total_offspring_wallets, 0) + amount
  WHERE id = whale_id;
END;
$$;

-- Sync all existing counts to fix any mismatches
UPDATE mega_whales 
SET total_offspring_wallets = (
  SELECT COUNT(*) FROM mega_whale_offspring WHERE mega_whale_id = mega_whales.id
);