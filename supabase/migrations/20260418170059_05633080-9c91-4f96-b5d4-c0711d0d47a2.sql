-- Rename the insiders channel
UPDATE public.telegram_channel_config
SET channel_name = 'insiders'
WHERE channel_id = '-1003694579312';

-- Delete all channels except -1003282110418 (Iceds House of Degeneracy)
-- Also delete the duplicate raw-ID row for -1003282110418, keeping the named one
DELETE FROM public.telegram_channel_config
WHERE channel_id <> '-1003282110418'
   OR channel_name = '-1003282110418';