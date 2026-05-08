-- Reclassify mint addresses (pump.fun / letsbonk) tagged as 'wallet' to 'token'.
-- Step 1: Delete rows that would collide with an existing (source,linked,relationship) after retyping.
DELETE FROM public.reputation_mesh r
WHERE r.source_type = 'wallet'
  AND (r.source_id LIKE '%pump' OR r.source_id LIKE '%bonk')
  AND EXISTS (
    SELECT 1 FROM public.reputation_mesh r2
    WHERE r2.source_type = 'token'
      AND r2.source_id = r.source_id
      AND r2.linked_type = r.linked_type
      AND r2.linked_id = r.linked_id
      AND r2.relationship = r.relationship
  );

DELETE FROM public.reputation_mesh r
WHERE r.linked_type = 'wallet'
  AND (r.linked_id LIKE '%pump' OR r.linked_id LIKE '%bonk')
  AND EXISTS (
    SELECT 1 FROM public.reputation_mesh r2
    WHERE r2.linked_type = 'token'
      AND r2.linked_id = r.linked_id
      AND r2.source_type = r.source_type
      AND r2.source_id = r.source_id
      AND r2.relationship = r.relationship
  );

-- Step 2: Retype remaining offending rows.
UPDATE public.reputation_mesh
SET source_type = 'token'
WHERE source_type = 'wallet'
  AND (source_id LIKE '%pump' OR source_id LIKE '%bonk');

UPDATE public.reputation_mesh
SET linked_type = 'token'
WHERE linked_type = 'wallet'
  AND (linked_id LIKE '%pump' OR linked_id LIKE '%bonk');