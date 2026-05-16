
-- Add @HoldersIntel and @Dead_Tokens alongside @blackbox_farm in all active HoldersIntel templates
UPDATE public.holders_intel_templates
SET template_text = regexp_replace(template_text, '@blackbox_farm(\s*)$', '@blackbox_farm @HoldersIntel @Dead_Tokens\1'),
    updated_at = now()
WHERE template_text ~ '@blackbox_farm\s*$'
  AND template_text !~ '@HoldersIntel';

-- Retro-tag existing archived posts (only stored tweet_text rows that end with lone @blackbox_farm)
UPDATE public.holders_intel_post_queue
SET tweet_text = regexp_replace(tweet_text, '@blackbox_farm(\s*)$', '@blackbox_farm @HoldersIntel @Dead_Tokens\1'),
    hashtags_line = CASE
      WHEN hashtags_line IS NOT NULL AND hashtags_line !~ '@HoldersIntel'
        THEN hashtags_line
      ELSE hashtags_line
    END
WHERE tweet_text IS NOT NULL
  AND tweet_text ~ '@blackbox_farm\s*$'
  AND tweet_text !~ '@HoldersIntel';
