UPDATE public.no_lube_card_templates
SET safe_zones = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(safe_zones, '{}'::jsonb),
          '{mint_pfp}',
          '{"x":40,"y":50,"w":110,"h":110,"shape":"circle"}'::jsonb,
          true
        ),
        '{ticker}',
        '{"x":160,"y":55,"w":500,"h":56,"align":"left","plaque":{"shape":"rect","radius":10,"fill":"#000000","opacity":0.6,"pad_x":18,"pad_y":8,"text_color":"#22d3ee"}}'::jsonb,
        true
      ),
      '{ca}',
      '{"x":160,"y":118,"w":500,"h":40,"align":"left","plaque":{"shape":"rect","radius":8,"fill":"#000000","opacity":0.55,"pad_x":14,"pad_y":6,"text_color":"#ffffff"}}'::jsonb,
      true
    ),
    updated_at = now()
WHERE template_name IN ('luna_dusk_default', 'luna_dusk_Private');