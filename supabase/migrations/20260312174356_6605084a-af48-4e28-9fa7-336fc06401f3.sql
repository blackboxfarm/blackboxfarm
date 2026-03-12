-- Add phanes_queried_at and phanes_data columns to x_account_registry for tracking Phanes bot queries
ALTER TABLE public.x_account_registry 
  ADD COLUMN IF NOT EXISTS phanes_queried_at timestamptz,
  ADD COLUMN IF NOT EXISTS phanes_data jsonb,
  ADD COLUMN IF NOT EXISTS phanes_recycled_accounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS phanes_username_history jsonb DEFAULT '[]'::jsonb;