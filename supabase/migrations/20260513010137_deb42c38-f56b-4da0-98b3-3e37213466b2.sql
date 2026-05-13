UPDATE holders_intel_templates
SET template_text = regexp_replace(template_text, E'#HoldersIntel(\\s*)$', E'#HoldersIntel\n@blackbox_farm'),
    updated_at = now()
WHERE template_text LIKE '%#HoldersIntel%'
  AND template_text NOT LIKE '%@blackbox_farm%';