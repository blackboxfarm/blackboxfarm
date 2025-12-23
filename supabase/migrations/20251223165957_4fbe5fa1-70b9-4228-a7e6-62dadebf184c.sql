-- Allow FlipIt wallets in super_admin_wallets
ALTER TABLE public.super_admin_wallets
  DROP CONSTRAINT IF EXISTS super_admin_wallets_wallet_type_check;

ALTER TABLE public.super_admin_wallets
  ADD CONSTRAINT super_admin_wallets_wallet_type_check
  CHECK (
    wallet_type = ANY (
      ARRAY[
        'treasury'::text,
        'campaign_funding'::text,
        'refund_processing'::text,
        'emergency'::text,
        'flipit'::text
      ]
    )
  );
