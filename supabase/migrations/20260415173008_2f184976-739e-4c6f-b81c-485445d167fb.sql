
CREATE OR REPLACE FUNCTION public.count_distinct_tg_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT telegram_user_id)
  FROM public.telegram_bot_interactions
  WHERE telegram_user_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.count_registered_tg_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT telegram_user_id)
  FROM public.telegram_bot_interactions
  WHERE telegram_user_id IS NOT NULL
    AND linked_user_id IS NOT NULL;
$$;
