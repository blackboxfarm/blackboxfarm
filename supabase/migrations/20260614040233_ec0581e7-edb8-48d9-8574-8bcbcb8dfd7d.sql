DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'waterfall_wallets'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%row_index%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.waterfall_wallets DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.waterfall_wallets
  ADD CONSTRAINT waterfall_wallets_row_index_0_9_check
  CHECK (row_index BETWEEN 0 AND 9);