-- Replace any legacy ?v=holders5 (or other variants) holders deeplink with
-- the canonical ?token={ca} form so first-compose shipping URLs are correct
-- without waiting for a banner re-fetch to rewrite them.
UPDATE public.holders_intel_templates
SET template_text = regexp_replace(
  template_text,
  'https?://blackbox\.farm/holders(\?[^[:space:])]*)?',
  'https://blackbox.farm/holders?token={ca}',
  'gi'
)
WHERE template_text ~* 'blackbox\.farm/holders';
