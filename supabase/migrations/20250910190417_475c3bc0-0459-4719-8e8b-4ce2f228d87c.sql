-- Manual cleanup for test user 1e81a1f8-b0d8-442c-806c-f5cd956e7459
-- Delete in proper order to avoid foreign key constraints

-- 1. Delete campaign timing records
DELETE FROM public.campaign_timing 
WHERE campaign_id IN (
  SELECT id FROM public.blackbox_campaigns 
  WHERE user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
);

-- 2. Delete campaign notifications
DELETE FROM public.campaign_notifications 
WHERE campaign_id IN (
  SELECT id FROM public.blackbox_campaigns 
  WHERE user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
) AND campaign_type = 'blackbox';

-- 3. Delete blackbox transactions
DELETE FROM public.blackbox_transactions 
WHERE command_code_id IN (
  SELECT bcc.id FROM public.blackbox_command_codes bcc
  JOIN public.blackbox_wallets bw ON bcc.wallet_id = bw.id
  JOIN public.campaign_wallets cw ON cw.wallet_id = bw.id
  JOIN public.blackbox_campaigns bc ON cw.campaign_id = bc.id
  WHERE bc.user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
);

-- 4. Delete command codes
DELETE FROM public.blackbox_command_codes 
WHERE wallet_id IN (
  SELECT bw.id FROM public.blackbox_wallets bw
  JOIN public.campaign_wallets cw ON cw.wallet_id = bw.id
  JOIN public.blackbox_campaigns bc ON cw.campaign_id = bc.id
  WHERE bc.user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
) OR user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459';

-- 5. Delete campaign-wallet relationships
DELETE FROM public.campaign_wallets 
WHERE campaign_id IN (
  SELECT id FROM public.blackbox_campaigns 
  WHERE user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459'
);

-- 6. Finally delete the campaigns
DELETE FROM public.blackbox_campaigns 
WHERE user_id = '1e81a1f8-b0d8-442c-806c-f5cd956e7459';