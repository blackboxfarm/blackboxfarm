-- Add columns for fund sweep and refund tracking
ALTER TABLE banner_orders 
ADD COLUMN IF NOT EXISTS funds_swept_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sweep_tx_signature TEXT,
ADD COLUMN IF NOT EXISTS swept_amount_sol NUMERIC,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refund_tx_signature TEXT,
ADD COLUMN IF NOT EXISTS refund_amount_sol NUMERIC,
ADD COLUMN IF NOT EXISTS clawback_amount_sol NUMERIC,
ADD COLUMN IF NOT EXISTS refund_wallet TEXT;

-- Update payment_status to include 'refunded' as valid status
COMMENT ON COLUMN banner_orders.payment_status IS 'pending, paid, refunded, expired';