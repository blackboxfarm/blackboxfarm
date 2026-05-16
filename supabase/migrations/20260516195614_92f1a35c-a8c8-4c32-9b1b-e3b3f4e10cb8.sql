
DELETE FROM public.holders_intel_post_queue
WHERE ctid IN (
  SELECT q.ctid FROM public.holders_intel_post_queue q
  WHERE q.manual_status IS DISTINCT FROM 'posted_manual'
    AND EXISTS (SELECT 1 FROM public.holders_intel_post_queue a
                WHERE a.manual_status='posted_manual' AND a.token_mint=q.token_mint)
  LIMIT 80000
);
