UPDATE public.no_lube_card_templates
SET safe_zones = jsonb_set(
      safe_zones,
      '{mint_pfp}',
      jsonb_build_object('x', 70, 'y', 80, 'w', 220, 'h', 220, 'shape', 'circle'),
      true
    ),
    updated_at = now()
WHERE safe_zones ? 'mint_pfp';