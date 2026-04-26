-- Drop the expression index — PostgREST cannot target it via onConflict
DROP INDEX IF EXISTS public.dev_handle_links_unique;

-- Generated key column collapses NULL community/token to '' for stable uniqueness
ALTER TABLE public.dev_handle_links
  ADD COLUMN IF NOT EXISTS link_key text GENERATED ALWAYS AS (
    wallet_address || '|' || x_user_id || '|' || relationship
      || '|' || COALESCE(community_id, '')
      || '|' || COALESCE(token_mint, '')
  ) STORED;

ALTER TABLE public.dev_handle_links
  ADD CONSTRAINT dev_handle_links_link_key_unique UNIQUE (link_key);