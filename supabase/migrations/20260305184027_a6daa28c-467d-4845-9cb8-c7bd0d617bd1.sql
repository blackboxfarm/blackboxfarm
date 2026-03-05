
-- Promo tweet templates table
CREATE TABLE public.promo_tweet_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE,
  template_text TEXT NOT NULL DEFAULT '',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_tweet_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to promo_tweet_templates" ON public.promo_tweet_templates FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_promo_tweet_templates_updated_at
BEFORE UPDATE ON public.promo_tweet_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Promo rotation config
CREATE TABLE public.promo_tweet_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  interval_hours INTEGER NOT NULL DEFAULT 3,
  is_running BOOLEAN NOT NULL DEFAULT false,
  last_posted_type TEXT,
  last_posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_tweet_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to promo_tweet_config" ON public.promo_tweet_config FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_promo_tweet_config_updated_at
BEFORE UPDATE ON public.promo_tweet_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 6 promo templates
INSERT INTO public.promo_tweet_templates (template_type, template_text, is_enabled) VALUES
('promo1', E'🔍 Stop trading blind.\n\nHolders Intel gives you X-ray vision into any Solana token''s holder base.\n\n🐋 Whale detection\n📊 Real vs dust holders\n🏥 Health grades\n\n👉 blackbox.farm\n\n#Solana #HoldersIntel #CryptoTools', false),
('promo2', E'🎯 Before you ape in, check the holders.\n\nOur AI-powered analysis shows you:\n✅ Real holder count\n✅ Whale concentration\n✅ Dust wallet %\n✅ Health score\n\nFree to use 👉 blackbox.farm\n\n#Solana #DYOR #CryptoResearch', false),
('promo3', E'🚀 Over 10,000 tokens analyzed.\n\nHolders Intel is the #1 holder analysis tool on Solana.\n\nDon''t get rugged — check the holders first.\n\n🔗 blackbox.farm\n\n#Solana #PumpFun #CryptoSafety', false),
('promo4', E'💡 Pro tip: Tokens with 60%+ dust wallets rarely pump sustainably.\n\nHolders Intel shows you the REAL holder breakdown before you buy.\n\n📊 Free reports at blackbox.farm\n\n#Solana #TradingTips #CryptoAlpha', false),
('promo5', E'🐋 Spotted: New whale accumulation patterns.\n\nOur tools track wallet tiers in real-time:\n• Mega whales (100K+)\n• Whales (10K-100K)\n• Serious holders (1K-10K)\n• Retail & dust\n\n🔍 blackbox.farm\n\n#Solana #WhaleWatch', false),
('promo6', E'⚡ FlipIt - AI-powered paper trading on Solana.\n\nPractice your degen skills with zero risk:\n🎯 AI entry signals\n📈 Auto take-profit\n🏆 Leaderboard rankings\n\nTry it free 👉 blackbox.farm\n\n#Solana #PaperTrading #FlipIt', false);

-- Seed config with single row
INSERT INTO public.promo_tweet_config (interval_hours, is_running) VALUES (3, false);
