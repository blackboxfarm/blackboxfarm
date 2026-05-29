UPDATE public.no_lube_card_templates
SET safe_zones = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        safe_zones,
        '{mint_pfp,y}', '180'::jsonb
      ),
      '{ticker,x}', '285'::jsonb
    ),
    '{ticker,y}', '155'::jsonb
  ),
  '{multiplier,x}', '290'::jsonb
),
updated_at = now()
WHERE safe_zones ? 'mint_pfp';

UPDATE public.no_lube_card_templates
SET safe_zones = jsonb_set(
  jsonb_set(safe_zones, '{character,y}', '210'::jsonb),
  '{character,h}', '410'::jsonb
),
updated_at = now()
WHERE safe_zones ? 'character';