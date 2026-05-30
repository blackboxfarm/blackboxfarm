ALTER TABLE public.holders_intel_templates DROP CONSTRAINT holders_intel_templates_template_name_check;

ALTER TABLE public.holders_intel_templates ADD CONSTRAINT holders_intel_templates_template_name_check
  CHECK (template_name = ANY (ARRAY[
    'small','large','shares','tg_posted','tg_search','subscription','tg_public_post',
    'x_advert_1','x_advert_2','x_advert_3','x_advert_4',
    'tg_advert_1','tg_advert_2','tg_advert_3',
    'no_lube','no_lube_public','no_lube_private',
    'no_lube_snapshot_private','no_lube_leaks_public',
    'no_lube_intel_update_private'
  ]));

INSERT INTO public.holders_intel_templates (template_name, template_text, is_active)
VALUES (
  'no_lube_intel_update_private',
  E'🛰 *INTEL UPDATE* — {ticker}\nEntry {mcEntry} → Now {mcNow} ({ratio}x)\nHealth: {health}\nTop holders: {topHolders}\nLP: {lpStatus}\n`{ca}`',
  true
)
ON CONFLICT (template_name) DO NOTHING;