-- Wipe pending Manual X Posting Queue and update templates to use plural HOLDERS INTEL
DELETE FROM public.holders_intel_post_queue WHERE manual_status = 'pending';

UPDATE public.holders_intel_templates
SET template_text = REPLACE(template_text, 'HOLDER INTEL', 'HOLDERS INTEL'),
    updated_at = now()
WHERE template_text LIKE '%HOLDER INTEL%';