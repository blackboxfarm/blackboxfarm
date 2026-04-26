-- Step 0a: Dedup within legacy set
DELETE FROM public.reputation_mesh
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY source_type, source_id, linked_type, linked_id
      ORDER BY discovered_at DESC NULLS LAST, id
    ) AS rn
    FROM public.reputation_mesh
    WHERE source_type='token' AND linked_type='website'
      AND relationship IN ('official_website','website')
  ) sub
  WHERE rn > 1
);

-- Step 0b: Delete legacy that would collide with existing has_website
DELETE FROM public.reputation_mesh rm
WHERE rm.source_type='token' AND rm.linked_type='website'
  AND rm.relationship IN ('official_website','website')
  AND EXISTS (
    SELECT 1 FROM public.reputation_mesh rm2
    WHERE rm2.source_type='token' AND rm2.linked_type='website'
      AND rm2.source_id=rm.source_id AND rm2.linked_id=rm.linked_id
      AND rm2.relationship='has_website'
  );

UPDATE public.reputation_mesh
SET relationship='has_website',
    evidence = COALESCE(evidence,'{}'::jsonb) || jsonb_build_object('legacy_relationship', relationship)
WHERE source_type='token' AND linked_type='website'
  AND relationship IN ('official_website','website');

-- Step 1: Flip website→wallet
CREATE TEMP TABLE _mesh_flip_a AS
SELECT DISTINCT ON (linked_id, source_id)
  linked_id AS new_source_id, source_id AS new_linked_id,
  confidence, evidence, discovered_via, discovered_at
FROM public.reputation_mesh
WHERE relationship='website_of' AND source_type='website' AND linked_type='wallet'
ORDER BY linked_id, source_id, confidence DESC NULLS LAST;

DELETE FROM public.reputation_mesh
WHERE relationship='website_of' AND source_type='website' AND linked_type='wallet';

INSERT INTO public.reputation_mesh (
  source_type, source_id, linked_type, linked_id, relationship,
  confidence, evidence, discovered_via, discovered_at
)
SELECT 'wallet', new_source_id, 'website', new_linked_id, 'has_website',
  confidence,
  COALESCE(evidence,'{}'::jsonb) || jsonb_build_object('flipped_from','website_of'),
  discovered_via, discovered_at
FROM _mesh_flip_a f
WHERE NOT EXISTS (
  SELECT 1 FROM public.reputation_mesh rm
  WHERE rm.source_type='wallet' AND rm.source_id=f.new_source_id
    AND rm.linked_type='website' AND rm.linked_id=f.new_linked_id
    AND rm.relationship='has_website'
);
DROP TABLE _mesh_flip_a;

-- Step 2: Flip website→token
CREATE TEMP TABLE _mesh_flip_b AS
SELECT DISTINCT ON (linked_id, source_id)
  linked_id AS new_source_id, source_id AS new_linked_id,
  confidence, evidence, discovered_via, discovered_at
FROM public.reputation_mesh
WHERE relationship='website_of_token' AND source_type='website' AND linked_type='token'
ORDER BY linked_id, source_id, confidence DESC NULLS LAST;

DELETE FROM public.reputation_mesh
WHERE relationship='website_of_token' AND source_type='website' AND linked_type='token';

INSERT INTO public.reputation_mesh (
  source_type, source_id, linked_type, linked_id, relationship,
  confidence, evidence, discovered_via, discovered_at
)
SELECT 'token', new_source_id, 'website', new_linked_id, 'has_website',
  confidence,
  COALESCE(evidence,'{}'::jsonb) || jsonb_build_object('flipped_from','website_of_token'),
  discovered_via, discovered_at
FROM _mesh_flip_b f
WHERE NOT EXISTS (
  SELECT 1 FROM public.reputation_mesh rm
  WHERE rm.source_type='token' AND rm.source_id=f.new_source_id
    AND rm.linked_type='website' AND rm.linked_id=f.new_linked_id
    AND rm.relationship='has_website'
);
DROP TABLE _mesh_flip_b;

-- Step 3: Remove orphan wallet-as-token edges
WITH bad_edges AS (
  SELECT rm.id
  FROM public.reputation_mesh rm
  JOIN public.dev_wallet_reputation dwr ON dwr.wallet_address = rm.linked_id
  WHERE rm.linked_type='token'
    AND NOT EXISTS (SELECT 1 FROM public.token_metadata tm WHERE tm.mint_address = rm.linked_id)
)
DELETE FROM public.reputation_mesh WHERE id IN (SELECT id FROM bad_edges);