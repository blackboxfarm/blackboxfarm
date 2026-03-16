UPDATE public.channel_installations 
SET is_paid = true, is_active = true, paid_at = now(), updated_at = now()
WHERE id = 'c77033b0-319a-45da-926e-19915c2efd53';