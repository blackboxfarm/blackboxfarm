UPDATE public.no_lube_card_templates
SET safe_zones = jsonb_build_object(
  'ticker', jsonb_build_object(
    'x', 130, 'y', 150, 'w', 820, 'h', 80,
    'plaque', jsonb_build_object('shape','pill','fill','#000000','opacity',0.55,'pad_x',24,'pad_y',10,'radius',999,'text_color','#22d3ee')
  ),
  'ca', jsonb_build_object(
    'x', 130, 'y', 240, 'w', 820, 'h', 48,
    'plaque', jsonb_build_object('shape','pill','fill','#000000','opacity',0.6,'pad_x',20,'pad_y',8,'radius',999,'text_color','#ffffff')
  ),
  'character', jsonb_build_object('x',680,'y',60,'w',340,'h',560),
  'mint_pfp', jsonb_build_object('x',60,'y',140,'w',140,'h',140,'shape','circle'),
  'multiplier', jsonb_build_object('x',60,'y',320,'w',200,'h',110),
  'entry_label', jsonb_build_object(
    'x',60,'y',480,'w',180,'h',32,
    'plaque', jsonb_build_object('shape','pill','fill','#000000','opacity',0.5,'pad_x',12,'pad_y',6,'radius',999,'text_color','#94a3b8')
  ),
  'entry_value', jsonb_build_object(
    'x',60,'y',520,'w',180,'h',90,
    'plaque', jsonb_build_object('shape','rect','fill','#000000','opacity',0.55,'pad_x',12,'pad_y',8,'radius',12,'border_color','#ffffff','border_width',2,'text_color','#ffffff')
  ),
  'current_label', jsonb_build_object(
    'x',260,'y',480,'w',180,'h',32,
    'plaque', jsonb_build_object('shape','pill','fill','#000000','opacity',0.5,'pad_x',12,'pad_y',6,'radius',999,'text_color','#94a3b8')
  ),
  'current_value', jsonb_build_object(
    'x',260,'y',520,'w',180,'h',90,
    'plaque', jsonb_build_object('shape','rect','fill','#000000','opacity',0.55,'pad_x',12,'pad_y',8,'radius',12,'border_color','#4ade80','border_width',2,'text_color','#4ade80')
  ),
  'show_url', jsonb_build_object(
    'x',30,'y',600,'w',964,'h',32,
    'plaque', jsonb_build_object('shape','pill','fill','#000000','opacity',0.5,'pad_x',16,'pad_y',6,'radius',999,'text_color','#cbd5e1')
  )
),
updated_at = now()
WHERE template_name IN ('luna_dusk_default','luna_dusk_Private');