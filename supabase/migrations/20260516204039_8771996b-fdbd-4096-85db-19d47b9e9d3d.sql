
-- Drop pending rows whose mint is already archived (would violate unique index)
DELETE FROM public.holders_intel_post_queue p
WHERE p.manual_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.holders_intel_post_queue a
    WHERE a.token_mint = p.token_mint AND a.manual_status = 'posted_manual'
  );

-- For mints with multiple pending rows, keep only the newest
DELETE FROM public.holders_intel_post_queue p
USING public.holders_intel_post_queue q
WHERE p.manual_status = 'pending'
  AND q.manual_status = 'pending'
  AND p.token_mint = q.token_mint
  AND p.created_at < q.created_at;

-- Promote the rest
UPDATE public.holders_intel_post_queue
SET
  tweet_text = COALESCE(
    NULLIF(BTRIM(tweet_text), ''),
    '🔍 ' || COALESCE(symbol, 'TOKEN') || ' Holder Analysis' ||
    E'\n\n👉 https://blackbox.farm/holders?token=' || token_mint ||
    E'\n\n@blackbox_farm @HoldersIntel @Dead_Tokens'
  ),
  manual_status = 'posted_manual',
  manual_posted_at = COALESCE(manual_posted_at, now()),
  posted_handle = COALESCE(posted_handle, 'HoldersIntel'),
  banner_used_url = COALESCE(banner_used_url, decorated_banner_url, dex_banner_url),
  error_message = NULL
WHERE manual_status = 'pending';
