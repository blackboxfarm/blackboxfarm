
CREATE TABLE IF NOT EXISTS public.edge_function_registry (
  function_name text PRIMARY KEY,
  description text,
  data_in text,
  data_out text,
  category text DEFAULT 'general',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.edge_function_registry ENABLE ROW LEVEL SECURITY;
