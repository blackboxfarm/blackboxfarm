ALTER TABLE holders_intel_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access on holders_intel_config" ON holders_intel_config FOR ALL USING (true) WITH CHECK (true);