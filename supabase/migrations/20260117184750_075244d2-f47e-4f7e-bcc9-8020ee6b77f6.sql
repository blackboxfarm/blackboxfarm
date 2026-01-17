-- Delete Telegram fantasy positions older than 1 day (open positions only)
DELETE FROM public.telegram_fantasy_positions
WHERE status = 'open'
  AND created_at < now() - interval '1 day';