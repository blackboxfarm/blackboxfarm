-- Auto-generate telegram link code when a new profile is created
CREATE OR REPLACE FUNCTION public.auto_generate_link_code_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_telegram_link_code(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_telegram_link_code ON public.profiles;
CREATE TRIGGER trg_auto_telegram_link_code
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_link_code_on_profile();