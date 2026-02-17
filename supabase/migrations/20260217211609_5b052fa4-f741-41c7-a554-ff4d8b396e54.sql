
-- 1. Add discovery price gate config columns
ALTER TABLE public.pumpfun_monitor_config 
ADD COLUMN IF NOT EXISTS block_below_discovery_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS block_below_discovery_pct numeric DEFAULT 0;

-- 2. Comment bot tracking tables
CREATE TABLE public.pumpfun_comment_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  tokens_commented_on integer NOT NULL DEFAULT 1,
  total_comments integer NOT NULL DEFAULT 1,
  is_flagged_bot boolean NOT NULL DEFAULT false,
  bot_confidence_score integer DEFAULT 0,
  username_entropy_score numeric DEFAULT 0,
  duplicate_message_count integer NOT NULL DEFAULT 0,
  flagged_reasons text[] DEFAULT '{}',
  linked_creator_wallets text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pumpfun_token_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_mint text NOT NULL,
  token_symbol text,
  username text NOT NULL,
  message text NOT NULL,
  message_hash text NOT NULL,
  comment_age text,
  hearts integer DEFAULT 0,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of_id uuid REFERENCES public.pumpfun_token_comments(id),
  bot_signals text[] DEFAULT '{}',
  account_id uuid REFERENCES public.pumpfun_comment_accounts(id)
);

-- Add comment_bot_score to watchlist
ALTER TABLE public.pumpfun_watchlist 
ADD COLUMN IF NOT EXISTS comment_bot_score integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS comment_scan_at timestamptz DEFAULT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_token_comments_mint ON public.pumpfun_token_comments(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_comments_username ON public.pumpfun_token_comments(username);
CREATE INDEX IF NOT EXISTS idx_token_comments_message_hash ON public.pumpfun_token_comments(message_hash);
CREATE INDEX IF NOT EXISTS idx_comment_accounts_flagged ON public.pumpfun_comment_accounts(is_flagged_bot) WHERE is_flagged_bot = true;
CREATE INDEX IF NOT EXISTS idx_comment_accounts_username ON public.pumpfun_comment_accounts(username);

-- RLS
ALTER TABLE public.pumpfun_comment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumpfun_token_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to comment accounts" ON public.pumpfun_comment_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to token comments" ON public.pumpfun_token_comments FOR ALL USING (true) WITH CHECK (true);
