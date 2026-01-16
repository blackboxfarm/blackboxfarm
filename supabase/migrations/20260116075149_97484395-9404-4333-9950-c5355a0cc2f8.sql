-- Add column to track the original sender wallet for refunds
ALTER TABLE banner_orders 
ADD COLUMN IF NOT EXISTS payment_sender_wallet TEXT;

COMMENT ON COLUMN banner_orders.payment_sender_wallet IS 'The wallet address that sent the payment, used for automatic refunds';