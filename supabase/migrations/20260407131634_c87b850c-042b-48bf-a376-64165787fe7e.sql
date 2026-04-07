UPDATE public.channel_installations
SET is_paid = true, is_active = true, updated_at = now()
WHERE kicked = false AND (is_paid = false OR is_active = false);