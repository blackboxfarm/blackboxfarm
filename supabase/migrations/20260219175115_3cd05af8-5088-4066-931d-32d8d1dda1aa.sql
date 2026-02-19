
-- Fantasy tweet templates for X Community posts
CREATE TABLE public.fantasy_tweet_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE CHECK (template_type IN ('buy', 'sell')),
  template_text TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  post_to_community BOOLEAN NOT NULL DEFAULT true,
  post_to_main_feed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fantasy_tweet_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to fantasy_tweet_templates" ON public.fantasy_tweet_templates FOR ALL USING (true) WITH CHECK (true);

-- Insert default templates
INSERT INTO public.fantasy_tweet_templates (template_type, template_text) VALUES
('buy', E'🤖 ALPHA DETECTED — ${{TOKEN_SYMBOL}}\n\n⚡ AI Signal Lock\n💰 Entry: ${{ENTRY_PRICE}}\n🎯 Target: {{TARGET_MULTIPLIER}}x\n📊 Position: {{AMOUNT_SOL}} SOL\n👥 Holders: {{HOLDERS}} | MCap: ${{MCAP}}\n\n🔗 https://pump.fun/coin/{{TOKEN_CA}}\n\n#Solana #PumpFun #{{TOKEN_SYMBOL}}'),
('sell', E'{{PROFIT_EMOJI}} TARGET LOCKED — ${{TOKEN_SYMBOL}}\n\n🏆 {{RESULT_MESSAGE}}\n💰 Entry: ${{ENTRY_PRICE}}\n💵 Exit: ${{EXIT_PRICE}} ({{MULTIPLIER}}x)\n📈 P&L: {{PROFIT_SIGN}}{{PROFIT_SOL}} SOL ({{PROFIT_SIGN}}{{PROFIT_PERCENT}}%)\n⏱️ Hold: {{HOLD_DURATION}}\n\n🔗 https://pump.fun/coin/{{TOKEN_CA}}\n\n#Solana #PumpFun #{{TOKEN_SYMBOL}}');

-- Trigger for updated_at
CREATE TRIGGER update_fantasy_tweet_templates_updated_at
BEFORE UPDATE ON public.fantasy_tweet_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
