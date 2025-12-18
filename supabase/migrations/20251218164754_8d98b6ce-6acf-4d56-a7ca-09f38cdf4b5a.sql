-- Fix: banner_ads.weight is constrained to 1..10, so keep paid ads at max weight=10
DO $$
DECLARE
  v_order_id UUID := '52f88430-c9b6-4738-8b99-a1328e51ae71';
BEGIN
  UPDATE public.banner_orders bo
  SET
    duration_hours = 24,
    end_time = (bo.start_time + INTERVAL '24 hours'),
    is_active = (now() >= bo.start_time AND now() <= (bo.start_time + INTERVAL '24 hours')),
    updated_at = now()
  WHERE bo.id = v_order_id;

  UPDATE public.banner_ads ba
  SET
    start_date = bo.start_time,
    end_date = (bo.start_time + INTERVAL '24 hours'),
    is_active = true,
    weight = 10,
    updated_at = now()
  FROM public.banner_orders bo
  WHERE bo.id = v_order_id
    AND ba.id = bo.banner_ad_id;
END $$;