-- Fix RLS policies for arb_price_snapshots and arb_system_health

-- Enable RLS on arb_price_snapshots
ALTER TABLE arb_price_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read access for price snapshots (anyone can view market data)
CREATE POLICY "Anyone can view price snapshots"
  ON arb_price_snapshots
  FOR SELECT
  USING (true);

-- Only service role can insert price snapshots
CREATE POLICY "Service role can insert price snapshots"
  ON arb_price_snapshots
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- Enable RLS on arb_system_health
ALTER TABLE arb_system_health ENABLE ROW LEVEL SECURITY;

-- Public read access for system health (transparency)
CREATE POLICY "Anyone can view system health"
  ON arb_system_health
  FOR SELECT
  USING (true);

-- Only service role can insert health records
CREATE POLICY "Service role can insert health records"
  ON arb_system_health
  FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');