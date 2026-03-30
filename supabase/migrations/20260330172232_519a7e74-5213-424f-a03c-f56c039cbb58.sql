
-- Create boosts tracking table
CREATE TABLE public.boost_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  boost_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount INTEGER NOT NULL DEFAULT 0,
  boost_type TEXT NOT NULL,
  link_url TEXT,
  link_label TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.boost_entries ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (admin only table)
CREATE POLICY "Authenticated users can view boosts" ON public.boost_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert boosts" ON public.boost_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update boosts" ON public.boost_entries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete boosts" ON public.boost_entries FOR DELETE TO authenticated USING (true);

-- Timestamp trigger
CREATE TRIGGER update_boost_entries_updated_at
  BEFORE UPDATE ON public.boost_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
