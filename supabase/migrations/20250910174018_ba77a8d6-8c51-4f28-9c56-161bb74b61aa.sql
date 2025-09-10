-- Fix the update_blackbox_updated_at function to use the correct column name
CREATE OR REPLACE FUNCTION public.update_blackbox_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;