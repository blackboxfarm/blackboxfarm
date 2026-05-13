-- Append @blackbox_farm handle after #HoldersIntel hashtag in active 'large' template
UPDATE public.holders_intel_templates
SET template_text = regexp_replace(
  template_text,
  '(#HoldersIntel)(\s*)$',
  E'\\1\n@blackbox_farm',
  'n'
)
WHERE template_name = 'large'
  AND is_active = true
  AND template_text LIKE '%#HoldersIntel%'
  AND template_text NOT LIKE '%@blackbox_farm%';
