
CREATE POLICY "Allow anon read on registry" ON public.edge_function_registry FOR SELECT USING (true);
CREATE POLICY "Allow service role full access on registry" ON public.edge_function_registry FOR ALL USING (true) WITH CHECK (true);
