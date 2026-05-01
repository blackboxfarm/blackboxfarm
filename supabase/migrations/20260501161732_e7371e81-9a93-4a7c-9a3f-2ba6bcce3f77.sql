CREATE OR REPLACE FUNCTION public.get_telegram_announcement_recipients(p_audiences text[])
RETURNS TABLE (
  telegram_user_id text,
  linked_user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH private_users AS (
    SELECT
      tbi.telegram_user_id,
      (array_agg(tbi.linked_user_id ORDER BY tbi.created_at DESC) FILTER (WHERE tbi.linked_user_id IS NOT NULL))[1] AS linked_user_id
    FROM public.telegram_bot_interactions tbi
    WHERE tbi.chat_type = 'private'
      AND tbi.telegram_user_id IS NOT NULL
    GROUP BY tbi.telegram_user_id
  ),
  hosted_admins AS (
    SELECT DISTINCT ci.user_id
    FROM public.channel_installations ci
    WHERE ci.is_active = true
      AND ci.user_id IS NOT NULL
  ),
  subscribers AS (
    SELECT DISTINCT sc.matched_user_id AS user_id
    FROM public.stripe_customers sc
    WHERE sc.is_active = true
      AND sc.matched_user_id IS NOT NULL
  )
  SELECT pu.telegram_user_id, pu.linked_user_id
  FROM private_users pu
  LEFT JOIN hosted_admins ha ON ha.user_id = pu.linked_user_id
  LEFT JOIN subscribers sub ON sub.user_id = pu.linked_user_id
  WHERE EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_audiences, ARRAY[]::text[])) audience
    WHERE
      (audience = 'hosted' AND ha.user_id IS NOT NULL)
      OR (audience IN ('accounts', 'all_registered') AND pu.linked_user_id IS NOT NULL AND ha.user_id IS NULL)
      OR (audience = 'subscribers_only' AND pu.linked_user_id IS NOT NULL AND sub.user_id IS NOT NULL AND ha.user_id IS NULL)
      OR (audience = 'free_only' AND pu.linked_user_id IS NOT NULL AND sub.user_id IS NULL AND ha.user_id IS NULL)
      OR (audience = 'unregistered' AND pu.linked_user_id IS NULL)
  )
  ORDER BY pu.telegram_user_id;
$$;

CREATE OR REPLACE FUNCTION public.count_telegram_announcement_recipients(p_audiences text[])
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM public.get_telegram_announcement_recipients(p_audiences);
$$;

CREATE OR REPLACE FUNCTION public.count_distinct_tg_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT telegram_user_id)
  FROM public.telegram_bot_interactions
  WHERE chat_type = 'private'
    AND telegram_user_id IS NOT NULL;
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
  WHERE chat_type = 'private'
    AND telegram_user_id IS NOT NULL
    AND linked_user_id IS NOT NULL;
$$;