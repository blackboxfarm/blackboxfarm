-- Add position column for drag ordering (if not exists)
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'twitter_accounts' AND column_name = 'position') THEN
    ALTER TABLE public.twitter_accounts ADD COLUMN position INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add unique constraint on username for upsert
ALTER TABLE public.twitter_accounts ADD CONSTRAINT twitter_accounts_username_unique UNIQUE (username);