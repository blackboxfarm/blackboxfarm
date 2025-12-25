-- Create telegram_session table for MTProto session storage
CREATE TABLE public.telegram_session (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    session_string TEXT NOT NULL,
    phone_number TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create telegram_channel_calls table for detected token calls
CREATE TABLE public.telegram_channel_calls (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    message_id BIGINT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    token_name TEXT,
    raw_message TEXT,
    contains_ape BOOLEAN DEFAULT false,
    price_at_call NUMERIC,
    market_cap_at_call NUMERIC,
    mint_age_minutes INTEGER,
    buy_tier TEXT, -- 'large' ($100/10x) or 'standard' ($50/5x)
    buy_amount_usd NUMERIC,
    sell_multiplier NUMERIC,
    status TEXT DEFAULT 'detected', -- 'detected', 'bought', 'watching', 'sold', 'skipped', 'failed'
    skip_reason TEXT,
    position_id UUID, -- FK to flip_positions
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    buy_tx_signature TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(channel_id, message_id, token_mint)
);

-- Create telegram_channel_config table for monitoring configuration
CREATE TABLE public.telegram_channel_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    is_active BOOLEAN DEFAULT true,
    -- Trading rules
    ape_keyword_enabled BOOLEAN DEFAULT true,
    min_price_threshold NUMERIC DEFAULT 0.00002, -- Below this = large buy
    max_price_threshold NUMERIC DEFAULT 0.00004, -- Above this = standard buy
    large_buy_amount_usd NUMERIC DEFAULT 100,
    standard_buy_amount_usd NUMERIC DEFAULT 50,
    large_sell_multiplier NUMERIC DEFAULT 10,
    standard_sell_multiplier NUMERIC DEFAULT 5,
    max_mint_age_minutes INTEGER DEFAULT 60, -- Only trade tokens minted within this window
    -- Wallet to use
    flipit_wallet_id UUID,
    -- Notifications
    email_notifications BOOLEAN DEFAULT true,
    notification_email TEXT,
    -- Stats
    total_calls_detected INTEGER DEFAULT 0,
    total_buys_executed INTEGER DEFAULT 0,
    last_check_at TIMESTAMP WITH TIME ZONE,
    last_message_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, channel_id)
);

-- Enable RLS
ALTER TABLE public.telegram_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_channel_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_channel_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for telegram_session
CREATE POLICY "Users can view their own sessions" ON public.telegram_session
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions" ON public.telegram_session
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON public.telegram_session
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON public.telegram_session
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for telegram_channel_calls (super admins can see all)
CREATE POLICY "Super admins can view all calls" ON public.telegram_channel_calls
    FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert calls" ON public.telegram_channel_calls
    FOR INSERT WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update calls" ON public.telegram_channel_calls
    FOR UPDATE USING (public.is_super_admin(auth.uid()));

-- RLS Policies for telegram_channel_config
CREATE POLICY "Users can view their own config" ON public.telegram_channel_config
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config" ON public.telegram_channel_config
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config" ON public.telegram_channel_config
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all configs" ON public.telegram_channel_config
    FOR SELECT USING (public.is_super_admin(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_telegram_calls_channel ON public.telegram_channel_calls(channel_id);
CREATE INDEX idx_telegram_calls_token ON public.telegram_channel_calls(token_mint);
CREATE INDEX idx_telegram_calls_status ON public.telegram_channel_calls(status);
CREATE INDEX idx_telegram_calls_created ON public.telegram_channel_calls(created_at DESC);
CREATE INDEX idx_telegram_config_channel ON public.telegram_channel_config(channel_id);
CREATE INDEX idx_telegram_config_active ON public.telegram_channel_config(is_active) WHERE is_active = true;

-- Triggers for updated_at
CREATE TRIGGER update_telegram_session_updated_at
    BEFORE UPDATE ON public.telegram_session
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_calls_updated_at
    BEFORE UPDATE ON public.telegram_channel_calls
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_telegram_config_updated_at
    BEFORE UPDATE ON public.telegram_channel_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();