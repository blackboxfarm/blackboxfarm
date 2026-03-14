
-- ============================================================
-- CRITICAL FIX 1: blackbox_wallets - restrict to ownership chain
-- ============================================================
DROP POLICY IF EXISTS "Users can manage their own wallets" ON public.blackbox_wallets;

CREATE POLICY "Users can view their own campaign wallets" ON public.blackbox_wallets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_wallets cw
      JOIN blackbox_campaigns bc ON cw.campaign_id = bc.id
      WHERE cw.wallet_id = blackbox_wallets.id AND bc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM blackbox_contract_wallets bcw
      JOIN blackbox_contracts bcon ON bcw.contract_id = bcon.id
      WHERE bcw.wallet_id = blackbox_wallets.id AND bcon.user_id = auth.uid()
    )
    OR
    public.is_super_admin(auth.uid())
  );

CREATE POLICY "Authenticated users can insert wallets" ON public.blackbox_wallets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own campaign wallets" ON public.blackbox_wallets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_wallets cw
      JOIN blackbox_campaigns bc ON cw.campaign_id = bc.id
      WHERE cw.wallet_id = blackbox_wallets.id AND bc.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can delete their own campaign wallets" ON public.blackbox_wallets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_wallets cw
      JOIN blackbox_campaigns bc ON cw.campaign_id = bc.id
      WHERE cw.wallet_id = blackbox_wallets.id AND bc.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- ============================================================
-- CRITICAL FIX 2: pumpfun_whitelist - fix broken admin check
-- ============================================================
DROP POLICY IF EXISTS "Super admins can manage whitelist" ON public.pumpfun_whitelist;

CREATE POLICY "Super admins can manage whitelist" ON public.pumpfun_whitelist
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- CRITICAL FIX 3: fuct_gift_claims - remove public read of IP/fingerprint data
-- ============================================================
DROP POLICY IF EXISTS "Allow public reads" ON public.fuct_gift_claims;

CREATE POLICY "Super admins can read gift claims" ON public.fuct_gift_claims
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can claim gifts" ON public.fuct_gift_claims;

CREATE POLICY "Authenticated users can claim gifts" ON public.fuct_gift_claims
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- CRITICAL FIX 4: telegram_channel_registry - fix public write access
-- ============================================================
DROP POLICY IF EXISTS "Allow service role full access" ON public.telegram_channel_registry;

CREATE POLICY "Anyone can read channel registry" ON public.telegram_channel_registry
  FOR SELECT USING (true);

CREATE POLICY "Super admins can manage channel registry" ON public.telegram_channel_registry
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- CRITICAL FIX 5: helius_api_usage - fix OR clause data leak
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own API usage" ON public.helius_api_usage;
DROP POLICY IF EXISTS "Service role can read helius usage" ON public.helius_api_usage;

CREATE POLICY "Users can view their own API usage" ON public.helius_api_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));
