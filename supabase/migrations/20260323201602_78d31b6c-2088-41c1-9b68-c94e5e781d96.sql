-- 1. Fix wallet_profiles: restrict SELECT to authenticated only
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'wallet_profiles' AND schemaname = 'public' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wallet_profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated can view wallet profiles"
  ON public.wallet_profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2. Fix telegram_fantasy_positions: scope SELECT to own rows only
DROP POLICY IF EXISTS "Authenticated can view fantasy positions" ON public.telegram_fantasy_positions;

CREATE POLICY "Users can view own fantasy positions"
  ON public.telegram_fantasy_positions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Fix holders_page_visits: remove NULL user_id from UPDATE
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'holders_page_visits' AND schemaname = 'public' AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.holders_page_visits', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can update own visits"
  ON public.holders_page_visits FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());