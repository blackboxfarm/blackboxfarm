UPDATE holders_intel_post_queue q
SET autopsy_hero_image = r.hero_image_path
FROM autopsy_reports r
WHERE q.autopsy_slug = r.slug
  AND q.autopsy_slug IS NOT NULL
  AND q.autopsy_hero_image IS NULL
  AND r.hero_image_path IS NOT NULL;