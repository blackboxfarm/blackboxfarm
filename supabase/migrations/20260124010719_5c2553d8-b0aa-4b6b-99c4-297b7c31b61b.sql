-- Create table for Intel XBot and Share templates
CREATE TABLE public.holders_intel_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL UNIQUE CHECK (template_name IN ('small', 'large', 'shares')),
  template_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.holders_intel_templates ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read templates (needed for public share button)
CREATE POLICY "Templates are publicly readable"
ON public.holders_intel_templates
FOR SELECT
USING (true);

-- Only super admins can modify templates
CREATE POLICY "Super admins can manage templates"
ON public.holders_intel_templates
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Insert default templates
INSERT INTO public.holders_intel_templates (template_name, template_text, is_active, description) VALUES
('small', '🔍 ${ticker} Holder Analysis

📊 {totalWallets} Total | ✅ {realHolders} Real
{dustPct}% Dust | Health: {healthGrade}

👉 blackbox.farm/holders?token={ca}', true, 'Compact format for Intel XBot automatic posts'),

('large', '🔎 Holder Analysis: ${ticker}

CA: {ca}

Health: {healthGrade} ({healthScore}/100)

📊 {totalWallets} Total Wallets
✅ {realHolders} Real Holders
{dustPct}% are dust wallets

🐋 {whales} Whales (>$1K)
💼 {serious} Serious ($200-$1K)
🌱 {retail} Retail ($1-$199)
💨 {dust} Dust (<$1)

Free report 👉 blackbox.farm/holders?token={ca}', false, 'Detailed format for Intel XBot automatic posts'),

('shares', '🔎 Holder Analysis: ${ticker}

CA: {ca}

Health: {healthGrade} ({healthScore}/100)

📊 {totalWallets} Total Wallets
✅ {realHolders} Real Holders
{dustPct}% are dust wallets

🐋 {whales} Whales (>$1K)
💼 {serious} Serious ($200-$1K)
🌱 {retail} Retail ($1-$199)
💨 {dust} Dust (<$1)

Analyze any token 👉 blackbox.farm/holders', true, 'Template for public Share button');

-- Trigger to update updated_at
CREATE TRIGGER update_holders_intel_templates_updated_at
BEFORE UPDATE ON public.holders_intel_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();