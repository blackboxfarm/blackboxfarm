UPDATE public.no_lube_card_templates
SET safe_zones = safe_zones - 'ca',
    show_ca = false,
    updated_at = now()
WHERE safe_zones ? 'ca' OR show_ca = true;