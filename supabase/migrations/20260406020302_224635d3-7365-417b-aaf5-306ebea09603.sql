
-- Add bot flag to channel members
ALTER TABLE public.telegram_channel_members 
  ADD COLUMN IF NOT EXISTS is_bot_account boolean NOT NULL DEFAULT false;

-- Mark ALL existing members as bots (the ~2287 botted accounts)
UPDATE public.telegram_channel_members SET is_bot_account = true;

-- Welcome message config per channel
CREATE TABLE public.telegram_channel_welcome_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE,
  chat_title text,
  is_enabled boolean NOT NULL DEFAULT true,
  welcome_message text NOT NULL DEFAULT E'👋 Welcome to HoldersIntel!\n\n🔍 We provide deep holder analysis, wallet tracing & social identity verification for Solana tokens.\n\n🤖 Try our bot: @holdersintel_bot\n🌐 Full dashboard: blackbox.farm\n\nType /help in the bot DM to get started!',
  suspend_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_channel_welcome_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to welcome config"
  ON public.telegram_channel_welcome_config
  FOR ALL
  USING (true)
  WITH CHECK (true);
