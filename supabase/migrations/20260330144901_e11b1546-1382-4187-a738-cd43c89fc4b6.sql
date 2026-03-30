-- Remove duplicate testimonials, keeping the earliest one per twitter_handle
DELETE FROM public.testimonials
WHERE id NOT IN (
  SELECT DISTINCT ON (twitter_handle) id
  FROM public.testimonials
  ORDER BY twitter_handle, submitted_at ASC
)
AND twitter_handle IN (
  SELECT twitter_handle FROM public.testimonials GROUP BY twitter_handle HAVING count(*) > 1
);
