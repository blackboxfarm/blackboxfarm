-- Cleanup: remove GitHub junk (site chrome / nav / footer) from reputation_mesh
-- These are GitHub UI paths that were incorrectly harvested as developer accounts.

DELETE FROM public.reputation_mesh
WHERE source_type = 'github'
  AND (
    -- Reserved single-segment GitHub site paths
    source_id IN (
      'fluidicon','pricing','features','marketplace','team','enterprise','solutions',
      'resources','sponsors','customer-stories','mcp','accelerator','trust-center',
      'trending','topics','collections','security','partners','premium-support',
      'why-github','search','login','signup','about','contact','site-map','readme',
      'codespaces','copilot','actions','issues','discussions','sponsors','explore',
      'notifications','settings','new','organizations','marketplace','events','jobs',
      'developers','apps','integrations','open-source','enterprise-trial'
    )
    -- Multi-segment GitHub UI/site paths (everything under known site sections)
    OR source_id LIKE 'features/%'
    OR source_id LIKE 'solutions/%'
    OR source_id LIKE 'resources/%'
    OR source_id LIKE 'enterprise/%'
    OR source_id LIKE 'security/%'
    OR source_id LIKE 'site-policy/%'
    OR source_id LIKE 'articles/%'
    OR source_id LIKE 'organizations/%'
    OR source_id LIKE 'developers/%'
    OR source_id LIKE 'apps/%'
    OR source_id LIKE 'orgs/%'
    OR source_id LIKE 'search-github/%'
    OR source_id LIKE 'about/%'
    OR source_id LIKE 'pricing/%'
    OR source_id LIKE 'marketplace/%'
    OR source_id LIKE 'topics/%'
    OR source_id LIKE 'collections/%'
    OR source_id LIKE 'trending/%'
    OR source_id LIKE 'events/%'
    OR source_id LIKE 'sponsors/%'
    OR source_id LIKE 'readme/%'
    OR source_id LIKE 'customer-stories/%'
    OR source_id LIKE 'partners/%'
    -- Anything starting with a leading dot, slash, hash, or query
    OR source_id LIKE '/%'
    OR source_id LIKE '#%'
    OR source_id LIKE '?%'
  );

-- Validation trigger: prevent these junk handles from ever being inserted again.
CREATE OR REPLACE FUNCTION public.validate_reputation_mesh_github()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reserved TEXT[] := ARRAY[
    'fluidicon','pricing','features','marketplace','team','enterprise','solutions',
    'resources','sponsors','customer-stories','mcp','accelerator','trust-center',
    'trending','topics','collections','security','partners','premium-support',
    'why-github','search','login','signup','about','contact','site-map','readme',
    'codespaces','copilot','actions','issues','discussions','explore',
    'notifications','settings','new','organizations','events','jobs',
    'developers','apps','integrations','open-source','enterprise-trial',
    'orgs','site-policy','articles'
  ];
  first_segment TEXT;
BEGIN
  IF NEW.source_type = 'github' THEN
    -- Reject empty / null
    IF NEW.source_id IS NULL OR length(trim(NEW.source_id)) = 0 THEN
      RAISE EXCEPTION 'Invalid github source_id: empty';
    END IF;

    -- Extract first path segment
    first_segment := split_part(NEW.source_id, '/', 1);

    -- Reject reserved GitHub site paths
    IF first_segment = ANY(reserved) THEN
      RAISE EXCEPTION 'Invalid github source_id: reserved site path "%"', NEW.source_id;
    END IF;

    -- Must be valid GitHub username chars (alnum, dash, underscore), 1-39 chars
    IF first_segment !~ '^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$' THEN
      RAISE EXCEPTION 'Invalid github source_id: bad username format "%"', NEW.source_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_reputation_mesh_github_trigger ON public.reputation_mesh;
CREATE TRIGGER validate_reputation_mesh_github_trigger
  BEFORE INSERT OR UPDATE ON public.reputation_mesh
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_reputation_mesh_github();