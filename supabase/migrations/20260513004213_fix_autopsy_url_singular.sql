-- Fix incorrect plural /autopsies/ paths to canonical singular /autopsy/
UPDATE public.holders_intel_post_queue
SET tweet_text = replace(tweet_text, 'blackbox.farm/autopsies/', 'blackbox.farm/autopsy/')
WHERE tweet_text LIKE '%blackbox.farm/autopsies/%';

UPDATE public.holders_intel_post_queue
SET autopsy_url = replace(autopsy_url, '/autopsies/', '/autopsy/')
WHERE autopsy_url LIKE '%/autopsies/%';
