-- Add column to store the AI-generated composite image with "Paid" badge
ALTER TABLE banner_orders 
ADD COLUMN paid_composite_url TEXT;