
-- Table for unique per-user Telegram registration codes
CREATE TABLE public.telegram_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_code text NOT NULL UNIQUE,
  telegram_user_id text DEFAULT NULL,
  telegram_username text DEFAULT NULL,
  linked_at timestamptz DEFAULT NULL,
  tier_at_link text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Index for fast code lookups
CREATE INDEX idx_telegram_link_codes_code ON public.telegram_link_codes(link_code);
CREATE INDEX idx_telegram_link_codes_tg_user ON public.telegram_link_codes(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

-- RLS
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Users can read their own code
CREATE POLICY "Users can read own link code" ON public.telegram_link_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own code  
CREATE POLICY "Users can create own link code" ON public.telegram_link_codes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own code
CREATE POLICY "Users can update own link code" ON public.telegram_link_codes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Super admins can read all
CREATE POLICY "Super admins can read all link codes" ON public.telegram_link_codes
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Function to generate a unique link code
CREATE OR REPLACE FUNCTION public.generate_telegram_link_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  -- Check if user already has a code
  SELECT link_code INTO new_code FROM telegram_link_codes WHERE user_id = p_user_id;
  IF new_code IS NOT NULL THEN
    RETURN new_code;
  END IF;
  
  -- Generate unique code (BF-XXXXXX format)
  LOOP
    new_code := 'BF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM telegram_link_codes WHERE link_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  INSERT INTO telegram_link_codes (user_id, link_code) VALUES (p_user_id, new_code);
  RETURN new_code;
END;
$$;

-- Auto-update updated_at
CREATE TRIGGER update_telegram_link_codes_updated_at
  BEFORE UPDATE ON public.telegram_link_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing approved telegram users:
-- For any user in mega_whale_alert_config.additional_telegram_ids that matches
-- a whale_user_wallets entry with a telegram_user_id, auto-create a link code
-- (This is best-effort; exact user mapping may not exist for all)
