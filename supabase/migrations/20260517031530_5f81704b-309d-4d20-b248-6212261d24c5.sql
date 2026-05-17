UPDATE public.wallet_family_poll_queue q
SET priority = 'P1',
    poll_interval_sec = 300,
    next_poll_at = LEAST(q.next_poll_at, now())
FROM public.wallet_family_members m
JOIN public.wallet_families wf ON wf.id = m.family_id
JOIN public.allstar_dev_registry a ON a.id = wf.allstar_id
WHERE q.wallet_address = m.wallet_address
  AND a.best_tier >= 5
  AND (q.priority IS DISTINCT FROM 'P1' OR q.poll_interval_sec > 300);

UPDATE public.wallet_family_poll_queue q
SET priority = 'P1',
    poll_interval_sec = 300,
    next_poll_at = LEAST(q.next_poll_at, now())
FROM public.allstar_dev_registry a
WHERE q.wallet_address = a.master_wallet
  AND a.best_tier >= 5
  AND (q.priority IS DISTINCT FROM 'P1' OR q.poll_interval_sec > 300);