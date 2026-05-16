
DELETE FROM public.holders_intel_post_queue
WHERE ctid IN (
  SELECT q.ctid FROM public.holders_intel_post_queue q
  WHERE q.manual_status IS DISTINCT FROM 'posted_manual'
    AND EXISTS (
      SELECT 1 FROM public.holders_intel_post_queue n
      WHERE n.manual_status IS DISTINCT FROM 'posted_manual'
        AND n.token_mint = q.token_mint
        AND (n.created_at, n.id) > (q.created_at, q.id)
    )
  LIMIT 15000
);
