ALTER TABLE public.twitter_tg_targets ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

UPDATE public.twitter_tg_targets SET is_archived = true WHERE account_status IN ('deleted', 'suspended');

COMMENT ON COLUMN public.twitter_tg_targets.is_archived IS 'Archived accounts are hidden from default view but prevent re-import via unique handle constraint';