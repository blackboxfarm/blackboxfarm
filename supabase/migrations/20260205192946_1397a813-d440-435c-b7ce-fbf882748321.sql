-- Create a settings table for system-wide toggles
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to system_settings"
  ON public.system_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert the telegram broadcast suspension toggle (default: not suspended)
INSERT INTO public.system_settings (key, value, updated_by)
VALUES ('telegram_broadcast_suspended', 'false'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION public.update_system_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_system_settings_timestamp
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_system_settings_timestamp();