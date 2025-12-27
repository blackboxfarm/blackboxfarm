-- Create table for FlipIt tweet templates
CREATE TABLE public.flipit_tweet_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_type TEXT NOT NULL UNIQUE CHECK (template_type IN ('buy', 'sell', 'rebuy')),
  template_text TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flipit_tweet_templates ENABLE ROW LEVEL SECURITY;

-- Super admins can manage templates
CREATE POLICY "Super admins can manage tweet templates"
ON public.flipit_tweet_templates
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Service role can read for edge functions
CREATE POLICY "Service role can read templates"
ON public.flipit_tweet_templates
FOR SELECT
USING (true);

-- Insert default templates
INSERT INTO public.flipit_tweet_templates (template_type, template_text) VALUES
('buy', '🎯 FLIP IT: Just entered ${{TOKEN_SYMBOL}}

💰 Entry: ${{ENTRY_PRICE}}
🎯 Target: {{TARGET_MULTIPLIER}}x
📊 Amount: {{AMOUNT_SOL}} SOL

Let''s see if this one prints! 🚀

#Solana #{{TOKEN_SYMBOL}} #FlipIt'),

('sell', '{{PROFIT_EMOJI}} FLIP IT CLOSED: ${{TOKEN_SYMBOL}}

💰 Entry: ${{ENTRY_PRICE}}
💵 Exit: ${{EXIT_PRICE}}
{{RESULT_EMOJI}} PnL: {{PROFIT_SIGN}}{{PROFIT_PERCENT}}% ({{PROFIT_SIGN}}{{PROFIT_SOL}} SOL)

{{RESULT_MESSAGE}}

#Solana #{{TOKEN_SYMBOL}} #FlipIt'),

('rebuy', '🔄 FLIP IT REBUY: ${{TOKEN_SYMBOL}}

💰 New Entry: ${{ENTRY_PRICE}}
🎯 Target: {{TARGET_MULTIPLIER}}x
📊 Amount: {{AMOUNT_SOL}} SOL

Back in for another round! 🎰

#Solana #{{TOKEN_SYMBOL}} #FlipIt');

-- Create trigger for updated_at
CREATE TRIGGER update_flipit_tweet_templates_updated_at
BEFORE UPDATE ON public.flipit_tweet_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();