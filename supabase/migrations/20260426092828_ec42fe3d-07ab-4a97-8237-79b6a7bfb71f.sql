-- =========================================================
-- 1. dev_handle_links — master many-to-many mesh
-- =========================================================
CREATE TABLE IF NOT EXISTS public.dev_handle_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  x_user_id      text NOT NULL,
  handle_at_link text,                          -- handle observed at link time (for history)
  relationship   text NOT NULL,                 -- community_admin | community_mod | token_official_x | pinned_community_admin | genealogy_funder | mesh_inferred
  confidence     integer NOT NULL DEFAULT 50,
  community_id   text,                          -- nullable; populated when link is community-derived
  token_mint     text,                          -- nullable; populated when link is token-derived
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_via text,
  discovered_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness across the meaningful tuple. NULLs are distinct in btree, so two rows with
-- (wallet, x_user_id, relationship, NULL community) collapse to one via COALESCE in the index.
CREATE UNIQUE INDEX IF NOT EXISTS dev_handle_links_unique
  ON public.dev_handle_links (
    wallet_address,
    x_user_id,
    relationship,
    COALESCE(community_id, ''),
    COALESCE(token_mint, '')
  );

CREATE INDEX IF NOT EXISTS dev_handle_links_wallet_idx       ON public.dev_handle_links (wallet_address);
CREATE INDEX IF NOT EXISTS dev_handle_links_xuser_idx        ON public.dev_handle_links (x_user_id);
CREATE INDEX IF NOT EXISTS dev_handle_links_community_idx    ON public.dev_handle_links (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dev_handle_links_token_idx        ON public.dev_handle_links (token_mint)   WHERE token_mint   IS NOT NULL;
CREATE INDEX IF NOT EXISTS dev_handle_links_relationship_idx ON public.dev_handle_links (relationship);

ALTER TABLE public.dev_handle_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_handle_links public read"
  ON public.dev_handle_links FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies → only service-role (edge functions) can mutate.

CREATE OR REPLACE FUNCTION public.dev_handle_links_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dev_handle_links_set_updated_at ON public.dev_handle_links;
CREATE TRIGGER dev_handle_links_set_updated_at
  BEFORE UPDATE ON public.dev_handle_links
  FOR EACH ROW EXECUTE FUNCTION public.dev_handle_links_touch_updated_at();

-- =========================================================
-- 2. x_communities — rename history + member sample
-- =========================================================
ALTER TABLE public.x_communities
  ADD COLUMN IF NOT EXISTS name_history   jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_renamed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_sample  jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- =========================================================
-- 3. v_dev_social_graph — single-row-per-wallet view
-- =========================================================
DROP VIEW IF EXISTS public.v_dev_social_graph;
CREATE VIEW public.v_dev_social_graph
WITH (security_invoker = on) AS
SELECT
  l.wallet_address,
  array_agg(DISTINCT r.current_handle)
    FILTER (WHERE r.current_handle IS NOT NULL)                                     AS current_handles,
  array_agg(DISTINCT (h.elem ->> 'handle'))
    FILTER (WHERE h.elem IS NOT NULL AND h.elem ? 'handle')                          AS historical_handles,
  array_agg(DISTINCT l.community_id)
    FILTER (WHERE l.community_id IS NOT NULL)                                        AS communities,
  array_agg(DISTINCT l.token_mint)
    FILTER (WHERE l.token_mint   IS NOT NULL)                                        AS tokens,
  array_agg(DISTINCT l.relationship)                                                 AS relationships,
  count(*)                                                                            AS link_count,
  max(l.updated_at)                                                                   AS last_link_at
FROM public.dev_handle_links l
LEFT JOIN public.x_account_registry r ON r.x_user_id = l.x_user_id
LEFT JOIN LATERAL jsonb_array_elements(COALESCE(r.handle_history, '[]'::jsonb)) AS h(elem) ON true
GROUP BY l.wallet_address;

GRANT SELECT ON public.v_dev_social_graph TO anon, authenticated;