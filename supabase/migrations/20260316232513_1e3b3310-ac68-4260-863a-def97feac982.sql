-- Remove existing Allstar mint alert spam from the database
DELETE FROM public.admin_notifications
WHERE notification_type = 'allstar_mint';

DELETE FROM public.allstar_mint_alerts;