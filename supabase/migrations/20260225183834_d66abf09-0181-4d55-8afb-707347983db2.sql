
-- Create a table to store audit results persistently
CREATE TABLE IF NOT EXISTS public.creator_audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  batch_offset integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 100,
  total_checked integer NOT NULL DEFAULT 0,
  matches integer NOT NULL DEFAULT 0,
  mismatches integer NOT NULL DEFAULT 0,
  unreachable integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  contamination_rate numeric,
  sample_mismatches jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Allow super admins to read
ALTER TABLE public.creator_audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read audit results"
  ON public.creator_audit_results
  FOR SELECT
  USING (public.is_super_admin(auth.uid()));
