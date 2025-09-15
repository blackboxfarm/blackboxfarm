-- Create wallet positions table to track token holdings
CREATE TABLE public.wallet_positions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    balance NUMERIC NOT NULL DEFAULT 0,
    average_buy_price NUMERIC,
    total_invested_usd NUMERIC NOT NULL DEFAULT 0,
    first_purchase_at TIMESTAMP WITH TIME ZONE,
    last_transaction_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(wallet_address, token_mint)
);

-- Create wallet copy configurations table
CREATE TABLE public.wallet_copy_configs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    monitored_wallet_id UUID NOT NULL REFERENCES public.monitored_wallets(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    is_fantasy_mode BOOLEAN NOT NULL DEFAULT false,
    new_buy_amount_usd NUMERIC NOT NULL DEFAULT 100,
    rebuy_amount_usd NUMERIC NOT NULL DEFAULT 10,
    copy_sell_percentage BOOLEAN NOT NULL DEFAULT true,
    max_daily_trades INTEGER DEFAULT 50,
    max_position_size_usd NUMERIC DEFAULT 1000,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, monitored_wallet_id)
);

-- Create copy trades table to log all executed trades
CREATE TABLE public.copy_trades (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    copy_config_id UUID NOT NULL REFERENCES public.wallet_copy_configs(id) ON DELETE CASCADE,
    original_transaction_id UUID REFERENCES public.wallet_transactions(id),
    original_wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    trade_type TEXT NOT NULL, -- 'new_buy', 'rebuy', 'sell'
    amount_usd NUMERIC NOT NULL,
    amount_sol NUMERIC,
    token_amount NUMERIC,
    price_per_token NUMERIC,
    sell_percentage NUMERIC, -- for sell trades
    is_fantasy BOOLEAN NOT NULL DEFAULT false,
    executed_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'executed', 'failed'
    transaction_signature TEXT,
    error_message TEXT,
    profit_loss_usd NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create fantasy wallets table
CREATE TABLE public.fantasy_wallets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    balance_usd NUMERIC NOT NULL DEFAULT 10000,
    total_invested NUMERIC NOT NULL DEFAULT 0,
    total_profit_loss NUMERIC NOT NULL DEFAULT 0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    win_rate NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Create fantasy positions table  
CREATE TABLE public.fantasy_positions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    fantasy_wallet_id UUID NOT NULL REFERENCES public.fantasy_wallets(id) ON DELETE CASCADE,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    token_name TEXT,
    balance NUMERIC NOT NULL DEFAULT 0,
    average_buy_price NUMERIC,
    total_invested_usd NUMERIC NOT NULL DEFAULT 0,
    current_value_usd NUMERIC DEFAULT 0,
    profit_loss_usd NUMERIC DEFAULT 0,
    profit_loss_percentage NUMERIC DEFAULT 0,
    first_purchase_at TIMESTAMP WITH TIME ZONE,
    last_transaction_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(fantasy_wallet_id, token_mint)
);

-- Enable RLS on all new tables
ALTER TABLE public.wallet_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_copy_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_positions ENABLE ROW LEVEL SECURITY;

-- RLS policies for wallet_positions (readable by everyone for monitoring)
CREATE POLICY "Wallet positions are publicly readable" ON public.wallet_positions
    FOR SELECT USING (true);

-- RLS policies for wallet_copy_configs
CREATE POLICY "Users can manage their own copy configs" ON public.wallet_copy_configs
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS policies for copy_trades
CREATE POLICY "Users can view their own copy trades" ON public.copy_trades
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS policies for fantasy_wallets
CREATE POLICY "Users can manage their own fantasy wallet" ON public.fantasy_wallets
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS policies for fantasy_positions
CREATE POLICY "Users can view their own fantasy positions" ON public.fantasy_positions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.fantasy_wallets fw
            WHERE fw.id = fantasy_positions.fantasy_wallet_id 
            AND fw.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.fantasy_wallets fw
            WHERE fw.id = fantasy_positions.fantasy_wallet_id 
            AND fw.user_id = auth.uid()
        )
    );

-- Add triggers for updated_at columns
CREATE TRIGGER update_wallet_positions_updated_at
    BEFORE UPDATE ON public.wallet_positions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallet_copy_configs_updated_at
    BEFORE UPDATE ON public.wallet_copy_configs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fantasy_wallets_updated_at
    BEFORE UPDATE ON public.fantasy_wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fantasy_positions_updated_at
    BEFORE UPDATE ON public.fantasy_positions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_wallet_positions_wallet_token ON public.wallet_positions(wallet_address, token_mint);
CREATE INDEX idx_wallet_positions_wallet ON public.wallet_positions(wallet_address);
CREATE INDEX idx_copy_trades_user_config ON public.copy_trades(user_id, copy_config_id);
CREATE INDEX idx_copy_trades_original_tx ON public.copy_trades(original_transaction_id);
CREATE INDEX idx_fantasy_positions_wallet ON public.fantasy_positions(fantasy_wallet_id);
CREATE INDEX idx_copy_trades_created_at ON public.copy_trades(created_at DESC);