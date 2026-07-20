GRANT SELECT ON public.insiders_recap_entries TO anon, authenticated;
GRANT ALL ON public.insiders_recap_entries TO service_role;
DROP POLICY IF EXISTS "Anon can read insiders recap entries" ON public.insiders_recap_entries;
CREATE POLICY "Anon can read insiders recap entries" ON public.insiders_recap_entries FOR SELECT TO anon USING (true);