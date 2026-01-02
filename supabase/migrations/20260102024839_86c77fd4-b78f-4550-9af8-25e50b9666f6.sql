-- Phase 1.1: Add new columns to pumpfun_watchlist for enhanced filtering

-- Add rejection_type to distinguish soft vs permanent rejects
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS rejection_type TEXT CHECK (rejection_type IN ('soft', 'permanent'));

-- Add dev wallet tracking columns
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS dev_sold BOOLEAN DEFAULT false;

ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS dev_launched_new BOOLEAN DEFAULT false;

-- Add authority validation columns
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS mint_authority_revoked BOOLEAN;

ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS freeze_authority_revoked BOOLEAN;

-- Add single wallet concentration tracking
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS max_single_wallet_pct NUMERIC;

-- Add has_image and socials_count for metadata quality tracking
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS has_image BOOLEAN DEFAULT true;

ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS socials_count INTEGER DEFAULT 0;

-- Add rejection_reason for detailed logging
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS rejection_reasons TEXT[];

-- Update pumpfun_monitor_config with new threshold values
-- First check if columns exist, add if not
DO $$ 
BEGIN
    -- max_ticker_length
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'max_ticker_length') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN max_ticker_length INTEGER DEFAULT 10;
    END IF;
    
    -- require_image
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'require_image') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN require_image BOOLEAN DEFAULT false;
    END IF;
    
    -- min_socials_count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'min_socials_count') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN min_socials_count INTEGER DEFAULT 0;
    END IF;
    
    -- max_single_wallet_pct
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'max_single_wallet_pct') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN max_single_wallet_pct NUMERIC DEFAULT 15;
    END IF;
    
    -- daily_buy_cap
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'daily_buy_cap') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN daily_buy_cap INTEGER DEFAULT 20;
    END IF;
    
    -- max_watchdog_count
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'max_watchdog_count') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN max_watchdog_count INTEGER DEFAULT 500;
    END IF;
    
    -- soft_reject_resurrection_minutes (how long soft rejects can be resurrected)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pumpfun_monitor_config' AND column_name = 'soft_reject_resurrection_minutes') THEN
        ALTER TABLE public.pumpfun_monitor_config ADD COLUMN soft_reject_resurrection_minutes INTEGER DEFAULT 90;
    END IF;
END $$;

-- Create index on rejection_type for faster queries
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_rejection_type 
ON public.pumpfun_watchlist(rejection_type) 
WHERE rejection_type IS NOT NULL;

-- Create index on dev behavior columns
CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_dev_sold 
ON public.pumpfun_watchlist(dev_sold) 
WHERE dev_sold = true;

CREATE INDEX IF NOT EXISTS idx_pumpfun_watchlist_dev_launched_new 
ON public.pumpfun_watchlist(dev_launched_new) 
WHERE dev_launched_new = true;