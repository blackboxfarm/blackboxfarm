UPDATE holders_intel_templates
SET template_text = replace(template_text, 'HOLDER INTEL', 'HOLDERS INTEL'),
    updated_at = now()
WHERE template_text LIKE '%HOLDER INTEL%';
